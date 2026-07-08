using API.Contracts;
using API.Models;

namespace API.Infrastructure;

public class DataSourceConnectionResolver
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IConnectionManagerService _connectionManager;

    public DataSourceConnectionResolver(
        IHttpContextAccessor httpContextAccessor,
        IConnectionManagerService connectionManager)
    {
        _httpContextAccessor = httpContextAccessor;
        _connectionManager = connectionManager;
    }

    public (string ConnectionString, string Provider) Resolve(string? connectionString, string? provider)
    {
        if (connectionString != null && provider != null)
            return (connectionString, provider);

        var token = _httpContextAccessor.HttpContext?.Request.Headers["X-Session-Token"].ToString();
        var info = _connectionManager.GetConnectionInfo(token ?? "");
        if (info == null)
            throw new UnauthorizedAccessException("Invalid or missing session token");

        return (info.ConnectionString, info.Provider);
    }
}
