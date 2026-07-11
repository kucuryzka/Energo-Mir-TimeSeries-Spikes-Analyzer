using API.DataSources;
using API.Services;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/dbo")]
public class DboController : ControllerBase
{
    private readonly DboDataSource _dataSource;
    private readonly TablePreviewService _tablePreview;
    private readonly SessionContextService _session;

    public DboController(
        DboDataSource dataSource,
        TablePreviewService tablePreview,
        SessionContextService session)
    {
        _dataSource = dataSource;
        _tablePreview = tablePreview;
        _session = session;
    }

    [HttpGet("objects")]
    public async Task<IActionResult> GetObjects([FromQuery] string database, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 1;
        if (pageSize > 1000) pageSize = 1000;

        var objects = await _dataSource.GetObjectsAsync(database, search, page, pageSize);
        return Ok(objects);
    }

    [HttpGet("preview")]
    public async Task<IActionResult> GetTablePreview([FromQuery] string database, [FromQuery] int limit = 15)
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

    [HttpGet("point-details")]
    public async Task<IActionResult> GetPointDetails([FromQuery] string database, [FromQuery] DateTime timestamp, [FromQuery] Core.Enums.TimeGranularity granularity, [FromQuery] int? customMinutes, [FromQuery] int? channelId)
    {
        var details = await _dataSource.GetPointDetailsAsync(database, timestamp, granularity, customMinutes, channelId);
        return Ok(details);
    }

    [HttpGet("point-channels")]
    public async Task<IActionResult> GetPointChannels([FromQuery] string database, [FromQuery] DateTime timestamp, [FromQuery] Core.Enums.TimeGranularity granularity, [FromQuery] int? customMinutes, [FromQuery] int? channelId)
    {
        var breakdown = await _dataSource.GetPointChannelBreakdownAsync(database, timestamp, granularity, customMinutes, channelId);
        return Ok(breakdown);
    }

    [HttpGet("distribution")]
    public async Task<IActionResult> GetDistribution(
        [FromQuery] string database,
        [FromQuery] DateTime startDate,
        [FromQuery] DateTime endDate,
        [FromQuery] int? channelId)
    {
        var distribution = await _dataSource.GetObjectDistributionAsync(database, startDate, endDate, channelId);
        return Ok(distribution);
    }
}
