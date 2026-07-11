using API.Contracts;

namespace API.Sql;

public class SqlDialectProvider : ISqlDialectProvider
{
    private readonly IReadOnlyDictionary<DatabaseProviderKind, IDatabaseDialect> _dialects;

    public SqlDialectProvider()
    {
        var list = new IDatabaseDialect[] { new MssqlDialect(), new PostgresDialect() };
        _dialects = list.ToDictionary(d => d.ProviderId);
    }

    public IDatabaseDialect GetDialect(DatabaseProviderKind provider)
    {
        if (_dialects.TryGetValue(provider, out var dialect))
            return dialect;
        throw new NotSupportedException($"Database provider '{provider}' is not supported. Use 'mssql' or 'pgsql'.");
    }
}
