using API.Contracts;
using API.Data;
using API.DataSources;
using API.DTOs;
using API.Infrastructure;
using API.Models;
using API.Services;
using Hangfire;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/dbo")]
public class DboController : ControllerBase
{
    private readonly DboDataSource _dataSource;
    private readonly InternalDbContext _internalDb;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly TablePreviewService _tablePreview;
    private readonly AnalysisRequestValidator _requestValidator;
    private readonly SessionContextService _session;
    private readonly AnalysisJobQueryService _jobQueries;

    public DboController(
        IEnumerable<IDataSourceStrategy> dataSourceStrategies,
        InternalDbContext internalDb,
        IBackgroundJobClient backgroundJobClient,
        TablePreviewService tablePreview,
        AnalysisRequestValidator requestValidator,
        SessionContextService session,
        AnalysisJobQueryService jobQueries)
    {
        _dataSource = dataSourceStrategies.OfType<DboDataSource>().FirstOrDefault()
            ?? throw new InvalidOperationException("DboDataSource not registered.");
        _internalDb = internalDb;
        _backgroundJobClient = backgroundJobClient;
        _tablePreview = tablePreview;
        _requestValidator = requestValidator;
        _session = session;
        _jobQueries = jobQueries;
    }

    [HttpGet("objects")]
    public async Task<IActionResult> GetObjects([FromQuery] string database, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        try
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 1;
            if (pageSize > 1000) pageSize = 1000;

            var objects = await _dataSource.GetObjectsAsync(database, search, page, pageSize);
            return Ok(objects);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching objects.", details = ex.Message });
        }
    }

    [HttpGet("preview")]
    public async Task<IActionResult> GetTablePreview([FromQuery] string database, [FromQuery] int limit = 15)
    {
        try
        {
            var info = _session.RequireConnection();
            var preview = await _tablePreview.LoadAsync(
                info.ConnectionString,
                info.Provider,
                database,
                schema: "dbo",
                table: "METERINGS",
                timeColumn: "TIME_INSERT",
                limit);
            return Ok(preview);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching table preview.", details = ex.Message });
        }
    }

    [HttpGet("point-details")]
    public async Task<IActionResult> GetPointDetails([FromQuery] string database, [FromQuery] DateTime timestamp, [FromQuery] Core.Enums.TimeGranularity granularity, [FromQuery] int? customMinutes, [FromQuery] int? channelId)
    {
        try
        {
            var details = await _dataSource.GetPointDetailsAsync(database, timestamp, granularity, customMinutes, channelId);
            return Ok(details);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching point details.", details = ex.Message });
        }
    }

    [HttpGet("point-channels")]
    public async Task<IActionResult> GetPointChannels([FromQuery] string database, [FromQuery] DateTime timestamp, [FromQuery] Core.Enums.TimeGranularity granularity, [FromQuery] int? customMinutes, [FromQuery] int? channelId)
    {
        try
        {
            var breakdown = await _dataSource.GetPointChannelBreakdownAsync(database, timestamp, granularity, customMinutes, channelId);
            return Ok(breakdown);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching point channel breakdown.", details = ex.Message });
        }
    }

    [HttpGet("distribution")]
    public async Task<IActionResult> GetDistribution(
        [FromQuery] string database,
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate,
        [FromQuery] int? channelId)
    {
        try
        {
            _session.RequireToken();
            var distribution = await _dataSource.GetObjectDistributionAsync(database, startDate, endDate, channelId);
            return Ok(distribution);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching object distribution.", details = ex.Message });
        }
    }

    [HttpPost("enqueue")]
    public async Task<IActionResult> EnqueueAnalysis([FromBody] DetectSpikesRequest request)
    {
        try
        {
            var sessionToken = _session.RequireToken();
            _requestValidator.Validate(
                request.StartDate,
                request.EndDate,
                request.Granularity,
                request.WindowSize,
                request.CustomMinutes);

            var job = new AnalysisJob
            {
                Database = request.Database,
                Schema = "dbo",
                Table = request.ChannelId?.ToString() ?? "All",
                TimeColumn = "",
                StartDate = request.StartDate,
                EndDate = request.EndDate,
                Granularity = request.Granularity,
                CustomMinutes = request.CustomMinutes,
                Confidence = request.Confidence,
                WindowSize = request.WindowSize
            };

            _internalDb.AnalysisJobs.Add(job);
            await _internalDb.SaveChangesAsync();

            var jobId = _backgroundJobClient.Enqueue<AnalysisJobProcessor>(
                p => p.ProcessSourceJobAsync(job.Id, "Dbo", sessionToken));

            job.BackgroundJobId = jobId;
            await _internalDb.SaveChangesAsync();

            return Ok(new { JobId = job.Id });
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ex.Message);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error enqueueing analysis", details = ex.Message });
        }
    }

    [HttpGet("status/{id}")]
    public async Task<IActionResult> GetJobStatus(string id)
    {
        var job = await _jobQueries.FindJobAsync(id);
        if (job == null) return NotFound();
        return Ok(_jobQueries.BuildStatus(job));
    }

    [HttpGet("partial-result/{id}")]
    public async Task<IActionResult> GetPartialJobResult(string id)
    {
        var job = await _jobQueries.FindJobAsync(id);
        if (job == null) return NotFound();

        try
        {
            var partial = await _jobQueries.TryLoadPartialAsync(id, job);
            if (partial == null) return NotFound();
            return Ok(partial);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("result/{id}")]
    public async Task<IActionResult> GetJobResult(string id)
    {
        var job = await _jobQueries.FindJobAsync(id);
        if (job == null) return NotFound();

        try
        {
            var json = await _jobQueries.SerializeResultAsync(job);
            return Content(json, "application/json");
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] string database) =>
        Ok(await _jobQueries.GetChannelScopedHistoryAsync(database, "dbo"));

    [HttpDelete("history/{id}")]
    public async Task<IActionResult> DeleteHistoryItem(string id) =>
        await _jobQueries.DeleteJobAsync(id) ? NoContent() : NotFound();
}
