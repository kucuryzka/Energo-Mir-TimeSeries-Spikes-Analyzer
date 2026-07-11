using Core.Enums;

using API.Contracts;

namespace API.Sql;

public class PostgresDialect : IDatabaseDialect
{
    public DatabaseProviderKind ProviderId => DatabaseProviderKind.pgsql;

    public string CountAggregateExpression => "COUNT(*)";

    public string LargeCountAggregateExpression => "COUNT(*)";

    public string CastAsText(string columnExpression) =>
        $"{columnExpression}::text";

    public string BuildLimitedSelect(
        string selectList,
        string fromClause,
        string? whereClause,
        int limit,
        string? orderByClause = null
    )
    {
        var where = whereClause != null ? $" WHERE {whereClause}" : string.Empty;
        var order = orderByClause ?? string.Empty;
        return $"SELECT {selectList} FROM {fromClause}{where}{order} {LimitClause(limit)}";
    }

    public string QuoteIdentifier(string identifier) =>
        $"\"{SqlIdentifier.EscapeForPostgres(identifier)}\"";

    public string QualifyColumn(string? tableAlias, string column)
    {
        var quoted = QuoteIdentifier(column);
        return tableAlias != null ? $"{tableAlias}.{quoted}" : quoted;
    }

    public string QualifyTable(string schema, string table) =>
        $"{QuoteIdentifier(schema)}.{QuoteIdentifier(table)}";

    public string QualifyFromTable(string schema, string table, string? alias = null)
    {
        var tableRef = QualifyTable(schema, table);
        return alias != null ? $"{tableRef} {alias}" : tableRef;
    }

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

    public string BuildSampleSql(string qualifiedTable, int limit, string? orderByColumn = null)
    {
        var order = orderByColumn != null
            ? $" ORDER BY {QuoteIdentifier(orderByColumn)} DESC"
            : null;
        return BuildLimitedSelect("*", qualifiedTable, null, limit, order);
    }

    public string BuildListDatabasesSql() =>
        "SELECT datname FROM pg_database WHERE datistemplate = false;";

    public string BuildListSchemasSql() =>
        "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'pg_catalog');";

    public string BuildListTablesSql() =>
        "SELECT table_name FROM information_schema.tables WHERE table_schema = @schema AND table_type = 'BASE TABLE';";

    public string BuildListColumnsSql() => @"
        SELECT column_name AS Name,
               CASE WHEN data_type IN ('timestamp without time zone', 'timestamp with time zone', 'date') THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS IsTimeColumn
        FROM information_schema.columns
        WHERE table_schema = @schema AND table_name = @table;";

    public string BuildApproximateRowCountSql(string schema, string table) => $@"
        SELECT CAST(c.reltuples AS BIGINT) AS RowCount
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = '{schema.Replace("'", "''")}'
          AND c.relname = '{table.Replace("'", "''")}'";
}
