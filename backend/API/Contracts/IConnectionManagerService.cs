using API.Models;

namespace API.Contracts;

public interface IConnectionManagerService
{
    string CreateSession(DatabaseSessionInfo info);
    DatabaseSessionInfo? GetConnectionInfo(string token);
}
