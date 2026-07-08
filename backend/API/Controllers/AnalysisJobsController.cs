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
    private readonly IConnectionManagerService _connectionManager;

    public AnalysisJobsController(
        AnalysisJobCoordinatorService coordinator,
        AnalysisTimingStatsService timingStats,
        IConnectionManagerService connectionManager)
    {
        _coordinator = coordinator;
        _timingStats = timingStats;
        _connectionManager = connectionManager;
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

    private bool HasValidSession()
    {
        var token = Request.Headers["X-Session-Token"].ToString();
        return !string.IsNullOrEmpty(token) && _connectionManager.GetConnectionInfo(token) != null;
    }
}
