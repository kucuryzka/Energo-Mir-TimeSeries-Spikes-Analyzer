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

    [HttpPost("detect-spikes")]
    public async Task<IActionResult> DetectSpikes([FromBody] DetectSpikesRequest request)
    {
        try
        {
            var rawData = await _context.CallRecords
                .Where(r => r.Timestamp >= request.StartDate && r.Timestamp <= request.EndDate)
                .ToListAsync();

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
