using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using API.DTOs;
using API.Services;
using API.Sql;
using Core.Enums;
using Core.Interfaces;
using Core.Models;
using Microsoft.EntityFrameworkCore;

namespace API.DataSources;

public class DboDataSource : IDataSourceStrategy, ISupportsPointChannels
{
    private readonly IConnectionManagerService _connectionManager;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly AnalysisPipelineService _pipeline;
    private readonly IDatabaseContextFactory _contextFactory;
    private readonly ISqlDialectProvider _dialectProvider;

    public DboDataSource(
        IConnectionManagerService connectionManager,
        IHttpContextAccessor httpContextAccessor,
        AnalysisPipelineService pipeline,
        IDatabaseContextFactory contextFactory,
        ISqlDialectProvider dialectProvider)
    {
        _connectionManager = connectionManager;
        _httpContextAccessor = httpContextAccessor;
        _pipeline = pipeline;
        _contextFactory = contextFactory;
        _dialectProvider = dialectProvider;
    }

    public string Id => "Dbo";
    public string Name => "dbo";
    public string[] SupportedDistributions => Array.Empty<string>();

    private (string ConnectionString, string Provider) ResolveConnection(string? connectionString, string? provider)
    {
        if (connectionString != null && provider != null)
            return (connectionString, provider);

        var token = _httpContextAccessor.HttpContext?.Request.Headers["X-Session-Token"].ToString();
        var info = _connectionManager.GetConnectionInfo(token ?? "");
        if (info == null) throw new InvalidOperationException("Invalid or missing session token");
        return (info.ConnectionString, info.Provider);
    }

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
        OmitDistribution = true,
    };

    public Task<SpikeResponse> ExecuteAnalysisAsync(
        DetectSpikesRequest request,
        ISpikeDetectionService spikeDetectionService,
        string connectionString,
        string provider,
        IProgress<int>? progress = null,
        Action<IReadOnlyList<DataPoint>>? onBatchAggregated = null,
        Action<AnalysisBatchCompletedDto>? onBatchCompleted = null,
        Action<long>? onFinalizeCompleted = null,
        CancellationToken cancellationToken = default)
    {
        var dialect = _dialectProvider.GetDialect(provider);
        var spec = BuildTableSpec(dialect);
        return _pipeline.ExecuteAsync(
            spec,
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
            cancellationToken);
    }

    public Task<List<ChannelContributionDto>> GetObjectDistributionAsync(
        string database,
        DateTime startDate,
        DateTime endDate,
        int? channelId = null,
        string? connectionString = null,
        string? provider = null)
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
            database);
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

    public async Task<List<ObjectDto>> GetObjectsAsync(string database, string? search, int page = 1, int pageSize = 50)
    {
        var (conn, prov) = ResolveConnection(null, null);
        var dialect = _dialectProvider.GetDialect(prov);
        using var context = _contextFactory.Create(conn, prov, database);

        var table = dialect.QualifyFromTable("dbo", "OBJECTS");
        var sql = $"SELECT {dialect.QualifyColumn(null, "IDOBJECT")} AS Id, {dialect.QualifyColumn(null, "OBJECT_NAME")} AS Name FROM {table}";
        var parameters = new List<object>();

        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += $" WHERE {dialect.QualifyColumn(null, "OBJECT_NAME")} LIKE {{0}}";
            parameters.Add($"%{search}%");
        }

        sql = dialect.Paginate(
            sql + $" ORDER BY {dialect.QualifyColumn(null, "OBJECT_NAME")}",
            (page - 1) * pageSize,
            pageSize);

        return await context.Database.SqlQueryRaw<ObjectDto>(sql, parameters.ToArray()).ToListAsync();
    }

    public async Task<List<MeteringInfoDto>> GetPointDetailsAsync(
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
        using var context = _contextFactory.Create(conn, prov, database);

        var endDate = granularity switch
        {
            TimeGranularity.Minute => timestamp.AddMinutes(1),
            TimeGranularity.Hour => timestamp.AddHours(1),
            TimeGranularity.Day => timestamp.AddDays(1),
            TimeGranularity.Week => timestamp.AddDays(7),
            TimeGranularity.Month => timestamp.AddMonths(1),
            TimeGranularity.Custom => timestamp.AddMinutes(customMinutes ?? 60),
            _ => timestamp.AddHours(1)
        };

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

        var parameters = new List<object> { timestamp, endDate };
        if (channelId.HasValue) parameters.Add(channelId.Value);

        return await context.Database.SqlQueryRaw<MeteringInfoDto>(sql, parameters.ToArray()).ToListAsync();
    }
}
