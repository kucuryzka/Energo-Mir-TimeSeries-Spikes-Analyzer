using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Core.Interfaces;
using API.DTOs;
using API.DataSources;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnalyticsController : ControllerBase
{
    private readonly IEnumerable<IDataSourceStrategy> _dataSourceStrategies;
    private readonly ISpikeDetectionService _spikeDetectionService;

    public AnalyticsController(
        IEnumerable<IDataSourceStrategy> dataSourceStrategies,
        ISpikeDetectionService spikeDetectionService)
    {
        _dataSourceStrategies = dataSourceStrategies;
        _spikeDetectionService = spikeDetectionService;
    }

    [HttpGet("sources")]
    public IActionResult GetSources()
    {
        var sources = _dataSourceStrategies.Select(s => new { Id = s.Id, Name = s.Name }).ToList();
        return Ok(sources);
    }

    [HttpGet("channels")]
    public async Task<IActionResult> GetChannels([FromQuery] string sourceId, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        try
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 1;
            if (pageSize > 1000) pageSize = 1000;

            var strategy = _dataSourceStrategies.FirstOrDefault(s => s.Id == sourceId);
            if (strategy == null)
                return BadRequest("Invalid sourceId");

            var channels = await strategy.GetChannelsAsync(search, page, pageSize);
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

            var maxDateRange = TimeSpan.FromDays(547); // 1.5 years
            if (request.EndDate - request.StartDate > maxDateRange)
            {
                return BadRequest("Date range cannot exceed 1.5 years.");
            }

            var strategy = _dataSourceStrategies.FirstOrDefault(s => s.Id == request.SourceId);
            if (strategy == null)
            {
                return BadRequest("Invalid or missing SourceId.");
            }

            // The strategy encapsulates all logic including DB querying, aggregation, 
            // spike detection calling, and channel naming.
            var response = await strategy.ExecuteAnalysisAsync(request, _spikeDetectionService);

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
