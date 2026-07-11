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

## Customer DB access

Customer SQL идёт через `DatabaseProvider.OpenConnection` + **Dapper** (`CommandDefinition` + timeout из `AnalysisSettings`). `AppDbContext` удалён.

## Статические ресурсы API

| Файл | Назначение |
|------|------------|
| `API/Data/event_codes.csv` | Справочник EventCode → label (копируется в output) |
| `API/Resources/ReportTemplate.xlsx` | Шаблон Excel: «Данные» (таблица), «График» (нативный chart — **не обновляется** при текущем export) |

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
