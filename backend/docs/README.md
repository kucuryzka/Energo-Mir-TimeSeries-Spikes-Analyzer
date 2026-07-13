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

Аутентификация: `POST /api/Auth/connect` → заголовок `X-Session-Token` на защищённых запросах (не на всех — см. [api-reference.md](api-reference.md)).

## Навигация

### API

| Документ | Описание |
|----------|----------|
| **[api-reference.md](api-reference.md)** | Полный справочник эндпоинтов, DTO, авторизации |

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
2. **Постановка анализа** — `AnalysisJobsController` (canonical `/api/analysis-jobs` + legacy `/dbo|em-protocol|GenericAnalysis/enqueue`) → `app.db` + Hangfire (`hangfire.db`).
3. **Выполнение** — `AnalysisJobProcessor` → checkpoint (`ProcessedUntil` + partial.jsonl) → `AnalysisPipelineService` / `IDataSourceStrategy` → `SpikeDetectionService`.
4. **Результат** — JSONL в `results/`, метаданные в SQLite (`AnalysisJobs`).
5. **Очередь, cancel, resume, экспорт** — `AnalysisJobsController` (overview, cancel, resume, Excel — лист «Данные»).

## Excel export (текущее состояние)

Упрощённая реализация:

- `AnalysisExportService` → `LoadAsync` + `ExcelReportService.GenerateReport`
- Заполняется только лист **«Данные»** шаблона `ReportTemplate.xlsx`
- Параметр `loadDistribution` на эндпоинте **игнорируется**
- `ExcelChartPatcher.cs` присутствует в репозитории, но **не вызывается**

Расширенный экспорт (chart patch, «Параметры», «Распределение») может быть восстановлен из истории git.

## Известные ограничения

- Legacy job URL aliases на `AnalysisJobsController` для совместимости с фронтом (enqueue/status/result/history).
- Поле `AnalysisJob.Table` перегружено: для dbo/em — ID канала или `"All"`, для generic — имя таблицы.
- Resume без partial-файла возможен по `ProcessedUntil` + `CompletedBatchCount`, но seed-серия в ML будет неполной до следующих батчей.
- Сессия БД in-memory: после рестарта API нужен reconnect; job с checkpoint → Failed + `canResume`.
