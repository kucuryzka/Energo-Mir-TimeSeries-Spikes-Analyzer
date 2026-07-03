using Core.Enums;

namespace API.DataSources;

public class SqlServerDialect : ISqlDialect
{
    public DatabaseProvider Provider => DatabaseProvider.SqlServer;

    public string GetTimeBucketExpression(string timestampColumn, TimeGranularity granularity, int? customMinutes)
    {
        return granularity switch
        {
            TimeGranularity.Second => $"DATEADD(second, DATEDIFF(second, '2000-01-01', {timestampColumn}), '2000-01-01')",
            TimeGranularity.Minute => $"DATEADD(minute, DATEDIFF(minute, 0, {timestampColumn}), 0)",
            TimeGranularity.Hour => $"DATEADD(hour, DATEDIFF(hour, 0, {timestampColumn}), 0)",
            TimeGranularity.Day => $"DATEADD(day, DATEDIFF(day, 0, {timestampColumn}), 0)",
            TimeGranularity.Week => $"DATEADD(week, DATEDIFF(week, 0, {timestampColumn}), 0)",
            TimeGranularity.Month => $"DATEADD(month, DATEDIFF(month, 0, {timestampColumn}), 0)",
            TimeGranularity.Custom => $"DATEADD(minute, (DATEDIFF(minute, 0, {timestampColumn}) / {(customMinutes ?? 60)}) * {(customMinutes ?? 60)}, 0)",
            _ => $"DATEADD(hour, DATEDIFF(hour, 0, {timestampColumn}), 0)"
        };
    }

    public string SelectLimit(int count) => $"TOP {count} ";

    public string EndLimit(int count) => string.Empty;

    public string LimitOffset(int offset, int limit) => $"OFFSET {offset} ROWS FETCH NEXT {limit} ROWS ONLY";

    public string ConcatChannelName(string objectNameColumn, string eventCodeColumn) =>
        $"CONCAT({objectNameColumn}, ' (', {eventCodeColumn}, ')')";

    public string CastToString(string column) => $"CAST({column} AS NVARCHAR(100))";

    public string QualifyTable(string schema, string table) => $"{schema}.{table}";

    public string QuoteIdentifier(string identifier) => $"[{identifier}]";
}
