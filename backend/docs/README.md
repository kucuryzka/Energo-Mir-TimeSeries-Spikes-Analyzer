# Backend documentation

Документация по проекту `backend/` — ASP.NET Core 8 API и библиотека `Core` для детекции аномалий во временных рядах.

## Структура решения

```
backend/
├── API/          # HTTP API, Hangfire, SQL, источники данных
├── Core/         # ML.NET spike detection, доменные модели
└── docs/         # эта документация
```

## Быстрый старт

```bash
dotnet run --project backend/API/API.csproj
```

- API: `http://localhost:5090`
- Swagger (Development): `/swagger`
- Hangfire: `/api/dist/hangfire/` (за nginx) или `/hangfire` локально

Аутентификация: `POST /api/Auth/connect` → заголовок `X-Session-Token` на всех защищённых запросах.

## Навигация

### Архитектура (C4)

| Уровень | Документ |
|---------|----------|
| L1 — Context | [c4-level1-context.md](architecture/c4-level1-context.md) |
| L2 — Containers | [c4-level2-containers.md](architecture/c4-level2-containers.md) |
| L3 — Components | [c4-level3-components.md](architecture/c4-level3-components.md) |

### Модули

| Модуль | Документ |
|--------|----------|
| Controllers | [controllers.md](modules/controllers.md) |
| Services | [services.md](modules/services.md) |
| DataSources | [datasources.md](modules/datasources.md) |
| Data (EF) | [data.md](modules/data.md) |
| DTOs | [dtos.md](modules/dtos.md) |
| Models | [models.md](modules/models.md) |
| Contracts | [contracts.md](modules/contracts.md) |
| SQL / Dialects | [sql.md](modules/sql.md) |
| Infrastructure | [infrastructure.md](modules/infrastructure.md) |
| Configuration | [configuration.md](modules/configuration.md) |
| Core library | [core.md](modules/core.md) |

## Ключевые потоки

1. **Подключение** — `AuthController` → `ConnectionManagerService` (in-memory сессии).
2. **Постановка анализа** — `Dbo` / `em-protocol` / `GenericAnalysis` → `InternalDbContext` + Hangfire.
3. **Выполнение** — `AnalysisJobProcessor` → `IDataSourceStrategy` или `AnalysisPipelineService` → `SpikeDetectionService`.
4. **Результат** — JSONL в `results/`, метаданные в SQLite (`AnalysisJobs`).
5. **Очередь и экспорт** — `AnalysisJobsController` (overview, cancel, Excel).

## Известные ограничения

- Эндпоинты жизненного цикла job дублируются по префиксам `/dbo`, `/em-protocol`, `/GenericAnalysis` (обратная совместимость с фронтом).
- Поле `AnalysisJob.Table` перегружено: для dbo/em — ID канала или `"All"`, для generic — имя таблицы.
