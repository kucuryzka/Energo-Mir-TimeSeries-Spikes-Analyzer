# Data (Entity Framework)

Папка: `API/Data/`.

## InternalDbContext

SQLite (`InternalConnection` в appsettings). **Основное** хранилище метаданных приложения.

### DbSet

| Entity | Таблица | Описание |
|--------|---------|----------|
| `AnalysisJob` | AnalysisJobs | Задачи анализа |
| `AnalysisSourceTimingStats` | AnalysisSourceTimingStats | Статистика длительности |

### AnalysisJob (ключевые поля)

| Поле | Тип | Семантика |
|------|-----|-----------|
| `Id` | string (GUID) | PK |
| `Status` | string | Pending, Running, Completed, Failed, Cancelled |
| `Database`, `Schema` | string | Целевая БД и схема |
| `Table` | string | **Перегружено:** channel filter или имя таблицы |
| `TimeColumn` | string | Пусто для dbo/em; имя колонки для generic |
| `ResultFilePath` | string? | `{id}.jsonl` |
| `ResultJson` | string? | Metadata: `{ distribution: [...] }` |
| `SeriesPointCount` | int | Число точек в серии |
| `BackgroundJobId` | string? | Hangfire job id |

### Миграции

EF migrations **не используются**. Схема обновляется при старте:

```csharp
InternalDbSchemaUpdater.Apply(internalDb);
```

Добавляет колонки через `PRAGMA table_info` + `ALTER TABLE` (идемпотентно).

## AppDbContext

Маппинг `Core.Models.Record` для EF-запросов к **customer DB**.

Создаётся через `DatabaseContextFactory.Create(connectionString, provider, database)` — **не** через стандартный DI `AddDbContext` с пустым `DefaultConnection`.

### Record

Сущность сырой телеметрии (используется pipeline при необходимости EF; основной путь — Dapper).

## Hangfire storage

Тот же SQLite connection string (`InternalConnection`). Таблицы Hangfire coexist с `AnalysisJobs`.

## Файловое хранилище результатов

Не EF — см. `AnalysisResultService`:

```
API/results/
  {jobId}.jsonl
  {jobId}.partial.jsonl
```

Рекомендация: каталог в `.gitignore`, backup отдельно от `app.db`.
