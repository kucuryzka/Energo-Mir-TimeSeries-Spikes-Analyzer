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
[Route("api/em-protocol")]
public class EmProtocolController : ControllerBase
{
    private readonly EmProtocolDataSource _dataSource;
    private readonly ISpikeDetectionService _spikeDetectionService;

    public EmProtocolController(
        IEnumerable<IDataSourceStrategy> dataSourceStrategies,
        ISpikeDetectionService spikeDetectionService)
    {
        _dataSource = dataSourceStrategies.OfType<EmProtocolDataSource>().FirstOrDefault() 
            ?? throw new Exception("EmProtocolDataSource not registered.");
        _spikeDetectionService = spikeDetectionService;
    }

    [HttpGet("channels")]
    public async Task<IActionResult> GetChannels([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        try
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 1;
            if (pageSize > 1000) pageSize = 1000;

            var channels = await _dataSource.GetChannelsAsync(search, page, pageSize);
            return Ok(channels);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching channels.", details = ex.Message });
        }
    }

    [HttpGet("distribution")]
    public async Task<IActionResult> GetDistribution([FromQuery] DateTime startDate, [FromQuery] DateTime endDate, [FromQuery] string categoryName)
    {
        try
        {
            if (_dataSource.SupportedDistributions.Contains(categoryName))
            {
                var distribution = await _dataSource.GetDistributionAsync(startDate, endDate, categoryName);
                return Ok(distribution);
            }
            
            return BadRequest($"Source does not support distribution by '{categoryName}'.");
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching distribution.", details = ex.Message });
        }
    }

    [HttpPost("detect-spikes")]
    public async Task<IActionResult> DetectSpikes([FromBody] DetectSpikesRequest request)
    {
        try
        {
            if (request.StartDate >= request.EndDate)
                return BadRequest("StartDate must be before EndDate.");
            if (request.Confidence <= 0 || request.Confidence >= 100)
                return BadRequest("Confidence must be greater than 0 and less than 100 (e.g. 95).");
            if (request.WindowSize < 2)
                return BadRequest("WindowSize must be at least 2 for sliding window analysis.");

            // The strategy encapsulates all logic including DB querying, aggregation, 
            // spike detection calling, and channel naming.
            var response = await _dataSource.ExecuteAnalysisAsync(request, _spikeDetectionService);

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
