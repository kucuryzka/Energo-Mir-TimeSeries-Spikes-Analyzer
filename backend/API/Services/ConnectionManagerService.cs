using System.Collections.Concurrent;
using API.Contracts;
using API.Models;

namespace API.Services;

public class ConnectionManagerService : IConnectionManagerService
{
    private readonly ConcurrentDictionary<string, DatabaseSessionInfo> _sessions = new();

    public string CreateSession(DatabaseSessionInfo info)
    {
        var token = Guid.NewGuid().ToString("N");
        _sessions.TryAdd(token, info);
        return token;
    }

    public DatabaseSessionInfo? GetConnectionInfo(string token)
    {
        if (string.IsNullOrEmpty(token))
            return null;

        _sessions.TryGetValue(token, out var info);
        return info;
    }

    public void RemoveSession(string token)
    {
        if (!string.IsNullOrEmpty(token))
            _sessions.TryRemove(token, out _);
    }
}
