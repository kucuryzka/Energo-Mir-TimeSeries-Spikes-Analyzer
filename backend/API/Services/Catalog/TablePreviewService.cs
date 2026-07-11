using System.Data;
using System.Data.Common;
using API.Configuration;
using API.DTOs;
using API.Sql;
using Dapper;
using Microsoft.Extensions.Options;

using API.Contracts;

namespace API.Services.Catalog;

public class TablePreviewService
{
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly AnalysisSettings _settings;
    private readonly ILogger<TablePreviewService> _logger;

    public TablePreviewService(
        ISqlDialectProvider dialectProvider,
        IOptions<AnalysisSettings> settings,
        ILogger<TablePreviewService> logger
    )
    {
        _dialectProvider = dialectProvider;
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<TablePreviewResponse> LoadAsync(
        string connectionString,
        DatabaseProviderKind provider,
        string database,
        string schema,
        string table,
        string timeColumn,
        int limit = 15
    )
    {
        SqlIdentifier.EnsureSafeMany(
            (schema, nameof(schema)),
            (table, nameof(table)),
            (timeColumn, nameof(timeColumn))
        );

        var dialect = _dialectProvider.GetDialect(provider);
        var targetConnStr = DatabaseConnectionHelper.WithDatabase(connectionString, database);
        var qualifiedTable = dialect.QualifyTable(schema, table);
        limit = Math.Clamp(limit, 1, 50);
        var commandTimeout = Math.Clamp(_settings.PreviewCommandTimeoutSeconds, 5, 600);

        using var connection = DatabaseProvider.OpenConnection(provider, targetConnStr);
        await connection.OpenAsync();

        var response = new TablePreviewResponse();

        long? rowCount = null;
        try
        {
            var countSql = dialect.BuildApproximateRowCountSql(schema, table);
            var countRow = await connection.QueryFirstOrDefaultAsync(
                new CommandDefinition(countSql, commandTimeout: commandTimeout)
            );
            var rc = GetColumnValue(countRow, "RowCount");
            if (rc is not null and not DBNull)
            {
                rowCount = Convert.ToInt64(rc);
                response.ApproximateRowCount = rowCount.Value;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Table preview row count failed for {Schema}.{Table}", schema, table);
        }

        var orderByColumn = rowCount is > 0 and long count && count <= _settings.PreviewOrderedSampleMaxRows
            ? timeColumn
            : null;
        if (orderByColumn == null && rowCount > _settings.PreviewOrderedSampleMaxRows)
        {
            _logger.LogInformation(
                "Preview for {Schema}.{Table}: skipping ORDER BY ({RowCount:N0} rows > {Max:N0})",
                schema, table, rowCount, _settings.PreviewOrderedSampleMaxRows
            );
        }

        var sampleSql = dialect.BuildSampleSql(qualifiedTable, limit, orderByColumn);
        var rows = await connection.QueryAsync(
            new CommandDefinition(sampleSql, commandTimeout: commandTimeout)
        );
        response.SampleRows = ToRowDictionaries(rows);

        if (response.SampleRows.Count == 0)
            throw new ArgumentException("Could not load any preview rows for the table.");

        return response;
    }

    private static List<Dictionary<string, object?>> ToRowDictionaries(IEnumerable<dynamic> rows) =>
        rows.Select(row =>
        {
            var dict = (IDictionary<string, object>)row;
            return dict.ToDictionary(
                kv => kv.Key,
                kv => NormalizeCellValue(kv.Value)
            );
        }
        ).ToList();

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

    private static object? NormalizeCellValue(object? value)
    {
        if (value is null or DBNull) return null;
        if (value is byte[] bytes) return Convert.ToBase64String(bytes);
        if (value is DateTime or DateTimeOffset or bool or int or long or decimal or double or float or string)
            return value;
        if (value is Guid guid) return guid.ToString();
        return value.ToString();
    }
}
