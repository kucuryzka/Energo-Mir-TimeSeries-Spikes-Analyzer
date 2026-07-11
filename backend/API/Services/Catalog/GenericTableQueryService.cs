using API.Sql;
using Core.Enums;
using Dapper;

using API.Contracts;

namespace API.Services.Catalog;

public class GenericTableQueryService
{
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly SessionContextService _session;

    public GenericTableQueryService(
        ISqlDialectProvider dialectProvider,
        SessionContextService session
    )
    {
        _dialectProvider = dialectProvider;
        _session = session;
    }

    public async Task<IEnumerable<dynamic>> GetPointDetailsAsync(
        string database,
        string schema,
        string table,
        string timeColumn,
        DateTime timestamp,
        TimeGranularity granularity,
        int? customMinutes
    )
    {
        SqlIdentifier.EnsureSafeMany(
            (schema, nameof(schema)),
            (table, nameof(table)),
            (timeColumn, nameof(timeColumn))
        );

        var info = _session.RequireConnection();
        var dialect = _dialectProvider.GetDialect(info.Provider);
        var targetConnStr = DatabaseConnectionHelper.WithDatabase(info.ConnectionString, database);

        await using var connection = DatabaseProvider.OpenConnection(info.Provider, targetConnStr);
        await connection.OpenAsync();

        var endDate = GranularityHelper.GetBucketEnd(timestamp, granularity, customMinutes);
        var qualifiedTable = dialect.QualifyTable(schema, table);
        var qualifiedTime = dialect.QualifyColumn(null, timeColumn);
        var whereClause = $"{qualifiedTime} >= @Start AND {qualifiedTime} < @End";
        var sql = dialect.BuildLimitedSelect("*", qualifiedTable, whereClause, 1000);

        return await connection.QueryAsync(sql, new { Start = timestamp, End = endDate });
    }
}
