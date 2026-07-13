using API.Configuration;
using API.DTOs;
using API.Services;
using API.Sql;
using Core.Enums;
using Core.Interfaces;
using Core.Models;
using Dapper;
using Microsoft.Extensions.Options;

using API.Contracts;

namespace API.DataSources;

public class EmProtocolDataSource : IDataSourceStrategy
{
    private readonly SessionContextService _session;
    private readonly AnalysisPipelineService _pipeline;
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly int _commandTimeoutSeconds;

    public EmProtocolDataSource(
        SessionContextService session,
        AnalysisPipelineService pipeline,
        ISqlDialectProvider dialectProvider,
        IOptions<AnalysisSettings> settings
    )
    {
        _session = session;
        _pipeline = pipeline;
        _dialectProvider = dialectProvider;
        _commandTimeoutSeconds = settings.Value.CommandTimeoutSeconds;
    }

    public string Id => "em_protocol";
    public string Name => "em_protocol";
    public string[] SupportedDistributions => new[] { "EventCode" };

    private (string ConnectionString, DatabaseProviderKind Provider) ResolveConnection(string? connectionString, DatabaseProviderKind? provider) =>
        _session.ResolveConnection(connectionString, provider);

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
            "')'"
        );

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
        DatabaseProviderKind provider,
        IProgress<int>? progress = null,
        Action<IReadOnlyList<DataPoint>>? onBatchAggregated = null,
        Func<AnalysisBatchCompletedDto, Task>? onBatchCompleted = null,
        Action<long>? onFinalizeCompleted = null,
        AnalysisResumeState? resume = null,
        CancellationToken cancellationToken = default
    )
    {
        var dialect = _dialectProvider.GetDialect(provider);
        return _pipeline.ExecuteAsync(
            new AnalysisPipelineRequest(
                Spec: BuildTableSpec(dialect),
                Window: new AnalysisWindow(request.StartDate, request.EndDate, request.Granularity, request.CustomMinutes),
                Detection: new AnalysisDetection(spikeDetectionService, request.Confidence, request.WindowSize),
                Connection: new AnalysisConnection(connectionString, provider, request.Database, request.ChannelId),
                Hooks: new AnalysisPipelineHooks(progress, onBatchAggregated, onBatchCompleted, onFinalizeCompleted),
                Resume: resume
            ),
            cancellationToken
        );
    }

    public Task<List<ChannelContributionDto>> GetPointChannelBreakdownAsync(
        string database,
        DateTime timestamp,
        TimeGranularity granularity,
        int? customMinutes,
        int? channelId,
        string? connectionString = null,
        DatabaseProviderKind? provider = null
    )
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
            database
        );
    }

    public async Task<List<ChannelDto>> GetChannelsAsync(string database, string? search, int page = 1, int pageSize = 50)
    {
        var (connStr, prov) = ResolveConnection(null, null);
        var dialect = _dialectProvider.GetDialect(prov);
        var targetConn = DatabaseConnectionHelper.WithDatabase(connStr, database);
        await using var connection = DatabaseProvider.OpenConnection(prov, targetConn);
        await connection.OpenAsync();

        var channels = dialect.QualifyFromTable("em_protocol", "Channels", "c");
        var objects = dialect.QualifyFromTable("dbo", "OBJECTS", "o");
        var eventCodeExpr = dialect.CastAsText($"c.{dialect.QuoteIdentifier("EventCode")}");
        var nameExpr = dialect.Concat(
            $"o.{dialect.QuoteIdentifier("OBJECT_NAME")}",
            "' ('",
            eventCodeExpr,
            "')'"
        );

        var sql = $@"
            SELECT c.{dialect.QuoteIdentifier("Id")} AS Id,
                   {nameExpr} AS Name,
                   {eventCodeExpr} AS EventCode
            FROM {channels}
            JOIN {objects} ON c.{dialect.QuoteIdentifier("ObjectId")} = o.{dialect.QuoteIdentifier("IDGLOBAL")}";

        object? args = null;
        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += $" WHERE o.{dialect.QuoteIdentifier("OBJECT_NAME")} LIKE @p0 OR {eventCodeExpr} LIKE @p0";
            args = new { p0 = $"%{search}%" };
        }

        sql = dialect.Paginate(
            sql + $" ORDER BY o.{dialect.QuoteIdentifier("OBJECT_NAME")}",
            (page - 1) * pageSize,
            pageSize
        );

        var rows = await connection.QueryAsync<ChannelDto>(
            new CommandDefinition(sql, args, commandTimeout: _commandTimeoutSeconds)
        );
        return rows.AsList();
    }

    public async Task<List<DistributionItemDto>> GetDistributionAsync(
        string database,
        DateTime start,
        DateTime end,
        string categoryName,
        string? connectionString = null,
        DatabaseProviderKind? provider = null
    )
    {
        if (categoryName != "EventCode")
            return new List<DistributionItemDto>();

        var (connStr, prov) = ResolveConnection(connectionString, provider);
        var dialect = _dialectProvider.GetDialect(prov);
        var targetConn = DatabaseConnectionHelper.WithDatabase(connStr, database);
        await using var connection = DatabaseProvider.OpenConnection(prov, targetConn);
        await connection.OpenAsync();

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

        var rows = await connection.QueryAsync<DistributionItemDto>(
            new CommandDefinition(sql, new { p0 = start, p1 = end }, commandTimeout: _commandTimeoutSeconds)
        );
        return rows.AsList();
    }
}
