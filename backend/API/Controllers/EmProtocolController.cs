using API.DataSources;
using API.Services;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/em-protocol")]
public class EmProtocolController : ControllerBase
{
    private readonly EmProtocolDataSource _dataSource;
    private readonly TablePreviewService _tablePreview;
    private readonly SessionContextService _session;

    public EmProtocolController(
        EmProtocolDataSource dataSource,
        TablePreviewService tablePreview,
        SessionContextService session
    )
    {
        _dataSource = dataSource;
        _tablePreview = tablePreview;
        _session = session;
    }

    [HttpGet("channels")]
    public async Task<IActionResult> GetChannels([FromQuery] string database, [FromQuery] string? search, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 1;
        if (pageSize > 1000) pageSize = 1000;

        var channels = await _dataSource.GetChannelsAsync(database, search, page, pageSize);
        return Ok(channels);
    }

    [HttpGet("distribution")]
    public async Task<IActionResult> GetDistribution([FromQuery] string database, [FromQuery] DateTime startDate, [FromQuery] DateTime endDate, [FromQuery] string categoryName)
    {
        if (!_dataSource.SupportedDistributions.Contains(categoryName))
            return BadRequest($"Source does not support distribution by '{categoryName}'.");

        var distribution = await _dataSource.GetDistributionAsync(database, startDate, endDate, categoryName);
        return Ok(distribution);
    }

    [HttpGet("preview")]
    public async Task<IActionResult> GetTablePreview([FromQuery] string database, [FromQuery] int limit = 15)
    {
        var info = _session.RequireConnection();
        var preview = await _tablePreview.LoadAsync(
            info.ConnectionString,
            info.Provider,
            database,
            schema: "em_protocol",
            table: "Records",
            timeColumn: "InsertTime",
            limit
        );
        return Ok(preview);
    }

    [HttpGet("point-channels")]
    public async Task<IActionResult> GetPointChannels([FromQuery] string database, [FromQuery] DateTime timestamp, [FromQuery] Core.Enums.TimeGranularity granularity, [FromQuery] int? customMinutes, [FromQuery] int? channelId)
    {
        var breakdown = await _dataSource.GetPointChannelBreakdownAsync(database, timestamp, granularity, customMinutes, channelId);
        return Ok(breakdown);
    }
}
