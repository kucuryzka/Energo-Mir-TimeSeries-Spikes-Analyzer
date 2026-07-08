# Infrastructure

Cross-cutting компоненты в `API/Infrastructure/`.

## SessionContextService (Scoped)

Единая точка работы с HTTP-сессией БД.

| Метод | Поведение |
|-------|-----------|
| `GetToken()` | Читает `X-Session-Token` |
| `IsAuthenticated()` | Токен валиден в ConnectionManager |
| `RequireToken()` | Иначе `UnauthorizedAccessException` |
| `RequireConnection()` | Возвращает `DatabaseSessionInfo` |

**Заменяет** приватные `RequireSession*` в 4+ контроллерах.

## DataSourceConnectionResolver (Scoped)

```csharp
(string ConnectionString, string Provider) Resolve(
    string? connectionString, string? provider)
```

- Hangfire worker передаёт explicit connection.
- HTTP request — резолв из session token.

## GranularityHelper (static)

```csharp
DateTime GetBucketEnd(DateTime timestamp, TimeGranularity granularity, int? customMinutes)
```

Конец временного bucket для Minute/Hour/Day/Week/Month/Custom.

## DatabaseConnectionHelper (static)

```csharp
string WithDatabase(string connectionString, string database)
```

Меняет каталог в connection string builder (MSSQL `Database`, Postgres `Database`).

## DatabaseProvider (static)

См. [sql.md](sql.md).

## FileLoggerProvider

`ILoggerProvider` — пишет в `logs/api-{date}.log`.

Настройка в `appsettings.json` → секция `Logging:File`:

```json
"File": {
  "Enabled": true,
  "Directory": "logs",
  "MinLevel": "Information"
}
```

Подключается в `Program.cs` до `builder.Build()`.

## HangfireDashboardAuthorizationFilter

`IDashboardAuthorizationFilter` — в текущей версии разрешает доступ к Hangfire dashboard (настройте для production).

## Middleware (Program.cs)

| Middleware | Назначение |
|------------|------------|
| `UseForwardedHeaders` | X-Forwarded-Prefix для nginx |
| Path rewrite | `/hangfire` → `/api/dist/hangfire` при необходимости |
| `UseCors` | React dev servers |
| `UseHangfireDashboard` | Мониторинг job |

## Рекомендуемое размещение нового кода

| Тип | Папка |
|-----|-------|
| HTTP/session helpers | Infrastructure |
| Logging, auth filters | Infrastructure |
| DB connection utilities | Infrastructure |
| Бизнес-логика анализа | Services |
| SQL generation | Sql |
