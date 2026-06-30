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
                0 as ChannelId
            FROM dbo.METERINGS
            WHERE TIME_INSERT >= @p0 AND TIME_INSERT <= @p1
            GROUP BY {dateAddExpr}
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
                ChannelBreakdown = new Dictionary<int, int>()
            })
            .OrderBy(p => p.Timestamp)
            .ToList();

        var anomalyResults = spikeDetectionService.DetectSpikes(
            groupedSeries,
            request.Confidence,
            request.WindowSize);

        return new SpikeResponse
        {
            Series = anomalyResults.Select(r => new AnomalyResultDto
            {
                Timestamp = r.Timestamp,
                Value = r.Value,
                IsSpike = r.IsSpike,
                PValue = r.PValue,
            }).ToList()
        };
    }
}
