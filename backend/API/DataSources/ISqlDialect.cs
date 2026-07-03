using Core.Enums;

namespace API.DataSources;

public interface ISqlDialect
{
    DatabaseProvider Provider { get; }

    string GetTimeBucketExpression(string timestampColumn, TimeGranularity granularity, int? customMinutes);

    string SelectLimit(int count);

    string EndLimit(int count);

    string LimitOffset(int offset, int limit);

    string ConcatChannelName(string objectNameColumn, string eventCodeColumn);

    string CastToString(string column);

    string QualifyTable(string schema, string table);

    string QuoteIdentifier(string identifier);
}
