using System.Data.Common;
using API.Contracts;
using API.DTOs;
using API.Infrastructure;
using API.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

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

    [AllowAnonymous]
    [HttpPost("connect")]
    public async Task<IActionResult> Connect([FromBody] AuthRequest request)
    {
        try
        {
            string connectionString = BuildConnectionString(request);
            var normalizedProvider = DatabaseProvider.Normalize(request.Provider);

            using DbConnection conn = DatabaseProvider.OpenConnection(normalizedProvider, connectionString);
            await conn.OpenAsync();

            var token = _connectionManager.CreateSession(new DatabaseSessionInfo
            {
                Provider = normalizedProvider,
                ConnectionString = connectionString
            });

            return Ok(new AuthResponse { Token = token, Message = "Connected successfully" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { Message = $"Connection failed: {ex.Message}" });
        }
    }

    [HttpPost("disconnect")]
    public IActionResult Disconnect([FromServices] SessionContextService session)
    {
        var token = session.GetToken();
        if (string.IsNullOrEmpty(token) || _connectionManager.GetConnectionInfo(token) == null)
            return Unauthorized(new { Message = "Invalid or missing session token" });

        _connectionManager.RemoveSession(token);
        return Ok(new { Message = "Disconnected successfully" });
    }

    private string BuildConnectionString(AuthRequest request)
    {
        if (DatabaseProvider.IsPostgres(request.Provider))
        {
            var db = string.IsNullOrEmpty(request.Database) ? "postgres" : request.Database;
            var port = request.Port > 0 ? request.Port : 5432;
            return $"Host={request.Host};Port={port};Database={db};Username={request.Username};Password={request.Password};Timeout=15";
        }

        var sqlDb = string.IsNullOrEmpty(request.Database) ? "master" : request.Database;
        var sqlPort = request.Port > 0 ? request.Port : 1433;
        var server = $"{request.Host},{sqlPort}";
        return $"Server={server};Database={sqlDb};User Id={request.Username};Password={request.Password};TrustServerCertificate=True;MultipleActiveResultSets=true;Connection Timeout=15";
    }
}
