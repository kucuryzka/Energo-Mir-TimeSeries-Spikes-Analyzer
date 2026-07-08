using API.Services;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/analysis-jobs")]
public class AnalysisJobsController : ControllerBase
{
    private readonly AnalysisJobCoordinatorService _coordinator;
    private readonly IConnectionManagerService _connectionManager;

    public AnalysisJobsController(
        AnalysisJobCoordinatorService coordinator,
        IConnectionManagerService connectionManager)
    {
        _coordinator = coordinator;
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
