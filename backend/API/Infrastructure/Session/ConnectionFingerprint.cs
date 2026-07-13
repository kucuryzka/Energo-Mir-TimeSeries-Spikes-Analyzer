using System.Data.Common;

namespace API.Infrastructure.Session;

public static class ConnectionFingerprint
{
    public static string From(DatabaseProviderKind provider, string connectionString)
    {
        var builder = new DbConnectionStringBuilder { ConnectionString = connectionString };

        if (DatabaseProvider.IsPostgres(provider))
        {
            var host = NormalizeHost(Get(builder, "Host") ?? Get(builder, "Server") ?? string.Empty);
            var port = Get(builder, "Port") ?? "5432";
            var user = NormalizeUser(
                Get(builder, "Username")
                ?? Get(builder, "User Id")
                ?? Get(builder, "UserID")
                ?? string.Empty
            );
            return $"pgsql|{host}|{port}|{user}";
        }

        var server = Get(builder, "Server")
            ?? Get(builder, "Data Source")
            ?? Get(builder, "Addr")
            ?? string.Empty;
        ParseSqlServerEndpoint(server, out var sqlHost, out var sqlPort);
        var sqlUser = NormalizeUser(
            Get(builder, "User Id")
            ?? Get(builder, "User ID")
            ?? Get(builder, "UID")
            ?? string.Empty
        );
        return $"mssql|{NormalizeHost(sqlHost)}|{sqlPort}|{sqlUser}";
    }

    public static string From(string provider, string connectionString) =>
        From(DatabaseProvider.Parse(provider), connectionString);

    public static bool Matches(string? expectedFingerprint, DatabaseProviderKind provider, string connectionString)
    {
        if (string.IsNullOrWhiteSpace(expectedFingerprint))
            return true;

        var actual = From(provider, connectionString);
        return string.Equals(expectedFingerprint, actual, StringComparison.OrdinalIgnoreCase);
    }

    public static bool Matches(string? expectedFingerprint, string provider, string connectionString) =>
        Matches(expectedFingerprint, DatabaseProvider.Parse(provider), connectionString);

    public static string? ToDisplay(string? fingerprint)
    {
        if (string.IsNullOrWhiteSpace(fingerprint))
            return null;

        var parts = fingerprint.Split('|');
        if (parts.Length < 4)
            return fingerprint;

        var provider = parts[0];
        var host = parts[1];
        var port = parts[2];
        var user = parts[3];
        var endpoint = port is "1433" or "5432" || string.IsNullOrEmpty(port)
            ? host
            : $"{host}:{port}";
        return string.IsNullOrEmpty(user)
            ? $"{provider} · {endpoint}"
            : $"{provider} · {endpoint} · {user}";
    }

    private static void ParseSqlServerEndpoint(string server, out string host, out string port)
    {
        server = server.Trim();
        if (server.Length == 0)
        {
            host = string.Empty;
            port = "1433";
            return;
        }

        var value = server.StartsWith("tcp:", StringComparison.OrdinalIgnoreCase)
            ? server[4..]
            : server;

        var comma = value.LastIndexOf(',');
        if (comma > 0 && comma < value.Length - 1
            && int.TryParse(value[(comma + 1)..].Trim(), out _)
        )
        {
            host = value[..comma].Trim();
            port = value[(comma + 1)..].Trim();
            return;
        }

        host = value;
        port = "1433";
    }

    private static string NormalizeHost(string host) =>
        host.Trim().TrimStart('[').TrimEnd(']').ToLowerInvariant();

    private static string NormalizeUser(string user) =>
        user.Trim().ToLowerInvariant();

    private static string? Get(DbConnectionStringBuilder builder, string key)
    {
        if (!builder.ContainsKey(key))
            return null;
        return builder[key]?.ToString();
    }
}
