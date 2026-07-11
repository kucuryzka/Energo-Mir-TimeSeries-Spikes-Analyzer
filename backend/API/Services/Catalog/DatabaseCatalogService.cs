using System.Data.Common;
using API.DTOs;
using API.Models;
using API.Sql;
using Dapper;

using API.Contracts;

namespace API.Services.Catalog;

public class DatabaseCatalogService
{
    private readonly ISqlDialectProvider _dialectProvider;
    private readonly SessionContextService _session;

    public DatabaseCatalogService(
        ISqlDialectProvider dialectProvider,
        SessionContextService session)
    {
        _dialectProvider = dialectProvider;
        _session = session;
    }

    public async Task<IReadOnlyList<string>> ListDatabasesAsync()
    {
        var info = _session.RequireConnection();
        var dialect = _dialectProvider.GetDialect(info.Provider);
        await using var conn = OpenConnection(info);
        await conn.OpenAsync();

        var dbs = await conn.QueryAsync<string>(dialect.BuildListDatabasesSql());
        return dbs.AsList();
    }

    public async Task<IReadOnlyList<string>> ListSchemasAsync(string database)
    {
        var info = _session.RequireConnection();
        var dialect = _dialectProvider.GetDialect(info.Provider);
        await using var conn = OpenConnection(info, database);
        await conn.OpenAsync();

        var schemas = await conn.QueryAsync<string>(dialect.BuildListSchemasSql());
        return schemas.AsList();
    }

    public async Task<IReadOnlyList<string>> ListTablesAsync(string database, string schema)
    {
        SqlIdentifier.EnsureSafe(schema, nameof(schema));
        var info = _session.RequireConnection();
        var dialect = _dialectProvider.GetDialect(info.Provider);
        await using var conn = OpenConnection(info, database);
        await conn.OpenAsync();

        var tables = await conn.QueryAsync<string>(dialect.BuildListTablesSql(), new { schema });
        return tables.AsList();
    }

    public async Task<IReadOnlyList<CatalogColumnDto>> ListColumnsAsync(string database, string schema, string table)
    {
        SqlIdentifier.EnsureSafeMany((schema, nameof(schema)), (table, nameof(table)));
        var info = _session.RequireConnection();
        var dialect = _dialectProvider.GetDialect(info.Provider);
        await using var conn = OpenConnection(info, database);
        await conn.OpenAsync();

        var columns = await conn.QueryAsync(dialect.BuildListColumnsSql(), new { schema, table });
        return columns
            .Select(c => new CatalogColumnDto
            {
                Name = (string)c.Name,
                IsTimeColumn = (bool)c.IsTimeColumn
            })
            .ToList();
    }

    private static DbConnection OpenConnection(DatabaseSessionInfo info, string? database = null)
    {
        var connectionString = string.IsNullOrEmpty(database)
            ? info.ConnectionString
            : DatabaseConnectionHelper.WithDatabase(info.ConnectionString, database);
        return DatabaseProvider.OpenConnection(info.Provider, connectionString);
    }
}
