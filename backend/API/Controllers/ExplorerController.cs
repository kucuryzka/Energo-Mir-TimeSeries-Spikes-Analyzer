using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using API.Services;
using Dapper;
using Microsoft.Data.SqlClient;
using Npgsql;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExplorerController : ControllerBase
{
    private readonly IConnectionManagerService _connectionManager;

    public ExplorerController(IConnectionManagerService connectionManager)
    {
        _connectionManager = connectionManager;
    }

    private DbConnection GetConnection()
    {
        var token = Request.Headers["X-Session-Token"].ToString();
        var info = _connectionManager.GetConnectionInfo(token);
        if (info == null) throw new Exception("Invalid or missing session token");

        return info.Provider == "pgsql" 
            ? new NpgsqlConnection(info.ConnectionString) 
            : new SqlConnection(info.ConnectionString);
    }

    [HttpGet("databases")]
    public async Task<IActionResult> GetDatabases()
    {
        try
        {
            using var conn = GetConnection();
            await conn.OpenAsync();
            
            var token = Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token)!;
            
            IEnumerable<string> dbs;
            if (info.Provider == "pgsql")
            {
                dbs = await conn.QueryAsync<string>("SELECT datname FROM pg_database WHERE datistemplate = false;");
            }
            else
            {
                dbs = await conn.QueryAsync<string>("SELECT name FROM sys.databases WHERE state_desc = 'ONLINE';");
            }
            return Ok(dbs);
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
            var token = Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token);
            if (info == null) return Unauthorized();

            // Need to connect to the specific database
            var builder = new DbConnectionStringBuilder { ConnectionString = info.ConnectionString };
            if (info.Provider == "pgsql") builder["Database"] = database;
            else builder["Database"] = database;

            using DbConnection conn = info.Provider == "pgsql" 
                ? new NpgsqlConnection(builder.ConnectionString) 
                : new SqlConnection(builder.ConnectionString);

            await conn.OpenAsync();

            IEnumerable<string> schemas;
            if (info.Provider == "pgsql")
            {
                schemas = await conn.QueryAsync<string>("SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog');");
            }
            else
            {
                schemas = await conn.QueryAsync<string>("SELECT name FROM sys.schemas WHERE principal_id = 1;"); // Usually dbo
            }
            return Ok(schemas);
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
            var token = Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token);
            if (info == null) return Unauthorized();

            var builder = new DbConnectionStringBuilder { ConnectionString = info.ConnectionString };
            builder["Database"] = database;

            using DbConnection conn = info.Provider == "pgsql" 
                ? new NpgsqlConnection(builder.ConnectionString) 
                : new SqlConnection(builder.ConnectionString);

            await conn.OpenAsync();

            IEnumerable<string> tables;
            if (info.Provider == "pgsql")
            {
                tables = await conn.QueryAsync<string>("SELECT table_name FROM information_schema.tables WHERE table_schema = @schema AND table_type = 'BASE TABLE';", new { schema });
            }
            else
            {
                tables = await conn.QueryAsync<string>("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema AND TABLE_TYPE = 'BASE TABLE';", new { schema });
            }
            return Ok(tables);
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
            var token = Request.Headers["X-Session-Token"].ToString();
            var info = _connectionManager.GetConnectionInfo(token);
            if (info == null) return Unauthorized();

            var builder = new DbConnectionStringBuilder { ConnectionString = info.ConnectionString };
            builder["Database"] = database;

            using DbConnection conn = info.Provider == "pgsql" 
                ? new NpgsqlConnection(builder.ConnectionString) 
                : new SqlConnection(builder.ConnectionString);

            await conn.OpenAsync();

            IEnumerable<dynamic> columns;
            if (info.Provider == "pgsql")
            {
                columns = await conn.QueryAsync<dynamic>(
                    "SELECT column_name as Name, CASE WHEN data_type IN ('timestamp without time zone', 'timestamp with time zone', 'date') THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END as IsTimeColumn FROM information_schema.columns WHERE table_schema = @schema AND table_name = @table;", 
                    new { schema, table });
            }
            else
            {
                columns = await conn.QueryAsync<dynamic>(
                    "SELECT COLUMN_NAME as Name, CASE WHEN DATA_TYPE IN ('datetime', 'datetime2', 'date', 'smalldatetime') THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END as IsTimeColumn FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table;", 
                    new { schema, table });
            }
            
            var result = columns.Select(c => new { Name = (string)c.Name, IsTimeColumn = (bool)c.IsTimeColumn });
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = ex.Message });
        }
    }
}
