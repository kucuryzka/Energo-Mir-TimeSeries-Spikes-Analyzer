using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using API.Data;
using API.DTOs;
using Core.Enums;
using Core.Models;
using Core.Interfaces;

namespace API.DataSources;

public class EmProtocolDataSource : IDataSourceStrategy, ISupportsChannels, ISupportsDistribution
{
    private readonly API.Services.IConnectionManagerService _connectionManager;
    private readonly Microsoft.AspNetCore.Http.IHttpContextAccessor _httpContextAccessor;

    public EmProtocolDataSource(API.Services.IConnectionManagerService connectionManager, Microsoft.AspNetCore.Http.IHttpContextAccessor httpContextAccessor)
    {
        _connectionManager = connectionManager;
        _httpContextAccessor = httpContextAccessor;
    }

    public string Id => "em_protocol";
    public string Name => "em_protocol";
    public string[] SupportedDistributions => new[] { "EventCode" };

    private AppDbContext GetContext(string database)
    {
        var token = _httpContextAccessor.HttpContext?.Request.Headers["X-Session-Token"].ToString();
        var info = _connectionManager.GetConnectionInfo(token ?? "");
        if (info == null) throw new Exception("Invalid or missing session token");

        var connStrBuilder = new System.Data.Common.DbConnectionStringBuilder { ConnectionString = info.ConnectionString };
        if (!string.IsNullOrEmpty(database)) connStrBuilder["Database"] = database;
        var targetConnStr = connStrBuilder.ConnectionString;

        var optionsBuilder = new DbContextOptionsBuilder<AppDbContext>();
        if (info.Provider == "pgsql")
            optionsBuilder.UseNpgsql(targetConnStr);
        else
            optionsBuilder.UseSqlServer(targetConnStr);

        return new AppDbContext(optionsBuilder.Options);
    }

    public async Task<List<ChannelDto>> GetChannelsAsync(string database, string? search, int page = 1, int pageSize = 50)
    {
        try
        {
            var sql = @"
                SELECT c.Id, CONCAT(o.OBJECT_NAME, ' (', c.EventCode, ')') as Name, CAST(c.EventCode as NVARCHAR(100)) as EventCode
                FROM em_protocol.Channels c
                JOIN dbo.OBJECTS o ON c.ObjectId = o.IDGLOBAL";
            
            var parameters = new List<object>();

            if (!string.IsNullOrWhiteSpace(search))
            {
                sql += " WHERE o.OBJECT_NAME LIKE {0} OR CAST(c.EventCode as NVARCHAR) LIKE {0}";
                parameters.Add($"%{search}%");
            }

            sql += $" ORDER BY o.OBJECT_NAME OFFSET {(page - 1) * pageSize} ROWS FETCH NEXT {pageSize} ROWS ONLY";

            using var _context = GetContext(database);
            return await _context.Database.SqlQueryRaw<ChannelDto>(sql, parameters.ToArray()).ToListAsync();
        }
        catch (Microsoft.Data.SqlClient.SqlException)
        {
            return new List<ChannelDto>();
        }
    }

    public async Task<SpikeResponse> ExecuteAnalysisAsync(DetectSpikesRequest request, ISpikeDetectionService spikeDetectionService)
    {
        try
        {
            var dateAddExpr = request.Granularity switch
            {
                TimeGranularity.Minute => "DATEADD(minute, DATEDIFF(minute, 0, InsertTime), 0)",
                TimeGranularity.Hour => "DATEADD(hour, DATEDIFF(hour, 0, InsertTime), 0)",
                TimeGranularity.Day => "DATEADD(day, DATEDIFF(day, 0, InsertTime), 0)",
                TimeGranularity.Week => "DATEADD(week, DATEDIFF(week, 0, InsertTime), 0)",
                TimeGranularity.Month => "DATEADD(month, DATEDIFF(month, 0, InsertTime), 0)",
                TimeGranularity.Custom => $"DATEADD(minute, (DATEDIFF(minute, 0, InsertTime) / {(request.CustomMinutes ?? 60)}) * {(request.CustomMinutes ?? 60)}, 0)",
                _ => "DATEADD(hour, DATEDIFF(hour, 0, InsertTime), 0)"
            };

            var channelFilter = (request.ChannelId.HasValue && request.ChannelId.Value > 0) 
                ? $"AND ChannelId = {request.ChannelId.Value}" 
                : "";

            var sqlAggregate = $@"
                SELECT 
                    {dateAddExpr} as Timestamp,
                    COUNT(*) as Value,
                    ChannelId
                FROM em_protocol.Records
                WHERE InsertTime >= @p0 AND InsertTime <= @p1 {channelFilter}
                GROUP BY {dateAddExpr}, ChannelId
                ORDER BY Timestamp";

            var groupedSeriesDict = new Dictionary<DateTime, DataPoint>();
            var currentStart = request.StartDate;

            using var _context = GetContext(request.Database);
            _context.Database.SetCommandTimeout(300);

            while (currentStart < request.EndDate)
            {
                var currentEnd = currentStart.AddMonths(1);
                if (currentEnd > request.EndDate) currentEnd = request.EndDate;

                var batchAggregates = await _context.Database
                    .SqlQueryRaw<AggregatedResult>(sqlAggregate, currentStart, currentEnd)
                    .ToListAsync();

                var batchGrouped = batchAggregates
                    .GroupBy(a => a.Timestamp)
                    .Select(g => new DataPoint
                    {
                        Timestamp = g.Key,
                        Value = g.Sum(x => x.Value),
                        ChannelBreakdown = g.Where(x => x.ChannelId.HasValue).ToDictionary(x => x.ChannelId!.Value, x => x.Value)
                    });

                foreach (var dp in batchGrouped)
                {
                    if (groupedSeriesDict.TryGetValue(dp.Timestamp, out var existing))
                    {
                        existing.Value += dp.Value;
                        foreach (var kvp in dp.ChannelBreakdown)
                        {
                            if (existing.ChannelBreakdown.ContainsKey(kvp.Key))
                                existing.ChannelBreakdown[kvp.Key] += kvp.Value;
                            else
                                existing.ChannelBreakdown[kvp.Key] = kvp.Value;
                        }
                    }
                    else
                    {
                        groupedSeriesDict[dp.Timestamp] = dp;
                    }
                }

                currentStart = currentEnd;
            }

            var groupedSeries = groupedSeriesDict.Values.OrderBy(p => p.Timestamp).ToList();

            var anomalyResults = spikeDetectionService.DetectSpikes(
                groupedSeries,
                request.Confidence,
                request.WindowSize);

            var channelIds = anomalyResults
                .SelectMany(r => r.ChannelBreakdown.Keys)
                .Distinct()
                .ToList();

            var channelInfos = new Dictionary<int, ChannelDto>();
            if (channelIds.Any())
            {
                var chunkSize = 1000;
                for (int i = 0; i < channelIds.Count; i += chunkSize)
                {
                    var chunk = channelIds.Skip(i).Take(chunkSize);
                    var idsString = string.Join(",", chunk);
                    var sql = $@"
                        SELECT c.Id, o.OBJECT_NAME as Name, CAST(c.EventCode as NVARCHAR(100)) as EventCode
                        FROM em_protocol.Channels c
                        JOIN dbo.OBJECTS o ON c.ObjectId = o.IDGLOBAL
                        WHERE c.Id IN ({idsString})";
                    
                    var dbChannels = await _context.Database.SqlQueryRaw<ChannelDto>(sql).ToListAsync();
                    foreach (var c in dbChannels)
                    {
                        channelInfos[c.Id] = c;
                    }
                }
            }

            return new SpikeResponse
            {
                Series = anomalyResults.Select(r => new AnomalyResultDto
                {
                    Timestamp = r.Timestamp,
                    Value = r.Value,
                    IsSpike = r.IsSpike,
                    PValue = r.PValue,
                    ChannelBreakdown = r.ChannelBreakdown
                        .Select(kvp => 
                        {
                            var info = channelInfos.GetValueOrDefault(kvp.Key);
                            return new ChannelContributionDto
                            {
                                ChannelId = kvp.Key,
                                ChannelName = info?.Name ?? "Неизвестный канал",
                                EventCode = info?.EventCode,
                                Count = kvp.Value
                            };
                        })
                        .OrderByDescending(c => c.Count)
                        .ToList()
                }).ToList()
            };
        }
        catch (Microsoft.Data.SqlClient.SqlException)
        {
            return new SpikeResponse { Series = new List<AnomalyResultDto>() };
        }
    }

    public async Task<List<DistributionItemDto>> GetDistributionAsync(string database, DateTime start, DateTime end, string categoryName)
    {
        if (categoryName != "EventCode")
        {
            return new List<DistributionItemDto>();
        }

        var sql = @"
            SELECT CAST(c.EventCode as NVARCHAR(100)) as Category, COUNT_BIG(*) as Count
            FROM em_protocol.Records r
            JOIN em_protocol.Channels c ON r.ChannelId = c.Id
            WHERE r.InsertTime >= @p0 AND r.InsertTime <= @p1
            GROUP BY c.EventCode
            ORDER BY Count DESC";

        using var _context = GetContext(database);
        var result = await _context.Database
            .SqlQueryRaw<DistributionItemDto>(sql, start, end)
            .ToListAsync();

        return result;
    }
}
