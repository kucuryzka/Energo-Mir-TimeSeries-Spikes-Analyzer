using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using API.DTOs;
using API.Services;
using API.Sql;
using Core.Enums;
using Core.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace API.DataSources;

public class EmProtocolDataSource : IDataSourceStrategy, ISupportsChannels, ISupportsDistribution, ISupportsPointChannels
{
    private readonly IConnectionManagerService _connectionManager;
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly AnalysisPipelineService _pipeline;
    private readonly IDatabaseContextFactory _contextFactory;
    private readonly ISqlDialectProvider _dialectProvider;

    public EmProtocolDataSource(
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

    public string Id => "em_protocol";
    public string Name => "em_protocol";
    public string[] SupportedDistributions => new[] { "EventCode" };

    private (string ConnectionString, string Provider) ResolveConnection(string? connectionString, string? provider)
    {
        if (connectionString != null && provider != null)
            return (connectionString, provider);

        var token = _httpContextAccessor.HttpContext?.Request.Headers["X-Session-Token"].ToString();
        var info = _connectionManager.GetConnectionInfo(token ?? "");
        if (info == null) throw new InvalidOperationException("Invalid or missing session token");
        return (info.ConnectionString, info.Provider);
    }

    private AnalysisTableSpec BuildTableSpec() => new()
    {
        Schema = "em_protocol",
        Table = "Records",
        TimeColumn = "InsertTime",
        ChannelColumn = "ChannelId"
    };

    public Task<SpikeResponse> ExecuteAnalysisAsync(
        DetectSpikesRequest request,
        ISpikeDetectionService spikeDetectionService,
        string connectionString,
        string provider,
        IProgress<int>? progress = null)
    {
        return _pipeline.ExecuteAsync(
            BuildTableSpec(),
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
            progress);
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
        return _pipeline.GetPointChannelBreakdownAsync(
            BuildTableSpec(),
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

        var channels = dialect.QualifyTable("em_protocol", "Channels");
        var objects = dialect.QualifyTable("dbo", "OBJECTS");
        var nameExpr = dialect.Concat(
            $"o.{dialect.QuoteIdentifier("OBJECT_NAME")}",
            "' ('",
            dialect.ProviderId == "pgsql"
                ? $"c.{dialect.QuoteIdentifier("EventCode")}::text"
                : $"CAST(c.{dialect.QuoteIdentifier("EventCode")} AS NVARCHAR(100))",
            "')'");

        var sql = $@"
            SELECT c.{dialect.QuoteIdentifier("Id")} AS Id,
                   {nameExpr} AS Name,
                   {(dialect.ProviderId == "pgsql"
                       ? $"c.{dialect.QuoteIdentifier("EventCode")}::text"
                       : $"CAST(c.{dialect.QuoteIdentifier("EventCode")} AS NVARCHAR(100))")} AS EventCode
            FROM {channels} c
            JOIN {objects} o ON c.{dialect.QuoteIdentifier("ObjectId")} = o.{dialect.QuoteIdentifier("IDGLOBAL")}";

        var parameters = new List<object>();
        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += $" WHERE o.{dialect.QuoteIdentifier("OBJECT_NAME")} LIKE {{0}} OR {(dialect.ProviderId == "pgsql" ? $"c.{dialect.QuoteIdentifier("EventCode")}::text" : $"CAST(c.{dialect.QuoteIdentifier("EventCode")} AS NVARCHAR(100))")} LIKE {{0}}";
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

        var records = dialect.QualifyTable("em_protocol", "Records");
        var channels = dialect.QualifyTable("em_protocol", "Channels");
        var eventCodeExpr = dialect.ProviderId == "pgsql"
            ? $"c.{dialect.QuoteIdentifier("EventCode")}::text"
            : $"CAST(c.{dialect.QuoteIdentifier("EventCode")} AS NVARCHAR(100))";

        var countExpr = dialect.ProviderId == "pgsql" ? "COUNT(*)" : "COUNT_BIG(*)";

        var sql = $@"
            SELECT {eventCodeExpr} AS Category, {countExpr} AS Count
            FROM {records} r
            JOIN {channels} c ON r.{dialect.QuoteIdentifier("ChannelId")} = c.{dialect.QuoteIdentifier("Id")}
            WHERE r.{dialect.QuoteIdentifier("InsertTime")} >= @p0 AND r.{dialect.QuoteIdentifier("InsertTime")} <= @p1
            GROUP BY {eventCodeExpr}
            ORDER BY Count DESC";

        return await context.Database.SqlQueryRaw<DistributionItemDto>(sql, start, end).ToListAsync();
    }
}
