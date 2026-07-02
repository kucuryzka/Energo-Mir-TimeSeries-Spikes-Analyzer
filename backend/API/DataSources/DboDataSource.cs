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

public class DboDataSource : IDataSourceStrategy
{
    private readonly API.Services.IConnectionManagerService _connectionManager;
    private readonly Microsoft.AspNetCore.Http.IHttpContextAccessor _httpContextAccessor;

    public DboDataSource(API.Services.IConnectionManagerService connectionManager, Microsoft.AspNetCore.Http.IHttpContextAccessor httpContextAccessor)
    {
        _connectionManager = connectionManager;
        _httpContextAccessor = httpContextAccessor;
    }

    public string Id => "Dbo";
    public string Name => "dbo";
    public string[] SupportedDistributions => new string[] { };

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

    public async Task<SpikeResponse> ExecuteAnalysisAsync(DetectSpikesRequest request, ISpikeDetectionService spikeDetectionService)
    {
        var dateAddExpr = request.Granularity switch
        {
            TimeGranularity.Minute => "DATEADD(minute, DATEDIFF(minute, 0, TIME_INSERT), 0)",
            TimeGranularity.Hour => "DATEADD(hour, DATEDIFF(hour, 0, TIME_INSERT), 0)",
            TimeGranularity.Day => "DATEADD(day, DATEDIFF(day, 0, TIME_INSERT), 0)",
            TimeGranularity.Week => "DATEADD(week, DATEDIFF(week, 0, TIME_INSERT), 0)",
            TimeGranularity.Month => "DATEADD(month, DATEDIFF(month, 0, TIME_INSERT), 0)",
            TimeGranularity.Custom => $"DATEADD(minute, (DATEDIFF(minute, 0, TIME_INSERT) / {(request.CustomMinutes ?? 60)}) * {(request.CustomMinutes ?? 60)}, 0)",
            _ => "DATEADD(hour, DATEDIFF(hour, 0, TIME_INSERT), 0)"
        };

        var sqlAggregate = $@"
            SELECT 
                {dateAddExpr} as Timestamp,
                COUNT(*) as Value,
                m.IDOBJECT as ChannelId
            FROM dbo.METERINGS m
            WHERE m.TIME_INSERT >= @p0 AND m.TIME_INSERT < @p1
            {(request.ChannelId.HasValue ? "AND m.IDOBJECT = @p2" : "")}
            GROUP BY {dateAddExpr}, m.IDOBJECT
            ORDER BY Timestamp";

        var groupedSeriesDict = new Dictionary<DateTime, DataPoint>();
        var currentStart = request.StartDate;

        using var _context = GetContext(request.Database);
        _context.Database.SetCommandTimeout(300);

        while (currentStart < request.EndDate)
        {
            var currentEnd = currentStart.AddMonths(1);
            if (currentEnd > request.EndDate) currentEnd = request.EndDate;

            var parameters = new List<object> { currentStart, currentEnd };
            if (request.ChannelId.HasValue) parameters.Add(request.ChannelId.Value);

            var batchAggregates = await _context.Database
                .SqlQueryRaw<AggregatedResult>(sqlAggregate, parameters.ToArray())
                .ToListAsync();

            var batchGrouped = batchAggregates
                .GroupBy(a => a.Timestamp)
                .Select(g => new DataPoint
                {
                    Timestamp = g.Key,
                    Value = g.Sum(x => x.Value),
                    ChannelBreakdown = g.Where(x => x.ChannelId.HasValue && x.ChannelId.Value != 0).GroupBy(x => x.ChannelId!.Value).ToDictionary(x => x.Key, x => x.Sum(y => y.Value))
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

        var channelNames = new Dictionary<int, string>();
        if (channelIds.Any())
        {
            var chunkSize = 1000;
            for (int i = 0; i < channelIds.Count; i += chunkSize)
            {
                var chunk = channelIds.Skip(i).Take(chunkSize);
                var idsString = string.Join(",", chunk);
                var sql = $@"
                    SELECT IDOBJECT as Id, OBJECT_NAME as Name, NULL as EventCode 
                    FROM dbo.OBJECTS 
                    WHERE IDOBJECT IN ({idsString})";
                
                var dbChannels = await _context.Database.SqlQueryRaw<ChannelDto>(sql).ToListAsync();
                foreach (var c in dbChannels)
                {
                    channelNames[c.Id] = c.Name;
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
                ChannelBreakdown = r.ChannelBreakdown.Select(cb => new ChannelContributionDto
                {
                    ChannelId = cb.Key,
                    ChannelName = channelNames.TryGetValue(cb.Key, out var name) ? name : $"Объект {cb.Key}",
                    Count = cb.Value
                }).ToList()
            }).ToList()
        };
    }

    public async Task<List<ObjectDto>> GetObjectsAsync(string database, string? search, int page = 1, int pageSize = 50)
    {
        using var _context = GetContext(database);
        var query = _context.Database.SqlQueryRaw<ObjectDto>(
            "SELECT IDOBJECT as Id, OBJECT_NAME as Name FROM dbo.OBJECTS"
        );
        
        var list = await query.ToListAsync();
        
        if (!string.IsNullOrEmpty(search))
        {
            var searchLower = search.ToLower();
            list = list.Where(c => c.Name.ToLower().Contains(searchLower)).ToList();
        }

        return list.Skip((page - 1) * pageSize).Take(pageSize).ToList();
    }

    public async Task<List<MeteringInfoDto>> GetPointDetailsAsync(string database, DateTime timestamp, TimeGranularity granularity, int? customMinutes, int? channelId)
    {
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

        var sql = $@"
            SELECT TOP 1000
                m.IDOBJECT_AGGREGATE as IdObjectAggregate, 
                m.IDOBJECT_AVERAGE as IdObjectAverage, 
                m.QUALITY as Quality, 
                m.QUALITY_SOURCE as QualitySource, 
                m.[SOURCE] as Source, 
                m.VALUE_METERING as ValueMetering,
                m.IDOBJECT as IdObject,
                o.OBJECT_NAME as ObjectName
            FROM dbo.METERINGS m
            LEFT JOIN dbo.OBJECTS o ON m.IDOBJECT = o.IDOBJECT
            WHERE m.TIME_INSERT >= @p0 AND m.TIME_INSERT < @p1
            {(channelId.HasValue ? "AND m.IDOBJECT = @p2" : "")}
        ";

        var parameters = new List<object> { timestamp, endDate };
        if (channelId.HasValue) parameters.Add(channelId.Value);

        using var _context = GetContext(database);
        return await _context.Database
            .SqlQueryRaw<MeteringInfoDto>(sql, parameters.ToArray())
            .ToListAsync();
    }
}
