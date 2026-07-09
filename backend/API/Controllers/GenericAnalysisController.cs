using API.Data;
using API.DTOs;
using API.Infrastructure;
using API.Models;
using API.Services;
using API.Sql;
using Core.Enums;
using Dapper;
using Hangfire;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GenericAnalysisController : ControllerBase
{
    private readonly InternalDbContext _internalDb;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly TablePreviewService _tablePreview;
    private readonly AnalysisRequestValidator _requestValidator;
    private readonly SessionContextService _session;
    private readonly AnalysisJobQueryService _jobQueries;

    public GenericAnalysisController(
        InternalDbContext internalDb,
        IBackgroundJobClient backgroundJobClient,
        ISqlDialectProvider dialectProvider,
        TablePreviewService tablePreview,
        AnalysisRequestValidator requestValidator,
        SessionContextService session,
        AnalysisJobQueryService jobQueries)
    {
        _internalDb = internalDb;
        _backgroundJobClient = backgroundJobClient;
        _dialectProvider = dialectProvider;
        _tablePreview = tablePreview;
        _requestValidator = requestValidator;
        _session = session;
        _jobQueries = jobQueries;
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

    [HttpPost("enqueue")]
    public async Task<IActionResult> EnqueueAnalysis([FromBody] GenericAnalysisRequest request)
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
    public async Task<IActionResult> GetHistory([FromQuery] string database, [FromQuery] string schema, [FromQuery] string table) =>
        Ok(await _jobQueries.GetTableScopedHistoryAsync(database, schema, table));

    [HttpDelete("history/{id}")]
    public async Task<IActionResult> DeleteHistoryItem(string id) =>
        await _jobQueries.DeleteJobAsync(id) ? NoContent() : NotFound();

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
            var info = _session.RequireConnection();
            var dialect = _dialectProvider.GetDialect(info.Provider);
            var targetConnStr = DatabaseConnectionHelper.WithDatabase(info.ConnectionString, database);

            using var connection = DatabaseProvider.OpenConnection(info.Provider, targetConnStr);
            await connection.OpenAsync();

            var endDate = GranularityHelper.GetBucketEnd(timestamp, granularity, customMinutes);
            var qualifiedTable = dialect.QualifyTable(schema, table);
            var qualifiedTime = dialect.QualifyColumn(null, timeColumn);
            var whereClause = $"{qualifiedTime} >= @Start AND {qualifiedTime} < @End";
            var sql = dialect.BuildLimitedSelect("*", qualifiedTable, whereClause, 1000);

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

    private async Task<TablePreviewResponse> LoadTablePreviewAsync(
        string database,
        string schema,
        string table,
        string timeColumn,
        int limit)
    {
        var info = _session.RequireConnection();
        return await _tablePreview.LoadAsync(
            info.ConnectionString,
            info.Provider,
            database,
            schema,
            table,
            timeColumn,
            limit);
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
}
