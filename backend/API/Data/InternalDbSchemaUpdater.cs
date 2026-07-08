using System.Data;
using Microsoft.EntityFrameworkCore;

namespace API.Data;

public static class InternalDbSchemaUpdater
{
    public static void Apply(InternalDbContext db)
    {
        db.Database.EnsureCreated();

        TryAddColumn(db, "AnalysisJobs", "CompletedBatchCount", "INTEGER NOT NULL DEFAULT 0");
        TryAddColumn(db, "AnalysisJobs", "TotalBatchCount", "INTEGER NOT NULL DEFAULT 0");
        TryAddColumn(db, "AnalysisJobs", "AvgBatchDurationMs", "INTEGER NULL");
        TryAddColumn(db, "AnalysisJobs", "LastBatchDurationMs", "INTEGER NULL");
        TryAddColumn(db, "AnalysisJobs", "PostProcessDurationMs", "INTEGER NULL");

        if (!TableExists(db, "AnalysisSourceTimingStats"))
        {
            db.Database.ExecuteSqlRaw("""
                CREATE TABLE AnalysisSourceTimingStats (
                    SourceKey TEXT NOT NULL PRIMARY KEY,
                    "Database" TEXT NOT NULL,
                    "Schema" TEXT NOT NULL,
                    "Table" TEXT NOT NULL,
                    Granularity TEXT NOT NULL,
                    SampleCount INTEGER NOT NULL,
                    AvgBatchDurationMs INTEGER NOT NULL,
                    AvgPostProcessDurationMs INTEGER NOT NULL,
                    AvgMsPerPeriodDay INTEGER NOT NULL,
                    LastUpdatedAt TEXT NOT NULL
                );
                """);
        }
    }

    private static void TryAddColumn(InternalDbContext db, string table, string column, string definition)
    {
        if (ColumnExists(db, table, column))
            return;

        db.Database.ExecuteSqlRaw($"ALTER TABLE {table} ADD COLUMN {column} {definition};");
    }

    private static bool TableExists(InternalDbContext db, string table)
    {
        var connection = db.Database.GetDbConnection();
        var wasOpen = connection.State == ConnectionState.Open;
        if (!wasOpen)
            connection.Open();

        try
        {
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = $name;";
            var parameter = command.CreateParameter();
            parameter.ParameterName = "$name";
            parameter.Value = table;
            command.Parameters.Add(parameter);
            return Convert.ToInt64(command.ExecuteScalar()) > 0;
        }
        finally
        {
            if (!wasOpen)
                connection.Close();
        }
    }

    private static bool ColumnExists(InternalDbContext db, string table, string column)
    {
        var connection = db.Database.GetDbConnection();
        var wasOpen = connection.State == ConnectionState.Open;
        if (!wasOpen)
            connection.Open();

        try
        {
            using var command = connection.CreateCommand();
            command.CommandText = $"PRAGMA table_info({table});";
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                if (string.Equals(reader.GetString(1), column, StringComparison.OrdinalIgnoreCase))
                    return true;
            }

            return false;
        }
        finally
        {
            if (!wasOpen)
                connection.Close();
        }
    }
}
