using System.Data.Common;

namespace API.Infrastructure.Database;

public static class DatabaseConnectionHelper
{
    public static string WithDatabase(string connectionString, string database)
    {
        var builder = new DbConnectionStringBuilder { ConnectionString = connectionString };
        builder["Database"] = database;
        return builder.ConnectionString;
    }
}
