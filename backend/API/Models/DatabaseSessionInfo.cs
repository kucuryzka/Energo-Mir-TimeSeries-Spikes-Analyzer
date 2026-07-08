namespace API.Models;

public class DatabaseSessionInfo
{
    public string Provider { get; set; } = "mssql";
    public string ConnectionString { get; set; } = string.Empty;
}
