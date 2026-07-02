using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Core.Interfaces;
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
    private readonly ISpikeDetectionService _spikeDetectionService;
    private readonly InternalDbContext _internalDb;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly API.Services.IConnectionManagerService _connectionManager;
    private readonly Microsoft.AspNetCore.Http.IHttpContextAccessor _httpContextAccessor;

    public EmProtocolController(
        IEnumerable<IDataSourceStrategy> dataSourceStrategies,
        ISpikeDetectionService spikeDetectionService,
        InternalDbContext internalDb,
        IBackgroundJobClient backgroundJobClient,
        API.Services.IConnectionManagerService connectionManager,
        Microsoft.AspNetCore.Http.IHttpContextAccessor httpContextAccessor)
    {
        _dataSource = dataSourceStrategies.OfType<EmProtocolDataSource>().FirstOrDefault() 
            ?? throw new Exception("EmProtocolDataSource not registered.");
        _spikeDetectionService = spikeDetectionService;
        _internalDb = internalDb;
        _backgroundJobClient = backgroundJobClient;
        _connectionManager = connectionManager;
        _httpContextAccessor = httpContextAccessor;
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

            var token = _httpContextAccessor.HttpContext?.Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token ?? "");
            if (info == null) return Unauthorized("Invalid or missing session token");

            // The strategy encapsulates all logic including DB querying, aggregation, 
            // spike detection calling, and channel naming.
            var response = await _dataSource.ExecuteAnalysisAsync(request, _spikeDetectionService, info.ConnectionString, info.Provider);

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

    [HttpPost("enqueue")]
    public async Task<IActionResult> EnqueueAnalysis([FromBody] DetectSpikesRequest request)
    {
        try
        {
            var job = new AnalysisJob
            {
                Database = request.Database,
                Schema = "em_protocol", // hardcoded for history filtering
                Table = request.ChannelId?.ToString() ?? "All", // store channelId in Table
                TimeColumn = "", // Not used
                StartDate = request.StartDate,
                EndDate = request.EndDate,
                Granularity = request.Granularity,
                CustomMinutes = request.CustomMinutes,
                Confidence = request.Confidence,
                WindowSize = request.WindowSize
            };

            _internalDb.AnalysisJobs.Add(job);
            await _internalDb.SaveChangesAsync();

            var token = _httpContextAccessor.HttpContext?.Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token ?? "");
            if (info == null) return Unauthorized("Invalid or missing session token");

            var jobId = _backgroundJobClient.Enqueue<API.Services.AnalysisJobProcessor>(
                p => p.ProcessLegacyJobAsync(job.Id, "em_protocol", info.Provider, info.ConnectionString)
            );
            
            job.BackgroundJobId = jobId;
            await _internalDb.SaveChangesAsync();

            return Ok(new { JobId = job.Id });
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
            HasResult = job.ResultJson != null 
        });
    }

    [HttpGet("result/{id}")]
    public async Task<IActionResult> GetJobResult(string id)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(id);
        if (job == null) return NotFound();
        if (string.IsNullOrEmpty(job.ResultJson)) return BadRequest("Result is not ready or failed");

        return Content(job.ResultJson, "application/json");
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] string database)
    {
        var history = await _internalDb.AnalysisJobs
            .Where(j => j.Database == database && j.Schema == "em_protocol")
            .OrderByDescending(j => j.CreatedAt)
            .Select(j => new {
                j.Id,
                j.StartDate,
                j.EndDate,
                j.Granularity,
                j.Status,
                j.Progress,
                j.CreatedAt,
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

        _internalDb.AnalysisJobs.Remove(job);
        await _internalDb.SaveChangesAsync();

        return NoContent();
    }
}
