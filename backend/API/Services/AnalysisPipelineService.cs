using System.Diagnostics;
using API.Configuration;
using API.DataSources;
using API.DTOs;
using API.Sql;
using Core.Enums;
using Core.Interfaces;
using Core.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace API.Services;

public class AnalysisPipelineService
{
    private readonly IDatabaseContextFactory _contextFactory;
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly AnalysisSettings _settings;

    public AnalysisPipelineService(
        IDatabaseContextFactory contextFactory,
        ISqlDialectProvider dialectProvider,
        IOptions<AnalysisSettings> settings)
    {
        _contextFactory = contextFactory;
        _dialectProvider = dialectProvider;
        _settings = settings.Value;
    }

    public async Task<SpikeResponse> ExecuteAsync(
        AnalysisTableSpec spec,
        DateTime startDate,
        DateTime endDate,
        TimeGranularity granularity,
        int? customMinutes,
        int? channelId,
        double confidence,
        int windowSize,
        ISpikeDetectionService spikeDetectionService,
        string connectionString,
        string provider,
        string database,
        IProgress<int>? progress = null,
        Action<IReadOnlyList<Core.Models.DataPoint>>? onBatchAggregated = null,
        Action<AnalysisBatchCompletedDto>? onBatchCompleted = null,
        Action<long>? onFinalizeCompleted = null,
        CancellationToken cancellationToken = default)
    {
        var dialect = _dialectProvider.GetDialect(provider);
        using var context = _contextFactory.Create(connectionString, provider, database);

        var fromClause = spec.FromClause ?? dialect.QualifyFromTable(spec.Schema, spec.Table, spec.TableAlias);
        var timeCol = dialect.QualifyColumn(spec.TableAlias, spec.TimeColumn);
        var timeExpr = dialect.GetTimeBucketExpression(timeCol, granularity, customMinutes);

        var seriesDict = new Dictionary<DateTime, DataPoint>();
        var distributionDict = new Dictionary<int, int>();
        var distributionNames = new Dictionary<int, string>();

        var seriesSql = BuildSeriesSql(dialect, fromClause, timeExpr, timeCol, spec, channelId);
        var usePerBatchDistribution = spec.ChannelColumn != null
            && !channelId.HasValue
            && !spec.DeferDistribution
            && !spec.OmitDistribution;
        var distributionSql = usePerBatchDistribution
            ? BuildDistributionSql(dialect, fromClause, timeCol, spec)
            : null;

        var currentStart = startDate;
        var totalDays = Math.Max((endDate - startDate).TotalDays, 1);
        var daysProcessed = 0.0;
        var batchDays = Math.Max(_settings.BatchIntervalDays, 1);
        var totalBatches = Math.Max(1, (int)Math.Ceiling(totalDays / batchDays));
        var batchIndex = 0;

        while (currentStart < endDate)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var currentEnd = currentStart.AddDays(batchDays);
            if (currentEnd > endDate) currentEnd = endDate;

            var batchSw = Stopwatch.StartNew();
            var parameters = BuildBatchParameters(currentStart, currentEnd, channelId);
            var batchSeries = await context.Database
                .SqlQueryRaw<AggregatedResult>(seriesSql, parameters.ToArray())
                .ToListAsync();

            MergeSeriesBatch(seriesDict, batchSeries);

            if (distributionSql != null)
            {
                var batchDist = await context.Database
                    .SqlQueryRaw<AggregatedResult>(distributionSql, parameters.ToArray())
                    .ToListAsync();
                MergeDistributionBatch(distributionDict, distributionNames, batchDist);
            }

            daysProcessed += (currentEnd - currentStart).TotalDays;
            progress?.Report(Math.Min(99, (int)(daysProcessed / totalDays * 100)));

            onBatchAggregated?.Invoke(seriesDict.Values.OrderBy(p => p.Timestamp).ToList());

            batchSw.Stop();
            onBatchCompleted?.Invoke(new AnalysisBatchCompletedDto
            {
                BatchIndex = batchIndex,
                TotalBatches = totalBatches,
                DurationMs = batchSw.ElapsedMilliseconds,
                SeriesPointCount = seriesDict.Count,
            });
            batchIndex++;

            await context.Database.CloseConnectionAsync();

            currentStart = currentEnd;
        }

        var finalizeSw = Stopwatch.StartNew();
        var groupedSeries = seriesDict.Values.OrderBy(p => p.Timestamp).ToList();
        var anomalyResults = spikeDetectionService.DetectSpikes(groupedSeries, confidence, windowSize);

        List<ChannelContributionDto> distribution;
        if (spec.OmitDistribution)
        {
            distribution = new List<ChannelContributionDto>();
        }
        else if (spec.ChannelColumn != null && !channelId.HasValue && spec.DeferDistribution)
        {
            cancellationToken.ThrowIfCancellationRequested();
            distribution = await LoadDistributionAsync(
                context, dialect, fromClause, timeCol, spec, startDate, endDate);
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
                })
                .ToList();
        }

        finalizeSw.Stop();
        onFinalizeCompleted?.Invoke(finalizeSw.ElapsedMilliseconds);

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
        string provider,
        string database,
        CancellationToken cancellationToken = default)
    {
        if (spec.ChannelColumn == null || channelId.HasValue)
            return new List<ChannelContributionDto>();

        var dialect = _dialectProvider.GetDialect(provider);
        using var context = _contextFactory.Create(connectionString, provider, database);
        var fromClause = spec.FromClause ?? dialect.QualifyFromTable(spec.Schema, spec.Table, spec.TableAlias);
        var timeCol = dialect.QualifyColumn(spec.TableAlias, spec.TimeColumn);

        return await LoadDistributionAsync(
            context, dialect, fromClause, timeCol, spec, startDate, endDate);
    }

    public async Task<List<ChannelContributionDto>> GetPointChannelBreakdownAsync(
        AnalysisTableSpec spec,
        DateTime timestamp,
        TimeGranularity granularity,
        int? customMinutes,
        int? channelId,
        string connectionString,
        string provider,
        string database)
    {
        if (spec.ChannelColumn == null)
            return new List<ChannelContributionDto>();

        var dialect = _dialectProvider.GetDialect(provider);
        using var context = _contextFactory.Create(connectionString, provider, database);

        var fromClause = spec.FromClause ?? dialect.QualifyFromTable(spec.Schema, spec.Table, spec.TableAlias);
        var timeCol = dialect.QualifyColumn(spec.TableAlias, spec.TimeColumn);
        var channelCol = dialect.QualifyColumn(spec.TableAlias, spec.ChannelColumn);
        var endDate = GetBucketEnd(timestamp, granularity, customMinutes);

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

        var parameters = BuildBatchParameters(timestamp, endDate, channelId);
        var rows = await context.Database.SqlQueryRaw<AggregatedResult>(sql, parameters.ToArray()).ToListAsync();

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

    private static async Task<List<ChannelContributionDto>> LoadDistributionAsync(
        DbContext context,
        IDatabaseDialect dialect,
        string fromClause,
        string timeCol,
        AnalysisTableSpec spec,
        DateTime startDate,
        DateTime endDate)
    {
        var sql = BuildDistributionSql(dialect, fromClause, timeCol, spec);
        var rows = await context.Database
            .SqlQueryRaw<AggregatedResult>(sql, startDate, endDate)
            .ToListAsync();

        return rows
            .Where(r => r.ChannelId.HasValue && r.ChannelId.Value != 0)
            .OrderByDescending(r => r.Value)
            .Select(r => new ChannelContributionDto
            {
                ChannelId = r.ChannelId!.Value,
                Count = r.Value,
                ChannelName = r.ChannelName ?? string.Empty,
            })
            .ToList();
    }

    private static string BuildSeriesSql(
        IDatabaseDialect dialect,
        string fromClause,
        string timeExpr,
        string timeCol,
        AnalysisTableSpec spec,
        int? channelId)
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
        AnalysisTableSpec spec)
    {
        var channelCol = dialect.QualifyColumn(spec.TableAlias, spec.ChannelColumn!);
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
            WHERE {timeCol} >= @p0 AND {timeCol} < @p1
            GROUP BY {channelCol}{nameGroupBy}{eventCodeGroupBy}";
    }

    private sealed record ChannelLookupJoin(
        string JoinClause,
        string NameExpression,
        string? EventCodeExpression = null,
        string? EventCodeGroupBy = null);

    private static ChannelLookupJoin? BuildChannelLookupJoin(
        IDatabaseDialect dialect,
        AnalysisTableSpec spec,
        string channelCol)
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
            eventCodeExpr);
    }

    private static List<object> BuildBatchParameters(DateTime start, DateTime end, int? channelId)
    {
        var parameters = new List<object> { start, end };
        if (channelId.HasValue) parameters.Add(channelId.Value);
        return parameters;
    }

    private static void MergeSeriesBatch(Dictionary<DateTime, DataPoint> dict, List<AggregatedResult> batch)
    {
        foreach (var row in batch)
        {
            if (dict.TryGetValue(row.Timestamp, out var existing))
                existing.Value += row.Value;
            else
                dict[row.Timestamp] = new DataPoint { Timestamp = row.Timestamp, Value = row.Value };
        }
    }

    private static void MergeDistributionBatch(
        Dictionary<int, int> dict,
        Dictionary<int, string> names,
        List<AggregatedResult> batch)
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
        }
    }

    private static DateTime GetBucketEnd(DateTime timestamp, TimeGranularity granularity, int? customMinutes) =>
        granularity switch
        {
            TimeGranularity.Minute => timestamp.AddMinutes(1),
            TimeGranularity.Hour => timestamp.AddHours(1),
            TimeGranularity.Day => timestamp.AddDays(1),
            TimeGranularity.Week => timestamp.AddDays(7),
            TimeGranularity.Month => timestamp.AddMonths(1),
            TimeGranularity.Custom => timestamp.AddMinutes(customMinutes ?? 60),
            _ => timestamp.AddHours(1)
        };
}
