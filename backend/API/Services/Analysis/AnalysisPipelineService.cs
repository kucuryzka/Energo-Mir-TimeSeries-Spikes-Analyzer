using System.Data.Common;
using System.Diagnostics;
using API.Configuration;
using API.DataSources;
using API.DTOs;
using API.Sql;
using Core.Enums;
using Core.Interfaces;
using Core.Models;
using Dapper;
using Microsoft.Extensions.Options;

using API.Contracts;

namespace API.Services.Analysis;

public class AnalysisPipelineService
{
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly AnalysisSettings _settings;

    public AnalysisPipelineService(
        ISqlDialectProvider dialectProvider,
        IOptions<AnalysisSettings> settings
    )
    {
        _dialectProvider = dialectProvider;
        _settings = settings.Value;
    }

    public async Task<SpikeResponse> ExecuteAsync(
        AnalysisPipelineRequest request,
        CancellationToken cancellationToken = default
    )
    {
        var window = request.Window;
        var connectionInfo = request.Connection;
        var detection = request.Detection;
        var hooks = request.Hooks;

        var dialect = _dialectProvider.GetDialect(connectionInfo.Provider);
        var timeout = _settings.CommandTimeoutSeconds;
        var targetConn = DatabaseConnectionHelper.WithDatabase(connectionInfo.ConnectionString, connectionInfo.Database);
        await using var connection = DatabaseProvider.OpenConnection(connectionInfo.Provider, targetConn);
        await connection.OpenAsync(cancellationToken);

        var fromClause = request.Spec.FromClause
            ?? dialect.QualifyFromTable(request.Spec.Schema, request.Spec.Table, request.Spec.TableAlias);
        var timeCol = dialect.QualifyColumn(request.Spec.TableAlias, request.Spec.TimeColumn);
        var timeExpr = dialect.GetTimeBucketExpression(timeCol, window.Granularity, window.CustomMinutes);

        var seriesDict = new Dictionary<DateTime, DataPoint>();
        var distributionDict = new Dictionary<int, int>();
        var distributionNames = new Dictionary<int, string>();
        var distributionEventCodes = new Dictionary<int, string>();

        if (request.Resume?.SeedSeries != null)
        {
            foreach (var point in request.Resume.SeedSeries)
                seriesDict[point.Timestamp] = new DataPoint { Timestamp = point.Timestamp, Value = point.Value };
        }

        var seriesSql = BuildSeriesSql(dialect, fromClause, timeExpr, timeCol, request.Spec, connectionInfo.ChannelId);
        var usePerBatchDistribution = request.Spec.ChannelColumn != null
            && !connectionInfo.ChannelId.HasValue
            && !request.Spec.DeferDistribution
            && !request.Spec.OmitDistribution;
        var distributionSql = usePerBatchDistribution
            ? BuildDistributionSql(dialect, fromClause, timeCol, request.Spec)
            : null;

        var currentStart = window.StartDate;
        var totalDays = Math.Max((window.EndDate - window.StartDate).TotalDays, 1);
        var daysProcessed = 0.0;
        var batchDays = Math.Max(_settings.BatchIntervalDays, 1);
        var totalBatches = Math.Max(1, (int)Math.Ceiling(totalDays / batchDays));
        var batchIndex = 0;

        var resumeFrom = request.Resume?.ProcessedUntil;
        if (resumeFrom.HasValue && resumeFrom.Value > window.StartDate)
        {
            currentStart = resumeFrom.Value < window.EndDate ? resumeFrom.Value : window.EndDate;
            daysProcessed = Math.Min((currentStart - window.StartDate).TotalDays, totalDays);
            batchIndex = Math.Min(totalBatches, (int)Math.Floor(daysProcessed / batchDays));

            if (usePerBatchDistribution && currentStart > window.StartDate)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var priorDist = await QueryAggregatedAsync(
                    connection,
                    distributionSql!,
                    BuildBatchArgs(window.StartDate, currentStart, connectionInfo.ChannelId),
                    timeout,
                    cancellationToken
                );
                MergeDistributionBatch(distributionDict, distributionNames, distributionEventCodes, priorDist);
            }
        }

        while (currentStart < window.EndDate)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var currentEnd = currentStart.AddDays(batchDays);
            if (currentEnd > window.EndDate) currentEnd = window.EndDate;

            var batchSw = Stopwatch.StartNew();
            var args = BuildBatchArgs(currentStart, currentEnd, connectionInfo.ChannelId);
            var batchSeries = await QueryAggregatedAsync(connection, seriesSql, args, timeout, cancellationToken);

            MergeSeriesBatch(seriesDict, batchSeries);

            if (distributionSql != null)
            {
                var batchDist = await QueryAggregatedAsync(connection, distributionSql, args, timeout, cancellationToken);
                MergeDistributionBatch(distributionDict, distributionNames, distributionEventCodes, batchDist);
            }

            daysProcessed += (currentEnd - currentStart).TotalDays;
            var progressPercent = Math.Min(99, (int)(daysProcessed / totalDays * 100));
            hooks?.Progress?.Report(progressPercent);

            batchSw.Stop();
            if (hooks?.OnBatchAggregated != null)
            {
                var orderedSeries = seriesDict.Values.OrderBy(p => p.Timestamp).ToList();
                hooks.OnBatchAggregated.Invoke(orderedSeries);
            }

            if (hooks?.OnBatchCompleted != null)
            {
                var batchPoints = batchSeries
                    .Select(r => new DataPoint { Timestamp = r.Timestamp, Value = r.Value })
                    .OrderBy(p => p.Timestamp)
                    .ToList();

                await hooks.OnBatchCompleted(new AnalysisBatchCompletedDto
                {
                    BatchIndex = batchIndex,
                    TotalBatches = totalBatches,
                    DurationMs = batchSw.ElapsedMilliseconds,
                    SeriesPointCount = seriesDict.Count,
                    BatchEndExclusive = currentEnd,
                    ProgressPercent = progressPercent,
                    BatchPoints = batchPoints,
                });
            }
            batchIndex++;

            currentStart = currentEnd;
        }

        var finalizeSw = Stopwatch.StartNew();
        var groupedSeries = seriesDict.Values.OrderBy(p => p.Timestamp).ToList();
        var anomalyResults = detection.SpikeDetectionService.DetectSpikes(
            groupedSeries, detection.Confidence, detection.WindowSize
        );

        List<ChannelContributionDto> distribution;
        if (request.Spec.OmitDistribution)
        {
            distribution = new List<ChannelContributionDto>();
        }
        else if (request.Spec.ChannelColumn != null && !connectionInfo.ChannelId.HasValue && request.Spec.DeferDistribution)
        {
            cancellationToken.ThrowIfCancellationRequested();
            distribution = await LoadDistributionAsync(
                connection,
                dialect,
                fromClause,
                timeCol,
                request.Spec,
                window.StartDate,
                window.EndDate,
                connectionInfo.ChannelId,
                timeout,
                cancellationToken
            );
        }
        else
        {
            distribution = distributionDict
                .OrderByDescending(kv => kv.Value)
                .Select(kv => new ChannelContributionDto
                {
                    ChannelId = kv.Key,
                    Count = kv.Value,
                    ChannelName = distributionNames.GetValueOrDefault(kv.Key, string.Empty),
                    EventCode = distributionEventCodes.GetValueOrDefault(kv.Key),
                })
                .ToList();
        }

        finalizeSw.Stop();
        hooks?.OnFinalizeCompleted?.Invoke(finalizeSw.ElapsedMilliseconds);

        return new SpikeResponse
        {
            Series = anomalyResults.Select(r => new AnomalyResultDto
            {
                Timestamp = r.Timestamp,
                Value = r.Value,
                IsSpike = r.IsSpike,
                PValue = r.PValue
            }).ToList(),
            Distribution = distribution
        };
    }

    public async Task<List<ChannelContributionDto>> GetDistributionAsync(
        AnalysisTableSpec spec,
        DateTime startDate,
        DateTime endDate,
        int? channelId,
        string connectionString,
        DatabaseProviderKind provider,
        string database,
        CancellationToken cancellationToken = default
    )
    {
        if (spec.ChannelColumn == null)
            return new List<ChannelContributionDto>();

        var dialect = _dialectProvider.GetDialect(provider);
        var timeout = _settings.CommandTimeoutSeconds;
        var targetConn = DatabaseConnectionHelper.WithDatabase(connectionString, database);
        await using var connection = DatabaseProvider.OpenConnection(provider, targetConn);
        await connection.OpenAsync(cancellationToken);

        var fromClause = spec.FromClause ?? dialect.QualifyFromTable(spec.Schema, spec.Table, spec.TableAlias);
        var timeCol = dialect.QualifyColumn(spec.TableAlias, spec.TimeColumn);

        return await LoadDistributionAsync(
            connection, dialect, fromClause, timeCol, spec, startDate, endDate, channelId, timeout, cancellationToken
        );
    }

    public async Task<List<ChannelContributionDto>> GetPointChannelBreakdownAsync(
        AnalysisTableSpec spec,
        DateTime timestamp,
        TimeGranularity granularity,
        int? customMinutes,
        int? channelId,
        string connectionString,
        DatabaseProviderKind provider,
        string database
    )
    {
        if (spec.ChannelColumn == null)
            return new List<ChannelContributionDto>();

        var dialect = _dialectProvider.GetDialect(provider);
        var timeout = _settings.CommandTimeoutSeconds;
        var targetConn = DatabaseConnectionHelper.WithDatabase(connectionString, database);
        await using var connection = DatabaseProvider.OpenConnection(provider, targetConn);
        await connection.OpenAsync();

        var fromClause = spec.FromClause ?? dialect.QualifyFromTable(spec.Schema, spec.Table, spec.TableAlias);
        var timeCol = dialect.QualifyColumn(spec.TableAlias, spec.TimeColumn);
        var channelCol = dialect.QualifyColumn(spec.TableAlias, spec.ChannelColumn);
        var endDate = GranularityHelper.GetBucketEnd(timestamp, granularity, customMinutes);

        var channelFilter = channelId.HasValue ? $" AND {channelCol} = @p2" : "";
        var lookup = BuildChannelLookupJoin(dialect, spec, channelCol);
        var nameSelect = lookup != null
            ? $", {lookup.NameExpression} AS ChannelName"
            : ", NULL AS ChannelName";
        var nameGroupBy = lookup != null ? $", {lookup.NameExpression}" : "";
        var eventCodeSelect = lookup?.EventCodeExpression != null
            ? $", {lookup.EventCodeExpression} AS EventCode"
            : ", NULL AS EventCode";
        var eventCodeGroupBy = lookup?.EventCodeGroupBy != null ? $", {lookup.EventCodeGroupBy}" : "";

        var sql = $@"
            SELECT {dialect.NullTimestampExpression} AS Timestamp, {dialect.CountAggregateExpression} AS Value, {channelCol} AS ChannelId{nameSelect}{eventCodeSelect}
            FROM {fromClause}{lookup?.JoinClause ?? string.Empty}
            WHERE {timeCol} >= @p0 AND {timeCol} < @p1{channelFilter}
            GROUP BY {channelCol}{nameGroupBy}{eventCodeGroupBy}
            ORDER BY Value DESC";

        var rows = await QueryAggregatedAsync(
            connection,
            sql,
            BuildBatchArgs(timestamp, endDate, channelId),
            timeout
        );

        return rows
            .Where(r => r.ChannelId.HasValue)
            .Select(r => new ChannelContributionDto
            {
                ChannelId = r.ChannelId!.Value,
                Count = r.Value,
                ChannelName = r.ChannelName ?? string.Empty,
                EventCode = r.EventCode,
            })
            .ToList();
    }

    private async Task<List<ChannelContributionDto>> LoadDistributionAsync(
        DbConnection connection,
        IDatabaseDialect dialect,
        string fromClause,
        string timeCol,
        AnalysisTableSpec spec,
        DateTime startDate,
        DateTime endDate,
        int? channelId,
        int timeout,
        CancellationToken cancellationToken = default
    )
    {
        var sql = BuildDistributionSql(dialect, fromClause, timeCol, spec, channelId);
        var rows = await QueryAggregatedAsync(
            connection,
            sql,
            BuildBatchArgs(startDate, endDate, channelId),
            timeout,
            cancellationToken
        );

        return rows
            .Where(r => r.ChannelId.HasValue && r.ChannelId.Value != 0)
            .OrderByDescending(r => r.Value)
            .Select(r => new ChannelContributionDto
            {
                ChannelId = r.ChannelId!.Value,
                Count = r.Value,
                ChannelName = r.ChannelName ?? string.Empty,
                EventCode = r.EventCode,
            })
            .ToList();
    }

    private static async Task<List<AggregatedResult>> QueryAggregatedAsync(
        DbConnection connection,
        string sql,
        object args,
        int timeout,
        CancellationToken cancellationToken = default
    )
    {
        var rows = await connection.QueryAsync<AggregatedResult>(
            new CommandDefinition(sql, args, commandTimeout: timeout, cancellationToken: cancellationToken)
        );
        return rows.AsList();
    }

    private static string BuildSeriesSql(
        IDatabaseDialect dialect,
        string fromClause,
        string timeExpr,
        string timeCol,
        AnalysisTableSpec spec,
        int? channelId
    )
    {
        var channelFilter = "";
        if (channelId.HasValue && spec.ChannelColumn != null)
        {
            var channelCol = dialect.QualifyColumn(spec.TableAlias, spec.ChannelColumn);
            channelFilter = $" AND {channelCol} = @p2";
        }

        return $@"
            SELECT {timeExpr} AS Timestamp, {dialect.CountAggregateExpression} AS Value, 0 AS ChannelId, NULL AS ChannelName, NULL AS EventCode
            FROM {fromClause}
            WHERE {timeCol} >= @p0 AND {timeCol} < @p1{channelFilter}
            GROUP BY {timeExpr}
            ORDER BY Timestamp";
    }

    private static string BuildDistributionSql(
        IDatabaseDialect dialect,
        string fromClause,
        string timeCol,
        AnalysisTableSpec spec,
        int? channelId = null
    )
    {
        var channelCol = dialect.QualifyColumn(spec.TableAlias, spec.ChannelColumn!);
        var channelFilter = channelId.HasValue ? $" AND {channelCol} = @p2" : "";
        var lookup = BuildChannelLookupJoin(dialect, spec, channelCol);
        var nameSelect = lookup != null
            ? $", {lookup.NameExpression} AS ChannelName"
            : ", NULL AS ChannelName";
        var nameGroupBy = lookup != null ? $", {lookup.NameExpression}" : "";
        var eventCodeSelect = lookup?.EventCodeExpression != null
            ? $", {lookup.EventCodeExpression} AS EventCode"
            : ", NULL AS EventCode";
        var eventCodeGroupBy = lookup?.EventCodeGroupBy != null ? $", {lookup.EventCodeGroupBy}" : "";

        return $@"
            SELECT {dialect.NullTimestampExpression} AS Timestamp, {dialect.CountAggregateExpression} AS Value, {channelCol} AS ChannelId{nameSelect}{eventCodeSelect}
            FROM {fromClause}{lookup?.JoinClause ?? string.Empty}
            WHERE {timeCol} >= @p0 AND {timeCol} < @p1{channelFilter}
            GROUP BY {channelCol}{nameGroupBy}{eventCodeGroupBy}";
    }

    private sealed record ChannelLookupJoin(
        string JoinClause,
        string NameExpression,
        string? EventCodeExpression = null,
        string? EventCodeGroupBy = null
    );

    private static ChannelLookupJoin? BuildChannelLookupJoin(
        IDatabaseDialect dialect,
        AnalysisTableSpec spec,
        string channelCol
    )
    {
        if (spec.ChannelLookup == null)
            return null;

        const string lookupAlias = "ch";
        var lookupTable = dialect.QualifyFromTable(spec.ChannelLookup.Schema, spec.ChannelLookup.Table, lookupAlias);
        var lookupId = $"{lookupAlias}.{dialect.QuoteIdentifier(spec.ChannelLookup.IdColumn)}";
        var lookupNameRaw = $"{lookupAlias}.{dialect.QuoteIdentifier(spec.ChannelLookup.NameColumn)}";
        var lookupName = !string.IsNullOrEmpty(spec.ChannelLookup.DisplayNameExpression)
            ? spec.ChannelLookup.DisplayNameExpression
            : dialect.CastAsText(lookupNameRaw);
        string? eventCodeExpr = null;
        if (!string.IsNullOrEmpty(spec.ChannelLookup.EventCodeColumn))
        {
            var eventCodeCol = $"{lookupAlias}.{dialect.QuoteIdentifier(spec.ChannelLookup.EventCodeColumn)}";
            eventCodeExpr = dialect.CastAsText(eventCodeCol);
        }

        var joinClause = $" LEFT JOIN {lookupTable} ON {channelCol} = {lookupId}";
        if (!string.IsNullOrEmpty(spec.ChannelLookup.AdditionalJoinClause))
            joinClause += spec.ChannelLookup.AdditionalJoinClause;

        return new ChannelLookupJoin(
            joinClause,
            lookupName,
            eventCodeExpr,
            eventCodeExpr
        );
    }

    private static object BuildBatchArgs(DateTime start, DateTime end, int? channelId) =>
        channelId.HasValue
            ? new { p0 = start, p1 = end, p2 = channelId.Value }
            : new { p0 = start, p1 = end };

    private static void MergeSeriesBatch(Dictionary<DateTime, DataPoint> dict, List<AggregatedResult> batch)
    {
        foreach (var row in batch)
        {
            dict[row.Timestamp] = new DataPoint { Timestamp = row.Timestamp, Value = row.Value };
        }
    }

    private static void MergeDistributionBatch(
        Dictionary<int, int> dict,
        Dictionary<int, string> names,
        Dictionary<int, string> eventCodes,
        List<AggregatedResult> batch
    )
    {
        foreach (var row in batch)
        {
            if (!row.ChannelId.HasValue || row.ChannelId.Value == 0) continue;
            if (dict.TryGetValue(row.ChannelId.Value, out var existing))
                dict[row.ChannelId.Value] = existing + row.Value;
            else
                dict[row.ChannelId.Value] = row.Value;

            if (!string.IsNullOrWhiteSpace(row.ChannelName))
                names[row.ChannelId.Value] = row.ChannelName;

            if (!string.IsNullOrWhiteSpace(row.EventCode))
                eventCodes[row.ChannelId.Value] = row.EventCode;
        }
    }
}
