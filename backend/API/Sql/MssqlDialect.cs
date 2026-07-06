using Core.Enums;

namespace API.Sql;

public class MssqlDialect : IDatabaseDialect
{
    public string ProviderId => "mssql";

    public string CountAggregateExpression => "COUNT(*)";

    public string QuoteIdentifier(string identifier) => $"[{identifier}]";

    public string QualifyColumn(string? tableAlias, string column)
    {
        var quoted = QuoteIdentifier(column);
        return tableAlias != null ? $"{tableAlias}.{quoted}" : quoted;
    }

    public string QualifyTable(string schema, string table) =>
        $"{QuoteIdentifier(schema)}.{QuoteIdentifier(table)}";

    public string NullTimestampExpression => "CAST('1900-01-01' AS datetime)";

    public string GetTimeBucketExpression(string columnExpression, TimeGranularity granularity, int? customMinutes)
    {
        var col = columnExpression;
        return granularity switch
        {
            TimeGranularity.Minute => $"DATEADD(minute, DATEDIFF(minute, 0, {col}), 0)",
            TimeGranularity.Hour => $"DATEADD(hour, DATEDIFF(hour, 0, {col}), 0)",
            TimeGranularity.Day => $"DATEADD(day, DATEDIFF(day, 0, {col}), 0)",
            TimeGranularity.Week => $"DATEADD(week, DATEDIFF(week, 0, {col}), 0)",
            TimeGranularity.Month => $"DATEADD(month, DATEDIFF(month, 0, {col}), 0)",
            TimeGranularity.Custom => $"DATEADD(minute, (DATEDIFF(minute, 0, {col}) / {(customMinutes ?? 60)}) * {(customMinutes ?? 60)}, 0)",
            _ => $"DATEADD(hour, DATEDIFF(hour, 0, {col}), 0)"
        };
    }

    public string Paginate(string orderByClause, int offset, int pageSize) =>
        $"{orderByClause} OFFSET {offset} ROWS FETCH NEXT {pageSize} ROWS ONLY";

    public string LimitClause(int limit) => $"TOP {limit}";

    public string Concat(params string[] parts) =>
        $"CONCAT({string.Join(", ", parts)})";

    public string BuildOrderedSampleSql(string qualifiedTable, string qualifiedTimeColumn, bool ascending, int limit)
    {
        var order = ascending ? "ASC" : "DESC";
        return $"SELECT {LimitClause(limit)} * FROM {qualifiedTable} ORDER BY {qualifiedTimeColumn} {order}";
    }

    public string BuildApproximateRowCountSql(string schema, string table) => $@"
        SELECT CAST(SUM(p.rows) AS BIGINT) AS [RowCount]
        FROM sys.partitions p
        INNER JOIN sys.objects o ON p.object_id = o.object_id
        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE s.name = '{schema.Replace("'", "''")}'
          AND o.name = '{table.Replace("'", "''")}'
          AND p.index_id IN (0, 1)";
}
