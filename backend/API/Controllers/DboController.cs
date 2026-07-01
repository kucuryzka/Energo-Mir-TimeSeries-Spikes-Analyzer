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
[Route("api/dbo")]
public class DboController : ControllerBase
{
    private readonly DboDataSource _dataSource;
    private readonly ISpikeDetectionService _spikeDetectionService;

    public DboController(
        IEnumerable<IDataSourceStrategy> dataSourceStrategies,
        ISpikeDetectionService spikeDetectionService)
    {
        _dataSource = dataSourceStrategies.OfType<DboDataSource>().FirstOrDefault() 
            ?? throw new Exception("DboDataSource not registered.");
        _spikeDetectionService = spikeDetectionService;
    }

    [HttpGet("objects")]
    public async Task<IActionResult> GetObjects([FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        try
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 1;
            if (pageSize > 1000) pageSize = 1000;

            var objects = await _dataSource.GetObjectsAsync(search, page, pageSize);
            return Ok(objects);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching objects.", details = ex.Message });
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

            var maxDateRange = TimeSpan.FromDays(547); // 1.5 years
            if (request.EndDate - request.StartDate > maxDateRange)
                return BadRequest("Date range cannot exceed 1.5 years.");

            // The strategy encapsulates all logic including DB querying, aggregation, 
            // spike detection calling.
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
