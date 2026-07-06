using Core.Enums;

namespace API.Sql;

public interface IDatabaseDialect
{
    string ProviderId { get; }

    string QuoteIdentifier(string identifier);

    string QualifyColumn(string? tableAlias, string column);

    string QualifyTable(string schema, string table);

    string GetTimeBucketExpression(string columnExpression, TimeGranularity granularity, int? customMinutes);

    string NullTimestampExpression { get; }

    string Paginate(string orderByClause, int offset, int pageSize);

    string LimitClause(int limit);

    string CountAggregateExpression { get; }

    string Concat(params string[] parts);

    string BuildSampleSql(string qualifiedTable, int limit);

    string BuildApproximateRowCountSql(string schema, string table);
}
