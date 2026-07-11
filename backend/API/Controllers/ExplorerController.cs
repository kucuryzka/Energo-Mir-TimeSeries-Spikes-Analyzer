using API.Services;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExplorerController : ControllerBase
{
    private readonly DatabaseCatalogService _catalog;

    public ExplorerController(DatabaseCatalogService catalog)
    {
        _catalog = catalog;
    }

    [HttpGet("databases")]
    public async Task<IActionResult> GetDatabases() =>
        Ok(await _catalog.ListDatabasesAsync());

    [HttpGet("schemas")]
    public async Task<IActionResult> GetSchemas([FromQuery] string database) =>
        Ok(await _catalog.ListSchemasAsync(database));

    [HttpGet("tables")]
    public async Task<IActionResult> GetTables([FromQuery] string database, [FromQuery] string schema) =>
        Ok(await _catalog.ListTablesAsync(database, schema));

    [HttpGet("columns")]
    public async Task<IActionResult> GetColumns(
        [FromQuery] string database,
        [FromQuery] string schema,
        [FromQuery] string table
    ) =>
        Ok(await _catalog.ListColumnsAsync(database, schema, table));
}
