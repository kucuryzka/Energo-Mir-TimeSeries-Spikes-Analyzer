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
    private readonly AppDbContext _context;

    public DboDataSource(AppDbContext context)
    {
        _context = context;
    }

    public string Id => "Dbo";
    public string Name => "Дбо";
    public string[] SupportedDistributions => new string[] { };

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
            WHERE m.TIME_INSERT >= @p0 AND m.TIME_INSERT <= @p1
            {(request.ChannelId.HasValue ? "AND m.IDOBJECT = @p2" : "")}
            GROUP BY {dateAddExpr}, m.IDOBJECT
            ORDER BY Timestamp";

        var parameters = new List<object> { request.StartDate, request.EndDate };
        if (request.ChannelId.HasValue) parameters.Add(request.ChannelId.Value);

        var rawAggregates = await _context.Database
            .SqlQueryRaw<AggregatedResult>(sqlAggregate, parameters.ToArray())
            .ToListAsync();

        var groupedSeries = rawAggregates
            .GroupBy(a => a.Timestamp)
            .Select(g => new DataPoint
            {
                Timestamp = g.Key,
                Value = g.Sum(x => x.Value),
                ChannelBreakdown = g.Where(x => x.ChannelId != 0).GroupBy(x => x.ChannelId).ToDictionary(x => x.Key, x => x.Sum(y => y.Value))
            })
            .OrderBy(p => p.Timestamp)
            .ToList();

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
            var idsString = string.Join(",", channelIds);
            var sql = $@"
                SELECT IDOBJECT as Id, OBJECT_NAME as Name 
                FROM dbo.OBJECTS 
                WHERE IDOBJECT IN ({idsString})";
            
            var dbChannels = await _context.Database.SqlQueryRaw<ChannelDto>(sql).ToListAsync();
            channelNames = dbChannels.ToDictionary(c => c.Id, c => c.Name);
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

    public async Task<List<ObjectDto>> GetObjectsAsync(string? search, int page = 1, int pageSize = 50)
    {
        var query = _context.Database.SqlQueryRaw<ObjectDto>(
            "SELECT IDOBJECT as Id, OBJECT_NAME as Name FROM dbo.OBJECTS"
        );
        
        if (!string.IsNullOrWhiteSpace(search))
        {
            query = query.Where(c => c.Name.Contains(search));
        }

        return await query
            .OrderBy(c => c.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();
    }
}
