using API.Infrastructure;
using API.Services;
using API.Data;
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

    public AnalysisJobsController(
        AnalysisJobCoordinatorService coordinator,
        AnalysisTimingStatsService timingStats,
        SessionContextService session,
        InternalDbContext internalDb,
        AnalysisResultService resultService,
        AnalysisExportService exportService)
    {
        _coordinator = coordinator;
        _timingStats = timingStats;
        _session = session;
        _internalDb = internalDb;
        _resultService = resultService;
        _exportService = exportService;
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

        try
        {
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
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Не удалось сформировать Excel.", details = ex.Message });
        }
    }
}
