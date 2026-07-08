using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using API.Services;
using API.Sql;
using Dapper;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExplorerController : ControllerBase
{
    private readonly IConnectionManagerService _connectionManager;
    private readonly ISqlDialectProvider _dialectProvider;

    public ExplorerController(
        IConnectionManagerService connectionManager,
        ISqlDialectProvider dialectProvider)
    {
        _connectionManager = connectionManager;
        _dialectProvider = dialectProvider;
    }

    private API.Services.ConnectionInfo RequireSession()
    {
        var token = Request.Headers["X-Session-Token"].ToString();
        var info = _connectionManager.GetConnectionInfo(token);
        if (info == null) throw new UnauthorizedAccessException("Invalid or missing session token");
        return info;
    }

    private static DbConnection OpenConnection(API.Services.ConnectionInfo info, string? database = null)
    {
        var builder = new DbConnectionStringBuilder { ConnectionString = info.ConnectionString };
        if (!string.IsNullOrEmpty(database))
            builder["Database"] = database;
        return DatabaseProvider.OpenConnection(info.Provider, builder.ConnectionString);
    }

    [HttpGet("databases")]
    public async Task<IActionResult> GetDatabases()
    {
        try
        {
            var info = RequireSession();
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
            var info = RequireSession();
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
            var info = RequireSession();
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
            var info = RequireSession();
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
        catch (Exception ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }
}
