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

public class DboDataSource : IDataSourceStrategy
{
    private readonly SessionContextService _session;
    private readonly AnalysisPipelineService _pipeline;
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly int _commandTimeoutSeconds;

    public DboDataSource(
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

    public string Id => "dbo";
    public string Name => "dbo";
    public string[] SupportedDistributions => Array.Empty<string>();

    private (string ConnectionString, DatabaseProviderKind Provider) ResolveConnection(string? connectionString, DatabaseProviderKind? provider) =>
        _session.ResolveConnection(connectionString, provider);

    private AnalysisTableSpec BuildTableSpec(IDatabaseDialect dialect) => new()
    {
        Schema = "dbo",
        Table = "METERINGS",
        TimeColumn = "TIME_INSERT",
        ChannelColumn = "IDOBJECT",
        FromClause = dialect.QualifyFromTable("dbo", "METERINGS", "m"),
        TableAlias = "m",
        ChannelLookup = new ChannelLookupSpec
        {
            Schema = "dbo",
            Table = "OBJECTS",
            IdColumn = "IDOBJECT",
            NameColumn = "OBJECT_NAME",
        },
        DeferDistribution = true,
    };

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
        var spec = BuildTableSpec(dialect);
        return _pipeline.ExecuteAsync(
            new AnalysisPipelineRequest(
                Spec: spec,
                Window: new AnalysisWindow(request.StartDate, request.EndDate, request.Granularity, request.CustomMinutes),
                Detection: new AnalysisDetection(spikeDetectionService, request.Confidence, request.WindowSize),
                Connection: new AnalysisConnection(connectionString, provider, request.Database, request.ChannelId),
                Hooks: new AnalysisPipelineHooks(progress, onBatchAggregated, onBatchCompleted, onFinalizeCompleted),
                Resume: resume
            ),
            cancellationToken
        );
    }

    public Task<List<ChannelContributionDto>> GetObjectDistributionAsync(
        string database,
        DateTime startDate,
        DateTime endDate,
        int? channelId = null,
        string? connectionString = null,
        DatabaseProviderKind? provider = null
    )
    {
        var (conn, prov) = ResolveConnection(connectionString, provider);
        var dialect = _dialectProvider.GetDialect(prov);
        return _pipeline.GetDistributionAsync(
            BuildTableSpec(dialect),
            startDate,
            endDate,
            channelId,
            conn,
            prov,
            database
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

    public async Task<List<ObjectDto>> GetObjectsAsync(string database, string? search, int page = 1, int pageSize = 50)
    {
        var (connStr, prov) = ResolveConnection(null, null);
        var dialect = _dialectProvider.GetDialect(prov);
        var targetConn = DatabaseConnectionHelper.WithDatabase(connStr, database);
        await using var connection = DatabaseProvider.OpenConnection(prov, targetConn);
        await connection.OpenAsync();

        var table = dialect.QualifyFromTable("dbo", "OBJECTS");
        var sql = $"SELECT {dialect.QualifyColumn(null, "IDOBJECT")} AS Id, {dialect.QualifyColumn(null, "OBJECT_NAME")} AS Name FROM {table}";
        object? args = null;

        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += $" WHERE {dialect.QualifyColumn(null, "OBJECT_NAME")} LIKE @p0";
            args = new { p0 = $"%{search}%" };
        }

        sql = dialect.Paginate(
            sql + $" ORDER BY {dialect.QualifyColumn(null, "OBJECT_NAME")}",
            (page - 1) * pageSize,
            pageSize
        );

        var rows = await connection.QueryAsync<ObjectDto>(
            new CommandDefinition(sql, args, commandTimeout: _commandTimeoutSeconds)
        );
        return rows.AsList();
    }

    public async Task<List<MeteringInfoDto>> GetPointDetailsAsync(
        string database,
        DateTime timestamp,
        TimeGranularity granularity,
        int? customMinutes,
        int? channelId,
        string? connectionString = null,
        DatabaseProviderKind? provider = null
    )
    {
        var (connStr, prov) = ResolveConnection(connectionString, provider);
        var dialect = _dialectProvider.GetDialect(prov);
        var targetConn = DatabaseConnectionHelper.WithDatabase(connStr, database);
        await using var connection = DatabaseProvider.OpenConnection(prov, targetConn);
        await connection.OpenAsync();

        var endDate = GranularityHelper.GetBucketEnd(timestamp, granularity, customMinutes);

        var meterings = dialect.QualifyFromTable("dbo", "METERINGS", "m");
        var objects = dialect.QualifyFromTable("dbo", "OBJECTS", "o");
        var channelFilter = channelId.HasValue ? $" AND m.{dialect.QuoteIdentifier("IDOBJECT")} = @p2" : "";
        var selectList = $@"
                    m.{dialect.QuoteIdentifier("IDOBJECT_AGGREGATE")} AS IdObjectAggregate,
                    m.{dialect.QuoteIdentifier("IDOBJECT_AVERAGE")} AS IdObjectAverage,
                    m.{dialect.QuoteIdentifier("QUALITY")} AS Quality,
                    m.{dialect.QuoteIdentifier("QUALITY_SOURCE")} AS QualitySource,
                    m.{dialect.QuoteIdentifier("SOURCE")} AS Source,
                    m.{dialect.QuoteIdentifier("VALUE_METERING")} AS ValueMetering,
                    m.{dialect.QuoteIdentifier("IDOBJECT")} AS IdObject,
                    o.{dialect.QuoteIdentifier("OBJECT_NAME")} AS ObjectName";
        var fromClause = $@"
                {meterings}
                LEFT JOIN {objects} ON m.{dialect.QuoteIdentifier("IDOBJECT")} = o.{dialect.QuoteIdentifier("IDOBJECT")}";
        var whereClause = $@"m.{dialect.QuoteIdentifier("TIME_INSERT")} >= @p0 AND m.{dialect.QuoteIdentifier("TIME_INSERT")} < @p1{channelFilter}";
        var sql = dialect.BuildLimitedSelect(selectList, fromClause, whereClause, 1000);

        object args = channelId.HasValue
            ? new { p0 = timestamp, p1 = endDate, p2 = channelId.Value }
            : new { p0 = timestamp, p1 = endDate };

        var rows = await connection.QueryAsync<MeteringInfoDto>(
            new CommandDefinition(sql, args, commandTimeout: _commandTimeoutSeconds)
        );
        return rows.AsList();
    }
}
