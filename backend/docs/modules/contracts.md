# Contracts

Интерфейсы приложения в `API/Contracts/`.

## IConnectionManagerService

```csharp
string CreateSession(DatabaseSessionInfo info);
DatabaseSessionInfo? GetConnectionInfo(string token);
void RemoveSession(string token);
```

**Реализация:** `Services/ConnectionManagerService.cs` (Singleton).

**Потребители:**

- `AuthController` — создание сессии
- `SessionContextService` — проверка токена
- `DataSourceConnectionResolver` — connection для data sources
- `AnalysisJobProcessor` — connection в Hangfire worker

## Другие интерфейсы (в Services/)

| Interface | Файл | Реализация |
|-----------|------|------------|
| `IDatabaseContextFactory` | DatabaseContextFactory.cs | DatabaseContextFactory |
| `IAnalysisJobCancellationService` | AnalysisJobCancellationService.cs | AnalysisJobCancellationService |

## DataSources contracts

В `API/DataSources/`:

- `IDataSourceStrategy`

## Sql contracts

В `API/Sql/`:

- `ISqlDialectProvider` → `SqlDialectProvider`
- `IDatabaseDialect` → `MssqlDialect`, `PostgresDialect`

## Core contracts

В `Core/Interfaces/`:

- `ISpikeDetectionService` — **активно используется**
- `ITimeSeriesService` — legacy, не регистрируется в DI
- `IDataLoader` — legacy (CSV)

## Принцип

Новые cross-cutting контракты — в `Contracts/`. Интерфейсы, тесно связанные с одной реализацией, могут оставаться в том же файле (как `IDatabaseContextFactory`).
