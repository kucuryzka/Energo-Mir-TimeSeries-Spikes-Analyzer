using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Core.Interfaces;
using Core.Models;
using API.Data;
using API.DTOs;
using Core.Enums;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnalyticsController : ControllerBase
{
    private readonly ITimeSeriesService _timeSeriesService;
    private readonly ISpikeDetectionService _spikeDetectionService;
    private readonly AppDbContext _context;

    public AnalyticsController(
        ITimeSeriesService timeSeriesService,
        ISpikeDetectionService spikeDetectionService,
        AppDbContext context)
    {
        _timeSeriesService = timeSeriesService;
        _spikeDetectionService = spikeDetectionService;
        _context = context;
    }

    [HttpGet("channels")]
    public async Task<IActionResult> GetChannels([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        try
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 1;
            if (pageSize > 1000) pageSize = 1000;

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

            var channels = await _context.Database.SqlQueryRaw<ChannelDto>(sql, parameters.ToArray()).ToListAsync();

            return Ok(channels);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching channels.", details = ex.Message });
        }
    }

    [HttpPost("detect-spikes")]
    public async Task<IActionResult> DetectSpikes([FromBody] DetectSpikesRequest request)
    {
        try
        {
            if (request.StartDate >= request.EndDate)
            {
                return BadRequest("StartDate must be before EndDate.");
            }
            if (request.Confidence <= 0 || request.Confidence >= 100)
            {
                return BadRequest("Confidence must be greater than 0 and less than 100 (e.g. 95).");
            }
            if (request.WindowSize < 2)
            {
                return BadRequest("WindowSize must be at least 2 for sliding window analysis.");
            }

            var dateAddExpr = request.Granularity switch
            {
                TimeGranularity.Minute => "DATEADD(minute, DATEDIFF(minute, 0, EventTime), 0)",
                TimeGranularity.Hour => "DATEADD(hour, DATEDIFF(hour, 0, EventTime), 0)",
                TimeGranularity.Day => "DATEADD(day, DATEDIFF(day, 0, EventTime), 0)",
                TimeGranularity.Week => "DATEADD(week, DATEDIFF(week, 0, EventTime), 0)",
                TimeGranularity.Month => "DATEADD(month, DATEDIFF(month, 0, EventTime), 0)",
                TimeGranularity.Custom => $"DATEADD(minute, (DATEDIFF(minute, 0, EventTime) / {(request.CustomMinutes ?? 60)}) * {(request.CustomMinutes ?? 60)}, 0)",
                _ => "DATEADD(hour, DATEDIFF(hour, 0, EventTime), 0)"
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
                WHERE EventTime >= @p0 AND EventTime <= @p1 {channelFilter}
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

            var anomalyResults = _spikeDetectionService.DetectSpikes(
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

            var response = new SpikeResponse
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

            return Ok(response);
        }
        catch (NotImplementedException niex)
        {
            return StatusCode(501, new { message = "Backend Core services are not yet implemented.", details = niex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred during spike detection.", details = ex.Message });
        }
    }
}
