using API.Services;
using API.Data;
using Core.Enums;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

[ApiController]
[Route("api/analysis-jobs")]
public class AnalysisJobsController : ControllerBase
{
    private readonly AnalysisJobCoordinatorService _coordinator;
    private readonly AnalysisTimingStatsService _timingStats;
    private readonly IConnectionManagerService _connectionManager;
    private readonly InternalDbContext _internalDb;
    private readonly AnalysisResultService _resultService;
    private readonly AnalysisExportService _exportService;

    public AnalysisJobsController(
        AnalysisJobCoordinatorService coordinator,
        AnalysisTimingStatsService timingStats,
        IConnectionManagerService connectionManager,
        InternalDbContext internalDb,
        AnalysisResultService resultService,
        AnalysisExportService exportService)
    {
        _coordinator = coordinator;
        _timingStats = timingStats;
        _connectionManager = connectionManager;
        _internalDb = internalDb;
        _resultService = resultService;
        _exportService = exportService;
    }

    [HttpGet("queue")]
    public async Task<IActionResult> GetQueue([FromQuery] string? database)
    {
        if (!HasValidSession())
            return Unauthorized();

        var queue = await _coordinator.GetQueueAsync(database);
        return Ok(queue);
    }

    [HttpGet("overview")]
    public async Task<IActionResult> GetOverview([FromQuery] string? database, [FromQuery] int recentLimit = 50)
    {
        if (!HasValidSession())
            return Unauthorized();

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
        if (!HasValidSession())
            return Unauthorized();

        var estimate = await _timingStats.EstimateAsync(database, schema, table, granularity, startDate, endDate);
        return Ok(estimate);
    }

    [HttpPost("{id}/cancel")]
    public async Task<IActionResult> Cancel(string id)
    {
        if (!HasValidSession())
            return Unauthorized();

        var cancelled = await _coordinator.TryCancelAsync(id);
        if (!cancelled)
            return BadRequest(new { message = "Задача не найдена или уже завершена." });

        return Ok(new { message = "Задача отменяется." });
    }

    [HttpGet("{id}/export")]
    public async Task<IActionResult> Export(
        string id,
        [FromQuery] bool loadDistribution = false,
        CancellationToken cancellationToken = default)
    {
        if (!HasValidSession())
            return Unauthorized(new { message = "Invalid or missing session token" });

        var job = await _internalDb.AnalysisJobs.FindAsync([id], cancellationToken);
        if (job == null)
            return NotFound(new { message = "Задача не найдена." });

        if (!_resultService.CanExport(job))
            return BadRequest(new { message = "Результат анализа недоступен для экспорта." });

        try
        {
            var (stream, fileName) = await _exportService.BuildExcelAsync(job, loadDistribution, cancellationToken);
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

    private bool HasValidSession()
    {
        var token = Request.Headers["X-Session-Token"].ToString();
        return !string.IsNullOrEmpty(token) && _connectionManager.GetConnectionInfo(token) != null;
    }
}
