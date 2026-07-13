# C4 Level 2 — Containers

## Контейнеры

```mermaid
C4Container
    title Containers — Backend + Frontend

    Person(user, "Аналитик")

    Container_Boundary(frontend, "Frontend") {
        Container(spa, "React SPA", "TypeScript, Vite, ECharts", "UI: графики, очередь, экспорт")
    }

    Container_Boundary(backend, "Backend") {
        Container(api, "API", ".NET 8, ASP.NET Core", "REST, сессии, оркестрация")
        Container(hangfire, "Hangfire Worker", "Hangfire.AspNetCore", "Фоновые job анализа")
        Container(sqlite, "Internal SQLite", "app.db", "Jobs, timing stats, Hangfire storage")
        Container(files, "Result files", "JSONL", "Серии точек анализа")
        Container(core, "Core library", ".NET 8, ML.NET", "SpikeDetectionService")
    }

    ContainerDb(customerDb, "Customer DB", "MSSQL / PostgreSQL", "Телеметрия")

    Rel(user, spa, "HTTPS")
    Rel(spa, api, "REST /api/dist/api", "JSON, blob")
    Rel(api, hangfire, "Enqueue jobs")
    Rel(hangfire, api, "DI, shared services")
    Rel(api, sqlite, "EF Core")
    Rel(hangfire, sqlite, "Job state")
    Rel(api, files, "Read/Write JSONL")
    Rel(hangfire, files, "Write JSONL")
    Rel(api, customerDb, "Per-session connection")
    Rel(hangfire, customerDb, "Per-job connection")
    Rel(api, core, "In-process")
    Rel(hangfire, core, "In-process")
```

## Описание контейнеров

### API (`backend/API`)

| Аспект | Детали |
|--------|--------|
| Технология | ASP.NET Core 8, Kestrel :5090 |
| Ответственность | HTTP API, DI, middleware, Hangfire dashboard |
| Хранилища | SQLite (`InternalConnection`), файлы `results/`, `logs/` |

### Core (`backend/Core`)

| Аспект | Детали |
|--------|--------|
| Технология | ML.NET SR-CNN |
| Ответственность | `ISpikeDetectionService` — детекция выбросов по ряду `DataPoint` |
| Зависимости | Не зависит от API |

### Internal SQLite (`app.db`)

Таблицы:

- `AnalysisJobs` — метаданные и статус job (`ProcessedUntil`, `ConnectionFingerprint`, batch metrics)
- `AnalysisSourceTimingStats` — средняя длительность батчей для ETA

### Hangfire SQLite (`hangfire.db`)

Отдельный файл (`HangfireConnection`). Очередь и состояние фоновых задач **не** в `app.db`.

### Result files (`results/`)

- `{jobId}.jsonl` — финальная серия (`AnomalyResultDto` построчно)
- `{jobId}.partial.jsonl` — промежуточная серия (checkpoint / seed для resume)

### Customer DB

Динамическое подключение по сессии. Поддерживаются MSSQL и PostgreSQL через `DatabaseProvider` и `ISqlDialectProvider`.

## Поток данных (контейнерный уровень)

```mermaid
sequenceDiagram
    participant UI as React SPA
    participant API as API
    participant HF as Hangfire
    participant DB as Customer DB
    participant INT as SQLite + JSONL

    UI->>API: POST /Auth/connect
    API-->>UI: X-Session-Token
    UI->>API: POST /dbo/enqueue
    API->>INT: INSERT AnalysisJob
    API->>HF: Enqueue ProcessSourceJobAsync
    HF->>DB: SQL aggregation batches
    HF->>INT: Save JSONL + update job
    UI->>API: GET /dbo/result/{id}
    API->>INT: Read JSONL
    API-->>UI: SpikeResponse JSON
```
