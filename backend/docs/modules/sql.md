# SQL / Dialects

Абстракция SQL для MSSQL и PostgreSQL. Папка: `API/Sql/`.

## ISqlDialectProvider

```csharp
IDatabaseDialect GetDialect(string provider);
```

`SqlDialectProvider` (Singleton) нормализует provider через `DatabaseProvider.Normalize` и возвращает:

| Provider | Implementation |
|----------|----------------|
| mssql | `MssqlDialect` |
| pgsql | `PostgresDialect` |

## IDatabaseDialect

Методы генерации SQL (без выполнения):

| Метод | Назначение |
|-------|------------|
| `QualifyTable(schema, table)` | `[schema].[table]` или `"schema"."table"` |
| `QualifyColumn(alias, column)` | Квалифицированное имя колонки |
| `QualifyFromTable(schema, table, alias?)` | FROM clause с alias |
| `QuoteIdentifier(name)` | Экранирование идентификатора |
| `BuildLimitedSelect(...)` | SELECT TOP / LIMIT |
| `Paginate(sql, offset, limit)` | OFFSET/FETCH или LIMIT/OFFSET |
| `BuildListDatabasesSql()` | Explorer |
| `BuildListSchemasSql()` | Explorer |
| `BuildListTablesSql()` | Explorer |
| `BuildListColumnsSql()` | Explorer + IsTimeColumn heuristic |

## Использование

```
ExplorerController     → list databases/schemas/tables/columns
AnalysisPipelineService → aggregation queries
DboDataSource / EmProtocolDataSource / pipeline → raw SQL via Dapper
TablePreviewService    → count + sample via Dapper
GenericAnalysisController → point-details via Dapper
```

## DatabaseProvider (Infrastructure)

Не dialect, но связан:

```csharp
DatabaseProvider.Normalize(provider)
DatabaseProvider.IsPostgres(provider)
DatabaseProvider.OpenConnection(provider, connectionString)
```

Возвращает `SqlConnection` или `NpgsqlConnection`.

## Принцип расширения

Новый СУБД:

1. Реализовать `IDatabaseDialect`
2. Добавить case в `SqlDialectProvider`
3. Расширить `DatabaseProvider.OpenConnection`

## Пример квалификации

MSSQL:
```sql
SELECT TOP 100 * FROM [dbo].[METERINGS] AS m WHERE ...
```

PostgreSQL:
```sql
SELECT * FROM "dbo"."METERINGS" AS m WHERE ... LIMIT 100
```

Диалект скрывает различия синтаксиса от pipeline и data sources.
