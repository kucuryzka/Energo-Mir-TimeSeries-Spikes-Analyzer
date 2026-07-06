using System.Data.Common;
using API.DTOs;
using API.Sql;
using Dapper;

namespace API.Services;

public class TablePreviewService
{
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly ILogger<TablePreviewService> _logger;

    public TablePreviewService(ISqlDialectProvider dialectProvider, ILogger<TablePreviewService> logger)
    {
        _dialectProvider = dialectProvider;
        _logger = logger;
    }

    public async Task<TablePreviewResponse> LoadAsync(
        string connectionString,
        string provider,
        string database,
        string schema,
        string table,
        string timeColumn,
        int limit = 15)
    {
        var dialect = _dialectProvider.GetDialect(DatabaseProvider.Normalize(provider));
        var targetConnStr = BuildTargetConnectionString(connectionString, database);
        var qualifiedTable = dialect.QualifyTable(schema, table);
        var qualifiedTime = dialect.QualifyColumn(null, timeColumn);
        limit = Math.Clamp(limit, 5, 50);

        using var connection = DatabaseProvider.OpenConnection(provider, targetConnStr);
        await connection.OpenAsync();

        var response = new TablePreviewResponse();

        try
        {
            var rangeSql = $"SELECT MIN({qualifiedTime}) AS MinDate, MAX({qualifiedTime}) AS MaxDate FROM {qualifiedTable}";
            var range = await connection.QueryFirstOrDefaultAsync(rangeSql);
            response.MinDate = ReadDateTime(GetColumnValue(range, "MinDate"));
            response.MaxDate = ReadDateTime(GetColumnValue(range, "MaxDate"));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Table preview MIN/MAX failed for {Schema}.{Table}", schema, table);
        }

        try
        {
            var earliestSql = dialect.BuildOrderedSampleSql(qualifiedTable, qualifiedTime, ascending: true, limit);
            var earliest = await connection.QueryAsync(earliestSql);
            response.EarliestRows = ToRowDictionaries(earliest);
            if (response.MinDate == null && response.EarliestRows.Count > 0)
                response.MinDate = ReadDateTime(GetColumnValue(response.EarliestRows[0], timeColumn));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Table preview earliest rows failed for {Schema}.{Table}", schema, table);
        }

        try
        {
            var latestSql = dialect.BuildOrderedSampleSql(qualifiedTable, qualifiedTime, ascending: false, limit);
            var latest = await connection.QueryAsync(latestSql);
            response.LatestRows = ToRowDictionaries(latest);
            if (response.MaxDate == null && response.LatestRows.Count > 0)
                response.MaxDate = ReadDateTime(GetColumnValue(response.LatestRows[0], timeColumn));
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Table preview latest rows failed for {Schema}.{Table}", schema, table);
        }

        try
        {
            var countSql = dialect.BuildApproximateRowCountSql(schema, table);
            var countRow = await connection.QueryFirstOrDefaultAsync(countSql);
            var rc = GetColumnValue(countRow, "RowCount");
            if (rc is not null and not DBNull)
                response.ApproximateRowCount = Convert.ToInt64(rc);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Table preview row count failed for {Schema}.{Table}", schema, table);
        }

        if (response.EarliestRows.Count == 0 && response.LatestRows.Count == 0 && response.MinDate == null && response.MaxDate == null)
            throw new InvalidOperationException("Could not load any preview data for the table.");

        return response;
    }

    private static List<Dictionary<string, object?>> ToRowDictionaries(IEnumerable<dynamic> rows) =>
        rows.Select(row =>
        {
            var dict = (IDictionary<string, object>)row;
            return dict.ToDictionary(
                kv => kv.Key,
                kv => NormalizeCellValue(kv.Value));
        }).ToList();

    private static object? GetColumnValue(object? row, string columnName)
    {
        if (row is null) return null;

        if (row is IDictionary<string, object> dict)
        {
            if (dict.TryGetValue(columnName, out var exact))
                return exact;

            foreach (var kv in dict)
            {
                if (string.Equals(kv.Key, columnName, StringComparison.OrdinalIgnoreCase))
                    return kv.Value;
            }
        }

        return null;
    }

    private static DateTime? ReadDateTime(object? value)
    {
        if (value is null or DBNull) return null;
        if (value is DateTime dt) return dt;
        if (value is DateTimeOffset dto) return dto.UtcDateTime;
        return DateTime.TryParse(value.ToString(), out var parsed) ? parsed : null;
    }

    private static object? NormalizeCellValue(object? value)
    {
        if (value is null or DBNull) return null;
        if (value is byte[] bytes) return Convert.ToBase64String(bytes);
        if (value is DateTime or DateTimeOffset or bool or int or long or decimal or double or float or string)
            return value;
        if (value is Guid guid) return guid.ToString();
        return value.ToString();
    }

    private static string BuildTargetConnectionString(string connectionString, string database)
    {
        var connStrBuilder = new DbConnectionStringBuilder { ConnectionString = connectionString };
        connStrBuilder["Database"] = database;
        return connStrBuilder.ConnectionString;
    }

    private static DbConnection OpenConnection(string provider, string connectionString) =>
        DatabaseProvider.OpenConnection(provider, connectionString);

    private static bool IsPostgres(string provider) =>
        DatabaseProvider.IsPostgres(provider);
}
