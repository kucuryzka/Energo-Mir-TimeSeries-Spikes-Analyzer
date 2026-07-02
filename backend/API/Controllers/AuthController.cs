using System;
using System.Data.Common;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using API.DTOs;
using API.Services;
using Microsoft.Data.SqlClient;
using Npgsql;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IConnectionManagerService _connectionManager;

    public AuthController(IConnectionManagerService connectionManager)
    {
        _connectionManager = connectionManager;
    }

    [HttpPost("connect")]
    public async Task<IActionResult> Connect([FromBody] AuthRequest request)
    {
        try
        {
            string connectionString = BuildConnectionString(request);
            
            // Test connection
            using DbConnection conn = request.Provider.ToLower() == "pgsql" 
                ? new NpgsqlConnection(connectionString) 
                : new SqlConnection(connectionString);
                
            await conn.OpenAsync();

            var token = _connectionManager.CreateSession(new API.Services.ConnectionInfo
            {
                Provider = request.Provider.ToLower(),
                ConnectionString = connectionString
            });

            return Ok(new AuthResponse { Token = token, Message = "Connected successfully" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Connection failed: {ex.Message}" });
        }
    }

    private string BuildConnectionString(AuthRequest request)
    {
        if (request.Provider.ToLower() == "pgsql")
        {
            var db = string.IsNullOrEmpty(request.Database) ? "postgres" : request.Database;
            var port = request.Port > 0 ? request.Port : 5432;
            return $"Host={request.Host};Port={port};Database={db};Username={request.Username};Password={request.Password};Timeout=15";
        }
        else
        {
            var db = string.IsNullOrEmpty(request.Database) ? "master" : request.Database;
            var port = request.Port > 0 ? request.Port : 1433;
            // Handle host:port or host,port for SQL Server
            var server = $"{request.Host},{port}";
            return $"Server={server};Database={db};User Id={request.Username};Password={request.Password};TrustServerCertificate=True;MultipleActiveResultSets=true;Connection Timeout=15";
        }
    }
}
