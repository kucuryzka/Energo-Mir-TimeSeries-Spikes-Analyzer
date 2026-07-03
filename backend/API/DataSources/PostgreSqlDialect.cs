using Core.Enums;

namespace API.DataSources;

public class PostgreSqlDialect : ISqlDialect
{
    public DatabaseProvider Provider => DatabaseProvider.PostgreSQL;

    public string GetTimeBucketExpression(string timestampColumn, TimeGranularity granularity, int? customMinutes)
    {
        return granularity switch
        {
            TimeGranularity.Second => $"date_trunc('second', {timestampColumn})",
            TimeGranularity.Minute => $"date_trunc('minute', {timestampColumn})",
            TimeGranularity.Hour => $"date_trunc('hour', {timestampColumn})",
            TimeGranularity.Day => $"date_trunc('day', {timestampColumn})",
            TimeGranularity.Week => $"date_trunc('week', {timestampColumn})",
            TimeGranularity.Month => $"date_trunc('month', {timestampColumn})",
            TimeGranularity.Custom =>
                $"to_timestamp(floor(extract(epoch from {timestampColumn}) / ({(customMinutes ?? 60)} * 60)) * ({(customMinutes ?? 60)} * 60))",
            _ => $"date_trunc('hour', {timestampColumn})"
        };
    }

    public string SelectLimit(int count) => string.Empty;

    public string EndLimit(int count) => $" LIMIT {count}";

    public string LimitOffset(int offset, int limit) => $"OFFSET {offset} LIMIT {limit}";

    public string ConcatChannelName(string objectNameColumn, string eventCodeColumn) =>
        $"{objectNameColumn} || ' (' || {eventCodeColumn} || ')'";

    public string CastToString(string column) => $"CAST({column} AS VARCHAR(100))";

    public string QualifyTable(string schema, string table) => $"\"{schema}\".\"{table}\"";

    public string QuoteIdentifier(string identifier) => $"\"{identifier}\"";
}
