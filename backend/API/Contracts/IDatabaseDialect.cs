using Core.Enums;

namespace API.Contracts;

public interface IDatabaseDialect
{
    DatabaseProviderKind ProviderId { get; }

    string QuoteIdentifier(string identifier);

    string QualifyColumn(string? tableAlias, string column);

    string QualifyTable(string schema, string table);

    string QualifyFromTable(string schema, string table, string? alias = null);

    string GetTimeBucketExpression(string columnExpression, TimeGranularity granularity, int? customMinutes);

    string NullTimestampExpression { get; }

    string Paginate(string orderByClause, int offset, int pageSize);

    string LimitClause(int limit);

    string CountAggregateExpression { get; }

    string LargeCountAggregateExpression { get; }

    string CastAsText(string columnExpression);

    string BuildLimitedSelect(
        string selectList,
        string fromClause,
        string? whereClause,
        int limit,
        string? orderByClause = null);

    string Concat(params string[] parts);

    string BuildSampleSql(string qualifiedTable, int limit, string? orderByColumn = null);

    string BuildApproximateRowCountSql(string schema, string table);

    string BuildListDatabasesSql();

    string BuildListSchemasSql();

    string BuildListTablesSql();

    string BuildListColumnsSql();
}
