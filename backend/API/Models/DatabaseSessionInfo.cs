namespace API.Models;

public class DatabaseSessionInfo
{
    public DatabaseProviderKind Provider { get; set; } = DatabaseProviderKind.mssql;
    public string ConnectionString { get; set; } = string.Empty;
}
