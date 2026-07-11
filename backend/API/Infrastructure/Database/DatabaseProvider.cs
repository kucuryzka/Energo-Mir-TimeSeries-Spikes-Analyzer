using System.Data.Common;
using Microsoft.Data.SqlClient;
using Npgsql;

namespace API.Infrastructure.Database;

public static class DatabaseProvider
{
    public static DatabaseProviderKind Parse(string? provider)
    {
        if (string.IsNullOrWhiteSpace(provider))
            return DatabaseProviderKind.mssql;

        if (provider.Equals("postgres", StringComparison.OrdinalIgnoreCase) ||
            provider.Equals("postgresql", StringComparison.OrdinalIgnoreCase) ||
            provider.Equals("pgsql", StringComparison.OrdinalIgnoreCase))
            return DatabaseProviderKind.pgsql;

        if (provider.Equals("sqlserver", StringComparison.OrdinalIgnoreCase) ||
            provider.Equals("mssql", StringComparison.OrdinalIgnoreCase))
            return DatabaseProviderKind.mssql;

        throw new NotSupportedException($"Database provider '{provider}' is not supported. Use 'mssql' or 'pgsql'.");
    }

    public static DatabaseProviderKind Normalize(DatabaseProviderKind provider) => provider;

    public static DatabaseProviderKind Normalize(string? provider) => Parse(provider);

    public static bool IsPostgres(DatabaseProviderKind provider) =>
        provider == DatabaseProviderKind.pgsql;

    public static bool IsPostgres(string? provider) =>
        Parse(provider) == DatabaseProviderKind.pgsql;

    public static DbConnection OpenConnection(DatabaseProviderKind provider, string connectionString) =>
        IsPostgres(provider)
            ? new NpgsqlConnection(connectionString)
            : new SqlConnection(connectionString);

    public static DbConnection OpenConnection(string provider, string connectionString) =>
        OpenConnection(Parse(provider), connectionString);
}
