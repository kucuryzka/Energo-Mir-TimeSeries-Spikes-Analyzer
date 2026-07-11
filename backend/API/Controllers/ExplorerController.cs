using System.Data.Common;
using API.Infrastructure;
using API.Models;
using API.Sql;
using Dapper;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExplorerController : ControllerBase
{
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly SessionContextService _session;

    public ExplorerController(
        ISqlDialectProvider dialectProvider,
        SessionContextService session)
    {
        _dialectProvider = dialectProvider;
        _session = session;
    }

    private static DbConnection OpenConnection(DatabaseSessionInfo info, string? database = null)
    {
        var connectionString = string.IsNullOrEmpty(database)
            ? info.ConnectionString
            : DatabaseConnectionHelper.WithDatabase(info.ConnectionString, database);
        return DatabaseProvider.OpenConnection(info.Provider, connectionString);
    }

    [HttpGet("databases")]
    public async Task<IActionResult> GetDatabases()
    {
        try
        {
            var info = _session.RequireConnection();
            var dialect = _dialectProvider.GetDialect(info.Provider);
            using var conn = OpenConnection(info);
            await conn.OpenAsync();

            var dbs = await conn.QueryAsync<string>(dialect.BuildListDatabasesSql());
            return Ok(dbs);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ex.Message);
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    [HttpGet("schemas")]
    public async Task<IActionResult> GetSchemas([FromQuery] string database)
    {
        try
        {
            var info = _session.RequireConnection();
            var dialect = _dialectProvider.GetDialect(info.Provider);
            using var conn = OpenConnection(info, database);
            await conn.OpenAsync();

            var schemas = await conn.QueryAsync<string>(dialect.BuildListSchemasSql());
            return Ok(schemas);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ex.Message);
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    [HttpGet("tables")]
    public async Task<IActionResult> GetTables([FromQuery] string database, [FromQuery] string schema)
    {
        try
        {
            SqlIdentifier.EnsureSafe(schema, nameof(schema));
            var info = _session.RequireConnection();
            var dialect = _dialectProvider.GetDialect(info.Provider);
            using var conn = OpenConnection(info, database);
            await conn.OpenAsync();

            var tables = await conn.QueryAsync<string>(dialect.BuildListTablesSql(), new { schema });
            return Ok(tables);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ex.Message);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }

    [HttpGet("columns")]
    public async Task<IActionResult> GetColumns([FromQuery] string database, [FromQuery] string schema, [FromQuery] string table)
    {
        try
        {
            SqlIdentifier.EnsureSafeMany((schema, nameof(schema)), (table, nameof(table)));
            var info = _session.RequireConnection();
            var dialect = _dialectProvider.GetDialect(info.Provider);
            using var conn = OpenConnection(info, database);
            await conn.OpenAsync();

            var columns = await conn.QueryAsync<dynamic>(dialect.BuildListColumnsSql(), new { schema, table });
            var result = columns.Select(c => new { Name = (string)c.Name, IsTimeColumn = (bool)c.IsTimeColumn });
            return Ok(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Unauthorized(ex.Message);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }
}
