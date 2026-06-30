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

public class EmProtocolDataSource : IDataSourceStrategy
{
    private readonly AppDbContext _context;

    public EmProtocolDataSource(AppDbContext context)
    {
        _context = context;
    }

    public string Id => "em_protocol";
    public string Name => "Протокол EM";

    public async Task<List<ChannelDto>> GetChannelsAsync(string? search, int page, int pageSize)
    {
        var sql = @"
            SELECT c.Id, CONCAT(o.OBJECT_NAME, ' (', c.EventCode, ')') as Name
            FROM em_protocol.Channels c
            JOIN dbo.OBJECTS o ON c.ObjectId = o.IDGLOBAL";
        
        var parameters = new List<object>();

        if (!string.IsNullOrWhiteSpace(search))
        {
            sql += " WHERE o.OBJECT_NAME LIKE {0} OR CAST(c.EventCode as NVARCHAR) LIKE {0}";
            parameters.Add($"%{search}%");
        }

        sql += $" ORDER BY o.OBJECT_NAME OFFSET {(page - 1) * pageSize} ROWS FETCH NEXT {pageSize} ROWS ONLY";

        return await _context.Database.SqlQueryRaw<ChannelDto>(sql, parameters.ToArray()).ToListAsync();
    }

    public async Task<SpikeResponse> ExecuteAnalysisAsync(DetectSpikesRequest request, ISpikeDetectionService spikeDetectionService)
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

        var rawAggregates = await _context.Database
            .SqlQueryRaw<AggregatedResult>(sqlAggregate, request.StartDate, request.EndDate)
            .ToListAsync();

        var groupedSeries = rawAggregates
            .GroupBy(a => a.Timestamp)
            .Select(g => new DataPoint
            {
                Timestamp = g.Key,
                Value = g.Sum(x => x.Value),
                ChannelBreakdown = g.ToDictionary(x => x.ChannelId, x => x.Value)
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
                SELECT c.Id, CONCAT(o.OBJECT_NAME, ' (', c.EventCode, ')') as Name
                FROM em_protocol.Channels c
                JOIN dbo.OBJECTS o ON c.ObjectId = o.IDGLOBAL
                WHERE c.Id IN ({idsString})";
            
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
                ChannelBreakdown = r.ChannelBreakdown
                    .Select(kvp => new ChannelContributionDto
                    {
                        ChannelId = kvp.Key,
                        ChannelName = channelNames.GetValueOrDefault(kvp.Key, "Неизвестный канал"),
                        Count = kvp.Value
                    })
                    .OrderByDescending(c => c.Count)
                    .ToList()
            }).ToList()
        };
    }
}
