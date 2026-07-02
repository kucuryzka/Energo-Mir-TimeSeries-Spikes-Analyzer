namespace API.DTOs;

public class AuthRequest
{
    public string Provider { get; set; } = "mssql"; // mssql or pgsql
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; }
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string? Database { get; set; }
}

public class AuthResponse
{
    public string Token { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}
