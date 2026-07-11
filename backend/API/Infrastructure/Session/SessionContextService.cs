using API.Contracts;
using API.Models;

namespace API.Infrastructure.Session;

public class SessionContextService
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private readonly IConnectionManagerService _connectionManager;

    public SessionContextService(
        IHttpContextAccessor httpContextAccessor,
        IConnectionManagerService connectionManager
    )
    {
        _httpContextAccessor = httpContextAccessor;
        _connectionManager = connectionManager;
    }

    public string? GetToken() =>
        _httpContextAccessor.HttpContext?.Request.Headers["X-Session-Token"].ToString();

    public bool IsAuthenticated()
    {
        var token = GetToken();
        return !string.IsNullOrEmpty(token) && _connectionManager.GetConnectionInfo(token) != null;
    }

    public string RequireToken()
    {
        var token = GetToken();
        if (string.IsNullOrEmpty(token) || _connectionManager.GetConnectionInfo(token) == null)
            throw new UnauthorizedAccessException("Invalid or missing session token");
        return token;
    }

    public DatabaseSessionInfo RequireConnection()
    {
        var token = RequireToken();
        return _connectionManager.GetConnectionInfo(token)!;
    }

    public (string ConnectionString, DatabaseProviderKind Provider) ResolveConnection(
        string? connectionString = null,
        DatabaseProviderKind? provider = null
    )
    {
        if (connectionString != null && provider != null)
            return (connectionString, provider.Value);

        var info = RequireConnection();
        return (info.ConnectionString, info.Provider);
    }
}
