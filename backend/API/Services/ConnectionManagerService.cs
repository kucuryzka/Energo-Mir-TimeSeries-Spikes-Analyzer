using System;
using System.Collections.Concurrent;

namespace API.Services;

public class ConnectionInfo
{
    public string Provider { get; set; } = "mssql"; // mssql, pgsql
    public string ConnectionString { get; set; } = string.Empty;
}

public interface IConnectionManagerService
{
    string CreateSession(ConnectionInfo info);
    ConnectionInfo? GetConnectionInfo(string token);
    void RemoveSession(string token);
}

public class ConnectionManagerService : IConnectionManagerService
{
    private readonly ConcurrentDictionary<string, ConnectionInfo> _sessions = new();

    public string CreateSession(ConnectionInfo info)
    {
        var token = Guid.NewGuid().ToString("N");
        _sessions.TryAdd(token, info);
        return token;
    }

    public ConnectionInfo? GetConnectionInfo(string token)
    {
        if (string.IsNullOrEmpty(token)) return null;
        _sessions.TryGetValue(token, out var info);
        return info;
    }

    public void RemoveSession(string token)
    {
        if (!string.IsNullOrEmpty(token))
        {
            _sessions.TryRemove(token, out _);
        }
    }
}
