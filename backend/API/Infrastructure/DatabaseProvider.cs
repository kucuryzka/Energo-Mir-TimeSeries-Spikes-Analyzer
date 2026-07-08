using System.Data.Common;
using Microsoft.Data.SqlClient;
using Npgsql;

namespace API.Infrastructure;

public static class DatabaseProvider
{
    public static string Normalize(string provider)
    {
        if (string.IsNullOrWhiteSpace(provider))
            return "mssql";

        if (provider.Equals("postgres", StringComparison.OrdinalIgnoreCase) ||
            provider.Equals("postgresql", StringComparison.OrdinalIgnoreCase))
            return "pgsql";

        if (provider.Equals("sqlserver", StringComparison.OrdinalIgnoreCase) ||
            provider.Equals("mssql", StringComparison.OrdinalIgnoreCase))
            return "mssql";

        return provider.ToLowerInvariant();
    }

    public static bool IsPostgres(string provider) =>
        Normalize(provider) == "pgsql";

    public static DbConnection OpenConnection(string provider, string connectionString) =>
        IsPostgres(provider)
            ? new NpgsqlConnection(connectionString)
            : new SqlConnection(connectionString);
}
