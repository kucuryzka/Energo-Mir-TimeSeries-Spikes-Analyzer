using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using API.DTOs;
using API.Infrastructure;
using API.Services;
using API.Sql;
using Core.Enums;
using Core.Interfaces;
using Core.Models;
using Microsoft.EntityFrameworkCore;

namespace API.DataSources;

public class EmProtocolDataSource : IDataSourceStrategy
{
    private readonly DataSourceConnectionResolver _connectionResolver;
    private readonly AnalysisPipelineService _pipeline;
    private readonly IDatabaseContextFactory _contextFactory;
    private readonly ISqlDialectProvider _dialectProvider;

    public EmProtocolDataSource(
        DataSourceConnectionResolver connectionResolver,
        AnalysisPipelineService pipeline,
        IDatabaseContextFactory contextFactory,
        ISqlDialectProvider dialectProvider)
    {
        _connectionResolver = connectionResolver;
        _pipeline = pipeline;
        _contextFactory = contextFactory;
        _dialectProvider = dialectProvider;
    }

    public string Id => "em_protocol";
    public string Name => "em_protocol";
    public string[] SupportedDistributions => new[] { "EventCode" };

    private (string ConnectionString, string Provider) ResolveConnection(string? connectionString, string? provider) =>
        _connectionResolver.Resolve(connectionString, provider);

    private AnalysisTableSpec BuildTableSpec(IDatabaseDialect dialect) => new()
    {
        Schema = "em_protocol",
        Table = "Records",
        TimeColumn = "InsertTime",
        ChannelColumn = "ChannelId",
        FromClause = dialect.QualifyFromTable("em_protocol", "Records", "r"),
        TableAlias = "r",
        ChannelLookup = BuildEmChannelLookup(dialect),
    };

    private static ChannelLookupSpec BuildEmChannelLookup(IDatabaseDialect dialect)
    {
        const string channelAlias = "ch";
        var eventCodeText = dialect.CastAsText($"{channelAlias}.{dialect.QuoteIdentifier("EventCode")}");
        var objects = dialect.QualifyFromTable("dbo", "OBJECTS", "obj");
        var displayName = dialect.Concat(
            $"obj.{dialect.QuoteIdentifier("OBJECT_NAME")}",
            "' ('",
            eventCodeText,
            "')'");

        return new ChannelLookupSpec
        {
            Schema = "em_protocol",
            Table = "Channels",
            IdColumn = "Id",
            NameColumn = "Id",
            EventCodeColumn = "EventCode",
            AdditionalJoinClause =
                $" LEFT JOIN {objects} ON {channelAlias}.{dialect.QuoteIdentifier("ObjectId")} = obj.{dialect.QuoteIdentifier("IDGLOBAL")}",
            DisplayNameExpression = displayName,
        };
    }

    public Task<SpikeResponse> ExecuteAnalysisAsync(
        DetectSpikesRequest request,
        ISpikeDetectionService spikeDetectionService,
        string connectionString,
        string provider,
        IProgress<int>? progress = null,
        Action<IReadOnlyList<DataPoint>>? onBatchAggregated = null,
        Func<AnalysisBatchCompletedDto, Task>? onBatchCompleted = null,
        Action<long>? onFinalizeCompleted = null,
        AnalysisResumeState? resume = null,
        CancellationToken cancellationToken = default)
    {
        var dialect = _dialectProvider.GetDialect(provider);
        return _pipeline.ExecuteAsync(
            BuildTableSpec(dialect),
            request.StartDate,
            request.EndDate,
            request.Granularity,
            request.CustomMinutes,
            request.ChannelId,
            request.Confidence,
            request.WindowSize,
            spikeDetectionService,
            connectionString,
            provider,
            request.Database,
            progress,
            onBatchAggregated,
            onBatchCompleted,
            onFinalizeCompleted,
            resume,
            cancellationToken);
    }

    public Task<List<ChannelContributionDto>> GetPointChannelBreakdownAsync(
        string database,
        DateTime timestamp,
        TimeGranularity granularity,
        int? customMinutes,
        int? channelId,
        string? connectionString = null,
        string? provider = null)
    {
        var (conn, prov) = ResolveConnection(connectionString, provider);
        var dialect = _dialectProvider.GetDialect(prov);
        return _pipeline.GetPointChannelBreakdownAsync(
            BuildTableSpec(dialect),
            timestamp,
            granularity,
            customMinutes,
            channelId,
            conn,
            prov,
            database);
    }

    public async Task<List<ChannelDto>> GetChannelsAsync(string database, string? search, int page = 1, int pageSize = 50)
    {
        var (conn, prov) = ResolveConnection(null, null);
        var dialect = _dialectProvider.GetDialect(prov);
        using var context = _contextFactory.Create(conn, prov, database);

        var channels = dialect.QualifyFromTable("em_protocol", "Channels", "c");
        var objects = dialect.QualifyFromTable("dbo", "OBJECTS", "o");
        var eventCodeExpr = dialect.CastAsText($"c.{dialect.QuoteIdentifier("EventCode")}");
        var nameExpr = dialect.Concat(
            $"o.{dialect.QuoteIdentifier("OBJECT_NAME")}",
            "' ('",
            eventCodeExpr,
            "')'");

        var sql = $@"
            SELECT c.{dialect.QuoteIdentifier("Id")} AS Id,
                   {nameExpr} AS Name,
                   {eventCodeExpr} AS EventCode
            FROM {channels}
            JOIN {objects} ON c.{dialect.QuoteIdentifier("ObjectId")} = o.{dialect.QuoteIdentifier("IDGLOBAL")}";

        var parameters = new List<object>();
        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += $" WHERE o.{dialect.QuoteIdentifier("OBJECT_NAME")} LIKE {{0}} OR {eventCodeExpr} LIKE {{0}}";
            parameters.Add($"%{search}%");
        }

        sql = dialect.Paginate(
            sql + $" ORDER BY o.{dialect.QuoteIdentifier("OBJECT_NAME")}",
            (page - 1) * pageSize,
            pageSize);

        return await context.Database.SqlQueryRaw<ChannelDto>(sql, parameters.ToArray()).ToListAsync();
    }

    public async Task<List<DistributionItemDto>> GetDistributionAsync(string database, DateTime start, DateTime end, string categoryName)
    {
        if (categoryName != "EventCode")
            return new List<DistributionItemDto>();

        var (conn, prov) = ResolveConnection(null, null);
        var dialect = _dialectProvider.GetDialect(prov);
        using var context = _contextFactory.Create(conn, prov, database);

        var records = dialect.QualifyFromTable("em_protocol", "Records", "r");
        var channels = dialect.QualifyFromTable("em_protocol", "Channels", "c");
        var eventCodeExpr = dialect.CastAsText($"c.{dialect.QuoteIdentifier("EventCode")}");

        var sql = $@"
            SELECT {eventCodeExpr} AS Category, {dialect.LargeCountAggregateExpression} AS Count
            FROM {records}
            JOIN {channels} ON r.{dialect.QuoteIdentifier("ChannelId")} = c.{dialect.QuoteIdentifier("Id")}
            WHERE r.{dialect.QuoteIdentifier("InsertTime")} >= @p0 AND r.{dialect.QuoteIdentifier("InsertTime")} <= @p1
            GROUP BY {eventCodeExpr}
            ORDER BY Count DESC";

        return await context.Database.SqlQueryRaw<DistributionItemDto>(sql, start, end).ToListAsync();
    }
}
