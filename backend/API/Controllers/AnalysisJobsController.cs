using API.Data;
using API.DTOs;
using API.Services;
using Core.Enums;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/analysis-jobs")]
public class AnalysisJobsController : ControllerBase
{
    private readonly AnalysisJobCoordinatorService _coordinator;
    private readonly AnalysisTimingStatsService _timingStats;
    private readonly SessionContextService _session;
    private readonly InternalDbContext _internalDb;
    private readonly AnalysisResultService _resultService;
    private readonly AnalysisExportService _exportService;
    private readonly AnalysisJobQueryService _jobQueries;

    public AnalysisJobsController(
        AnalysisJobCoordinatorService coordinator,
        AnalysisTimingStatsService timingStats,
        SessionContextService session,
        InternalDbContext internalDb,
        AnalysisResultService resultService,
        AnalysisExportService exportService,
        AnalysisJobQueryService jobQueries)
    {
        _coordinator = coordinator;
        _timingStats = timingStats;
        _session = session;
        _internalDb = internalDb;
        _resultService = resultService;
        _exportService = exportService;
        _jobQueries = jobQueries;
    }

    [HttpPost]
    public async Task<IActionResult> Enqueue([FromBody] EnqueueAnalysisJobRequest request)
    {
        var sessionToken = _session.RequireToken();
        var connection = _session.RequireConnection();
        var jobId = await _coordinator.EnqueueAsync(request, sessionToken, connection);
        return Ok(new { JobId = jobId });
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] string database,
        [FromQuery] string schema,
        [FromQuery] string? table = null)
    {
        if (!string.IsNullOrWhiteSpace(table))
            return Ok(await _jobQueries.GetTableScopedHistoryAsync(database, schema, table));

        return Ok(await _jobQueries.GetChannelScopedHistoryAsync(database, schema));
    }

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview([FromQuery] string? database, [FromQuery] int recentLimit = 50)
    {
        var overview = await _coordinator.GetOverviewAsync(database, recentLimit);
        return Ok(overview);
    }

    [HttpGet("estimate")]
    public async Task<IActionResult> GetEstimate(
        [FromQuery] string database,
        [FromQuery] string schema,
        [FromQuery] string table,
        [FromQuery] TimeGranularity granularity,
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate)
    {
        var estimate = await _timingStats.EstimateAsync(database, schema, table, granularity, startDate, endDate);
        return Ok(estimate);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(string id)
    {
        var job = await _jobQueries.FindJobAsync(id);
        if (job == null) return NotFound();
        return Ok(_jobQueries.BuildStatus(job));
    }

    [HttpGet("{id}/partial-result")]
    public async Task<IActionResult> GetPartialResult(string id)
    {
        var job = await _jobQueries.FindJobAsync(id);
        if (job == null) return NotFound();

        var partial = await _jobQueries.TryLoadPartialAsync(id, job);
        if (partial == null) return NotFound();
        return Ok(partial);
    }

    [HttpGet("{id}/result")]
    public async Task<IActionResult> GetResult(string id)
    {
        var job = await _jobQueries.FindJobAsync(id);
        if (job == null) return NotFound();

        var json = await _jobQueries.SerializeResultAsync(job);
        return Content(json, "application/json");
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id) =>
        await _jobQueries.DeleteJobAsync(id) ? NoContent() : NotFound();

    [HttpPost("{id}/cancel")]
    public async Task<IActionResult> Cancel(string id)
    {
        var cancelled = await _coordinator.TryCancelAsync(id);
        if (!cancelled)
            return BadRequest(new { message = "Задача не найдена или уже завершена." });

        return Ok(new { message = "Задача отменяется." });
    }

    [HttpPost("{id}/resume")]
    public async Task<IActionResult> Resume(string id)
    {
        var sessionToken = _session.RequireToken();
        _ = _session.RequireConnection();
        var (ok, error) = await _coordinator.TryResumeAsync(id, sessionToken);
        if (!ok)
            return BadRequest(new { message = error });

        return Ok(new { message = "Задача поставлена в очередь для продолжения." });
    }

    [HttpGet("{id}/export")]
    public async Task<IActionResult> Export(
        string id,
        CancellationToken cancellationToken = default)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync([id], cancellationToken);
        if (job == null)
            return NotFound(new { message = "Задача не найдена." });

        if (!_resultService.CanExport(job))
            return BadRequest(new { message = "Результат анализа недоступен для экспорта." });

        var (stream, fileName) = await _exportService.BuildExcelAsync(job, cancellationToken);
        await using (stream)
        {
            var bytes = stream.ToArray();
            if (bytes.Length == 0)
                return StatusCode(500, new { message = "Не удалось сформировать Excel: пустой файл." });

            return File(
                bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                fileName);
        }
    }

    [HttpPost("~/api/dbo/enqueue")]
    public Task<IActionResult> EnqueueDboLegacy([FromBody] DetectSpikesRequest request) =>
        EnqueueSourceLegacy(request, "dbo");

    [HttpPost("~/api/em-protocol/enqueue")]
    public Task<IActionResult> EnqueueEmProtocolLegacy([FromBody] DetectSpikesRequest request) =>
        EnqueueSourceLegacy(request, "em_protocol");

    [HttpPost("~/api/GenericAnalysis/enqueue")]
    public async Task<IActionResult> EnqueueGenericLegacy([FromBody] GenericAnalysisRequest request)
    {
        var sessionToken = _session.RequireToken();
        var connection = _session.RequireConnection();
        var jobId = await _coordinator.EnqueueGenericAnalysisAsync(request, sessionToken, connection);
        return Ok(new { JobId = jobId });
    }

    [HttpGet("~/api/dbo/status/{id}")]
    [HttpGet("~/api/em-protocol/status/{id}")]
    [HttpGet("~/api/GenericAnalysis/status/{id}")]
    public Task<IActionResult> GetStatusLegacy(string id) => Get(id);

    [HttpGet("~/api/dbo/partial-result/{id}")]
    [HttpGet("~/api/em-protocol/partial-result/{id}")]
    [HttpGet("~/api/GenericAnalysis/partial-result/{id}")]
    public Task<IActionResult> GetPartialResultLegacy(string id) => GetPartialResult(id);

    [HttpGet("~/api/dbo/result/{id}")]
    [HttpGet("~/api/em-protocol/result/{id}")]
    [HttpGet("~/api/GenericAnalysis/result/{id}")]
    public Task<IActionResult> GetResultLegacy(string id) => GetResult(id);

    [HttpGet("~/api/dbo/history")]
    public async Task<IActionResult> ListDboLegacy([FromQuery] string database) =>
        Ok(await _jobQueries.GetChannelScopedHistoryAsync(database, "dbo"));

    [HttpGet("~/api/em-protocol/history")]
    public async Task<IActionResult> ListEmProtocolLegacy([FromQuery] string database) =>
        Ok(await _jobQueries.GetChannelScopedHistoryAsync(database, "em_protocol"));

    [HttpGet("~/api/GenericAnalysis/history")]
    public async Task<IActionResult> ListGenericLegacy(
        [FromQuery] string database,
        [FromQuery] string schema,
        [FromQuery] string table) =>
        Ok(await _jobQueries.GetTableScopedHistoryAsync(database, schema, table));

    [HttpDelete("~/api/dbo/history/{id}")]
    [HttpDelete("~/api/em-protocol/history/{id}")]
    [HttpDelete("~/api/GenericAnalysis/history/{id}")]
    public Task<IActionResult> DeleteLegacy(string id) => Delete(id);

    private async Task<IActionResult> EnqueueSourceLegacy(DetectSpikesRequest request, string sourceId)
    {
        var sessionToken = _session.RequireToken();
        var connection = _session.RequireConnection();
        var jobId = await _coordinator.EnqueueSourceAnalysisAsync(
            request, schema: sourceId, sourceId, sessionToken, connection);
        return Ok(new { JobId = jobId });
    }
}
