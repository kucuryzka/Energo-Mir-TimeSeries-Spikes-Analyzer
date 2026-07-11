using Core.Enums;

using API.Contracts;

namespace API.Sql;

public class MssqlDialect : IDatabaseDialect
{
    public DatabaseProviderKind ProviderId => DatabaseProviderKind.mssql;

    public string CountAggregateExpression => "COUNT(*)";

    public string LargeCountAggregateExpression => "COUNT_BIG(*)";

    public string CastAsText(string columnExpression) =>
        $"CAST({columnExpression} AS NVARCHAR(200))";

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
        return $"SELECT {LimitClause(limit)} {selectList} FROM {fromClause}{where}{order}";
    }

    public string QuoteIdentifier(string identifier) =>
        $"[{SqlIdentifier.EscapeForSqlServer(identifier)}]";

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
        return alias != null
            ? $"{tableRef} {alias} WITH (NOLOCK)"
            : $"{tableRef} WITH (NOLOCK)";
    }

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

    public string BuildSampleSql(string qualifiedTable, int limit, string? orderByColumn = null)
    {
        var order = orderByColumn != null
            ? $" ORDER BY {QuoteIdentifier(orderByColumn)} DESC"
            : null;
        return BuildLimitedSelect("*", $"{qualifiedTable} WITH (NOLOCK)", null, limit, order);
    }

    public string BuildListDatabasesSql() =>
        "SELECT name FROM sys.databases WHERE state_desc = 'ONLINE';";

    public string BuildListSchemasSql() =>
        "SELECT name FROM sys.schemas WHERE principal_id = 1;";

    public string BuildListTablesSql() =>
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = @schema AND TABLE_TYPE = 'BASE TABLE';";

    public string BuildListColumnsSql() => @"
        SELECT COLUMN_NAME AS Name,
               CASE WHEN DATA_TYPE IN ('datetime', 'datetime2', 'date', 'smalldatetime') THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS IsTimeColumn
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table;";

    public string BuildApproximateRowCountSql(string schema, string table) => $@"
        SELECT CAST(SUM(p.rows) AS BIGINT) AS [RowCount]
        FROM sys.partitions p
        INNER JOIN sys.objects o ON p.object_id = o.object_id
        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
        WHERE s.name = '{schema.Replace("'", "''")}'
          AND o.name = '{table.Replace("'", "''")}'
          AND p.index_id IN (0, 1)";
}
