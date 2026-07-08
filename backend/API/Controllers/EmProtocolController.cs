using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using API.DTOs;
using API.DataSources;
using API.Data;
using API.Models;
using Hangfire;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

[ApiController]
[Route("api/em-protocol")]
public class EmProtocolController : ControllerBase
{
    private readonly EmProtocolDataSource _dataSource;
    private readonly InternalDbContext _internalDb;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly API.Services.IConnectionManagerService _connectionManager;
    private readonly API.Services.AnalysisResultService _resultService;
    private readonly Microsoft.AspNetCore.Http.IHttpContextAccessor _httpContextAccessor;
    private readonly API.Services.TablePreviewService _tablePreview;
    private readonly API.Services.AnalysisRequestValidator _requestValidator;

    public EmProtocolController(
        IEnumerable<IDataSourceStrategy> dataSourceStrategies,
        InternalDbContext internalDb,
        IBackgroundJobClient backgroundJobClient,
        API.Services.IConnectionManagerService connectionManager,
        API.Services.AnalysisResultService resultService,
        Microsoft.AspNetCore.Http.IHttpContextAccessor httpContextAccessor,
        API.Services.TablePreviewService tablePreview,
        API.Services.AnalysisRequestValidator requestValidator)
    {
        _dataSource = dataSourceStrategies.OfType<EmProtocolDataSource>().FirstOrDefault() 
            ?? throw new Exception("EmProtocolDataSource not registered.");
        _internalDb = internalDb;
        _backgroundJobClient = backgroundJobClient;
        _connectionManager = connectionManager;
        _resultService = resultService;
        _httpContextAccessor = httpContextAccessor;
        _tablePreview = tablePreview;
        _requestValidator = requestValidator;
    }

    [HttpGet("channels")]
    public async Task<IActionResult> GetChannels([FromQuery] string database, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        try
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 1;
            if (pageSize > 1000) pageSize = 1000;

            var channels = await _dataSource.GetChannelsAsync(database, search, page, pageSize);
            return Ok(channels);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching channels.", details = ex.Message });
        }
    }

    [HttpGet("distribution")]
    public async Task<IActionResult> GetDistribution([FromQuery] string database, [FromQuery] DateTime startDate, [FromQuery] DateTime endDate, [FromQuery] string categoryName)
    {
        try
        {
            if (_dataSource.SupportedDistributions.Contains(categoryName))
            {
                var distribution = await _dataSource.GetDistributionAsync(database, startDate, endDate, categoryName);
                return Ok(distribution);
            }
            
            return BadRequest($"Source does not support distribution by '{categoryName}'.");
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred while fetching distribution.", details = ex.Message });
        }
    }

    [HttpGet("preview")]
    public async Task<IActionResult> GetTablePreview([FromQuery] string database, [FromQuery] int limit = 15)
    {
        try
        {
            var info = RequireSession();
            var preview = await _tablePreview.LoadAsync(
                info.ConnectionString,
                info.Provider,
                database,
                schema: "em_protocol",
                table: "Records",
                timeColumn: "InsertTime",
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

    [HttpPost("enqueue")]
    public async Task<IActionResult> EnqueueAnalysis([FromBody] DetectSpikesRequest request)
    {
        try
        {
            var sessionToken = RequireSessionToken();
            _requestValidator.Validate(
                request.StartDate,
                request.EndDate,
                request.Granularity,
                request.WindowSize,
                request.CustomMinutes);

            var job = new AnalysisJob
            {
                Database = request.Database,
                Schema = "em_protocol",
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

            var jobId = _backgroundJobClient.Enqueue<API.Services.AnalysisJobProcessor>(
                p => p.ProcessSourceJobAsync(job.Id, "em_protocol", sessionToken));
            
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
        var job = await _internalDb.AnalysisJobs.FindAsync(id);
        if (job == null) return NotFound();

        return Ok(new { 
            job.Id, 
            job.Status, 
            job.Progress, 
            job.ErrorMessage,
            HasResult = _resultService.HasResult(job),
            HasPartialResult = _resultService.HasPartialResult(job.Id),
            SeriesPointCount = job.SeriesPointCount
        });
    }

    [HttpGet("partial-result/{id}")]
    public async Task<IActionResult> GetPartialJobResult(string id)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(id);
        if (job == null) return NotFound();
        if (job.Status is not ("Running" or "Completed" or "Cancelled"))
            return BadRequest("Partial result is not available.");

        var partial = await _resultService.TryLoadPartialAsync(id);
        if (partial == null) return NotFound();

        return Ok(partial);
    }

    [HttpGet("result/{id}")]
    public async Task<IActionResult> GetJobResult(string id)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(id);
        if (job == null) return NotFound();
        if (!_resultService.HasResult(job)) return BadRequest("Result is not ready or failed");

        var json = await _resultService.SerializeToJsonAsync(job);
        return Content(json, "application/json");
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] string database)
    {
        var history = await _internalDb.AnalysisJobs
            .Where(j => j.Database == database && j.Schema == "em_protocol")
            .OrderByDescending(j => j.CompletedAt ?? j.CreatedAt)
            .Select(j => new {
                j.Id,
                j.StartDate,
                j.EndDate,
                j.Granularity,
                j.Status,
                j.Progress,
                j.CreatedAt,
                j.CompletedAt,
                j.SeriesPointCount,
                ChannelId = j.Table == "All" ? null : j.Table
            })
            .ToListAsync();

        return Ok(history);
    }

    [HttpDelete("history/{id}")]
    public async Task<IActionResult> DeleteHistoryItem(string id)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(id);
        if (job == null) return NotFound();

        if (!string.IsNullOrEmpty(job.BackgroundJobId))
        {
            _backgroundJobClient.Delete(job.BackgroundJobId);
        }

        _resultService.DeleteResultFiles(job);
        _internalDb.AnalysisJobs.Remove(job);
        await _internalDb.SaveChangesAsync();

        return NoContent();
    }

    private string RequireSessionToken()
    {
        var token = _httpContextAccessor.HttpContext?.Request.Headers["X-Session-Token"].ToString();
        if (string.IsNullOrEmpty(token) || _connectionManager.GetConnectionInfo(token) == null)
            throw new UnauthorizedAccessException("Invalid or missing session token");
        return token;
    }

    private API.Services.ConnectionInfo RequireSession()
    {
        var token = RequireSessionToken();
        return _connectionManager.GetConnectionInfo(token)!;
    }
}
