using Core.Enums;

namespace API.Sql;

public class PostgresDialect : IDatabaseDialect
{
    public string ProviderId => "pgsql";

    public string CountAggregateExpression => "COUNT(*)";

    public string QuoteIdentifier(string identifier) => $"\"{identifier}\"";

    public string QualifyColumn(string? tableAlias, string column)
    {
        var quoted = QuoteIdentifier(column);
        return tableAlias != null ? $"{tableAlias}.{quoted}" : quoted;
    }

    public string QualifyTable(string schema, string table) =>
        $"{QuoteIdentifier(schema)}.{QuoteIdentifier(table)}";

    public string NullTimestampExpression => "TIMESTAMP '1900-01-01'";

    public string GetTimeBucketExpression(string columnExpression, TimeGranularity granularity, int? customMinutes)
    {
        var col = columnExpression;
        var bucketSeconds = (customMinutes ?? 60) * 60;
        return granularity switch
        {
            TimeGranularity.Minute => $"date_trunc('minute', {col})",
            TimeGranularity.Hour => $"date_trunc('hour', {col})",
            TimeGranularity.Day => $"date_trunc('day', {col})",
            TimeGranularity.Week => $"date_trunc('week', {col})",
            TimeGranularity.Month => $"date_trunc('month', {col})",
            TimeGranularity.Custom => $"to_timestamp(floor((extract(epoch from {col}) / {bucketSeconds})) * {bucketSeconds})",
            _ => $"date_trunc('hour', {col})"
        };
    }

    public string Paginate(string orderByClause, int offset, int pageSize) =>
        $"{orderByClause} LIMIT {pageSize} OFFSET {offset}";

    public string LimitClause(int limit) => $"LIMIT {limit}";

    public string Concat(params string[] parts) =>
        $"concat({string.Join(", ", parts)})";

    public string BuildOrderedSampleSql(string qualifiedTable, string qualifiedTimeColumn, bool ascending, int limit)
    {
        var order = ascending ? "ASC" : "DESC";
        return $"SELECT * FROM {qualifiedTable} ORDER BY {qualifiedTimeColumn} {order} {LimitClause(limit)}";
    }

    public string BuildApproximateRowCountSql(string schema, string table) => $@"
        SELECT CAST(c.reltuples AS BIGINT) AS RowCount
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = '{schema.Replace("'", "''")}'
          AND c.relname = '{table.Replace("'", "''")}'";
}
