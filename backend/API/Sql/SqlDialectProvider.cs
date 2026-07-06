namespace API.Sql;

public interface ISqlDialectProvider
{
    IDatabaseDialect GetDialect(string provider);
}

public class SqlDialectProvider : ISqlDialectProvider
{
    private readonly IReadOnlyDictionary<string, IDatabaseDialect> _dialects;

    public SqlDialectProvider()
    {
        var list = new IDatabaseDialect[] { new MssqlDialect(), new PostgresDialect() };
        _dialects = list.ToDictionary(d => d.ProviderId, StringComparer.OrdinalIgnoreCase);
    }

    public IDatabaseDialect GetDialect(string provider)
    {
        var key = provider.Equals("postgres", StringComparison.OrdinalIgnoreCase) ? "pgsql" : provider;
        if (_dialects.TryGetValue(key, out var dialect))
            return dialect;
        throw new NotSupportedException($"Database provider '{provider}' is not supported. Use 'mssql' or 'pgsql'.");
    }
}
