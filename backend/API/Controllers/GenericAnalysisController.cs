using API.DTOs;
using API.Services;
using Core.Enums;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GenericAnalysisController : ControllerBase
{
    private readonly TablePreviewService _tablePreview;
    private readonly GenericTableQueryService _tableQuery;
    private readonly AnalysisRequestValidator _requestValidator;
    private readonly SessionContextService _session;

    public GenericAnalysisController(
        TablePreviewService tablePreview,
        GenericTableQueryService tableQuery,
        AnalysisRequestValidator requestValidator,
        SessionContextService session
    )
    {
        _tablePreview = tablePreview;
        _tableQuery = tableQuery;
        _requestValidator = requestValidator;
        _session = session;
    }

    [HttpGet("preview")]
    public async Task<IActionResult> GetTablePreview(
        [FromQuery] string database,
        [FromQuery] string schema,
        [FromQuery] string table,
        [FromQuery] string timeColumn,
        [FromQuery] int limit = 15
    )
    {
        _requestValidator.ValidateIdentifiers(schema, table, timeColumn);
        var info = _session.RequireConnection();
        var preview = await _tablePreview.LoadAsync(
            info.ConnectionString,
            info.Provider,
            database,
            schema,
            table,
            timeColumn,
            limit
        );
        return Ok(preview);
    }

    [HttpGet("point-details")]
    public async Task<IActionResult> GetPointDetails(
        [FromQuery] string database,
        [FromQuery] string schema,
        [FromQuery] string table,
        [FromQuery] string timeColumn,
        [FromQuery] DateTime timestamp,
        [FromQuery] TimeGranularity granularity,
        [FromQuery] int? customMinutes
    )
    {
        _requestValidator.ValidateIdentifiers(schema, table, timeColumn);
        var result = await _tableQuery.GetPointDetailsAsync(
            database, schema, table, timeColumn, timestamp, granularity, customMinutes
        );
        return Ok(result);
    }
}
