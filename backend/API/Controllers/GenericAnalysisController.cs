using System;
using System.Data.Common;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using API.Services;
using API.DTOs;
using Core.Enums;
using Dapper;
using Microsoft.Data.SqlClient;
using Npgsql;
using API.Data;
using Hangfire;
using API.Models;
using API.DataSources;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

public class GenericAnalysisRequest
{
    public string Database { get; set; } = string.Empty;
    public string Schema { get; set; } = string.Empty;
    public string Table { get; set; } = string.Empty;
    public string TimeColumn { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public TimeGranularity Granularity { get; set; } = TimeGranularity.Hour;
    public int? CustomMinutes { get; set; }
    public double? Confidence { get; set; }
    public int? WindowSize { get; set; }
}

[ApiController]
[Route("api/[controller]")]
public class GenericAnalysisController : ControllerBase
{
    private readonly IConnectionManagerService _connectionManager;
    private readonly InternalDbContext _internalDb;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly AnalysisPipelineService _pipeline;
    private readonly API.Sql.ISqlDialectProvider _dialectProvider;
    private readonly AnalysisResultService _resultService;
    private readonly TablePreviewService _tablePreview;
    private readonly AnalysisRequestValidator _requestValidator;

    public GenericAnalysisController(
        IConnectionManagerService connectionManager,
        InternalDbContext internalDb,
        IBackgroundJobClient backgroundJobClient,
        AnalysisPipelineService pipeline,
        API.Sql.ISqlDialectProvider dialectProvider,
        AnalysisResultService resultService,
        TablePreviewService tablePreview,
        AnalysisRequestValidator requestValidator)
    {
        _connectionManager = connectionManager;
        _internalDb = internalDb;
        _backgroundJobClient = backgroundJobClient;
        _pipeline = pipeline;
        _dialectProvider = dialectProvider;
        _resultService = resultService;
        _tablePreview = tablePreview;
        _requestValidator = requestValidator;
    }

    [HttpGet("preview")]
    public async Task<IActionResult> GetTablePreview(
        [FromQuery] string database,
        [FromQuery] string schema,
        [FromQuery] string table,
        [FromQuery] string timeColumn,
        [FromQuery] int limit = 15)
    {
        try
        {
            var preview = await LoadTablePreviewAsync(database, schema, table, timeColumn, limit);
            return Ok(preview);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error fetching table preview", details = ex.Message });
        }
    }

    private async Task<TablePreviewResponse> LoadTablePreviewAsync(
        string database,
        string schema,
        string table,
        string timeColumn,
        int limit)
    {
        var info = RequireSession();
        return await _tablePreview.LoadAsync(
            info.ConnectionString,
            info.Provider,
            database,
            schema,
            table,
            timeColumn,
            limit);
    }

    [HttpPost("enqueue")]
    public async Task<IActionResult> EnqueueAnalysis([FromBody] GenericAnalysisRequest request)
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

            var job = CreateJobFromRequest(request);
            _internalDb.AnalysisJobs.Add(job);
            await _internalDb.SaveChangesAsync();

            var hangfireId = _backgroundJobClient.Enqueue<AnalysisJobProcessor>(
                p => p.ProcessJobAsync(job.Id, sessionToken));

            job.BackgroundJobId = hangfireId;
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
        if (job.Status is not ("Running" or "Completed"))
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
    public async Task<IActionResult> GetHistory([FromQuery] string database, [FromQuery] string schema, [FromQuery] string table)
    {
        var history = await _internalDb.AnalysisJobs
            .Where(j => j.Database == database && j.Schema == schema && j.Table == table)
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
                j.SeriesPointCount
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
            _backgroundJobClient.Delete(job.BackgroundJobId);

        _resultService.DeleteResultFiles(job);
        _internalDb.AnalysisJobs.Remove(job);
        await _internalDb.SaveChangesAsync();

        return NoContent();
    }

    [HttpPost("analyze")]
    public async Task<IActionResult> Analyze([FromBody] GenericAnalysisRequest request, [FromServices] Core.Interfaces.ISpikeDetectionService spikeDetectionService)
    {
        try
        {
            var info = RequireSession();
            _requestValidator.Validate(
                request.StartDate,
                request.EndDate,
                request.Granularity,
                request.WindowSize,
                request.CustomMinutes);

            var spec = new AnalysisTableSpec
            {
                Schema = request.Schema,
                Table = request.Table,
                TimeColumn = request.TimeColumn
            };

            var response = await _pipeline.ExecuteAsync(
                spec,
                request.StartDate,
                request.EndDate,
                request.Granularity,
                request.CustomMinutes,
                channelId: null,
                request.Confidence ?? 95,
                request.WindowSize ?? 30,
                spikeDetectionService,
                info.ConnectionString,
                info.Provider,
                request.Database);

            return Ok(response);
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
            return StatusCode(500, new { message = "An error occurred during generic analysis.", details = ex.Message });
        }
    }

    [HttpGet("point-details")]
    public async Task<IActionResult> GetPointDetails(
        [FromQuery] string database,
        [FromQuery] string schema,
        [FromQuery] string table,
        [FromQuery] string timeColumn,
        [FromQuery] DateTime timestamp,
        [FromQuery] TimeGranularity granularity,
        [FromQuery] int? customMinutes)
    {
        try
        {
            var info = RequireSession();
            var dialect = _dialectProvider.GetDialect(info.Provider);
            var targetConnStr = BuildTargetConnectionString(info.ConnectionString, database);

            using var connection = DatabaseProvider.OpenConnection(info.Provider, targetConnStr);
            await connection.OpenAsync();

            var endDate = granularity switch
            {
                TimeGranularity.Minute => timestamp.AddMinutes(1),
                TimeGranularity.Hour => timestamp.AddHours(1),
                TimeGranularity.Day => timestamp.AddDays(1),
                TimeGranularity.Week => timestamp.AddDays(7),
                TimeGranularity.Month => timestamp.AddMonths(1),
                TimeGranularity.Custom => timestamp.AddMinutes(customMinutes ?? 60),
                _ => timestamp.AddHours(1)
            };

            var qualifiedTable = dialect.QualifyTable(schema, table);
            var qualifiedTime = dialect.QualifyColumn(null, timeColumn);

            var sql = dialect.ProviderId == "pgsql"
                ? $"SELECT * FROM {qualifiedTable} WHERE {qualifiedTime} >= @Start AND {qualifiedTime} < @End {dialect.LimitClause(1000)}"
                : $"SELECT {dialect.LimitClause(1000)} * FROM {qualifiedTable} WHERE {qualifiedTime} >= @Start AND {qualifiedTime} < @End";

            var result = await connection.QueryAsync(sql, new { Start = timestamp, End = endDate });
            return Ok(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ex.Message);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "An error occurred fetching point details.", details = ex.Message });
        }
    }

    private string RequireSessionToken()
    {
        var token = Request.Headers["X-Session-Token"].ToString();
        if (string.IsNullOrEmpty(token) || _connectionManager.GetConnectionInfo(token) == null)
            throw new UnauthorizedAccessException("Invalid or missing session token");
        return token;
    }

    private API.Services.ConnectionInfo RequireSession()
    {
        var token = RequireSessionToken();
        return _connectionManager.GetConnectionInfo(token)!;
    }

    private static AnalysisJob CreateJobFromRequest(GenericAnalysisRequest request) => new()
    {
        Database = request.Database,
        Schema = request.Schema,
        Table = request.Table,
        TimeColumn = request.TimeColumn,
        StartDate = request.StartDate,
        EndDate = request.EndDate,
        Granularity = request.Granularity,
        CustomMinutes = request.CustomMinutes,
        Confidence = request.Confidence,
        WindowSize = request.WindowSize
    };

    private static string BuildTargetConnectionString(string connectionString, string database)
    {
        var connStrBuilder = new DbConnectionStringBuilder { ConnectionString = connectionString };
        connStrBuilder["Database"] = database;
        return connStrBuilder.ConnectionString;
    }
}
