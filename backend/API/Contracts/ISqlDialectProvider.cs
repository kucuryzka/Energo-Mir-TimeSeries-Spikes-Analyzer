namespace API.Contracts;

public interface ISqlDialectProvider
{
    IDatabaseDialect GetDialect(DatabaseProviderKind provider);
}
