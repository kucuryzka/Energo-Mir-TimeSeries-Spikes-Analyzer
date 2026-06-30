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
                SELECT c.Id, o.OBJECT_NAME as Name
                FROM em_protocol.Channels c
                JOIN dbo.OBJECTS o ON c.ObjectId = o.IDGLOBAL";
            
            var parameters = new List<object>();

            if (!string.IsNullOrWhiteSpace(search))
            {
                sql += " WHERE o.OBJECT_NAME LIKE {0}";
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

            var maxDateRange = TimeSpan.FromDays(90);
            if (request.EndDate - request.StartDate > maxDateRange)
            {
                return BadRequest("Date range cannot exceed 90 days to prevent excessive memory usage.");
            }

            var query = _context.Records
                .Where(r => r.EventTime >= request.StartDate && r.EventTime <= request.EndDate);

            if (request.ChannelId.HasValue && request.ChannelId.Value > 0)
            {
                query = query.Where(r => r.ChannelId == request.ChannelId.Value);
            }

            var rawData = await query.ToListAsync();

            var groupedSeries = _timeSeriesService.GroupByGranularity(
                rawData,
                request.Granularity,
                request.CustomMinutes);

            var anomalyResults = _spikeDetectionService.DetectSpikes(
                groupedSeries,
                request.Confidence,
                request.WindowSize);

            var response = new SpikeResponse
            {
                Series = anomalyResults.Select(r => new AnomalyResultDto
                {
                    Timestamp = r.Timestamp,
                    Value = r.Value,
                    IsSpike = r.IsSpike,
                    PValue = r.PValue
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
