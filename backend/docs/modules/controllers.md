# Controllers

HTTP-слой API. Все контроллеры в `API/Controllers/`, namespace `API.Controllers`.

Полный справочник эндпоинтов с примерами JSON: [api-reference.md](../api-reference.md).

## Общие соглашения

- Аутентификация: заголовок `X-Session-Token` (получается через `POST /api/Auth/connect`).
- Проверка сессии: `SessionContextService` (`RequireToken`, `RequireConnection`, `IsAuthenticated`).
- **Не все** эндпоинты требуют токен — status/result/history job endpoints открыты.
- Ошибки: mix `Unauthorized(string)` и `Unauthorized(new { message })`.

### Матрица авторизации (кратко)

| Контроллер | Без токена | С токеном |
|------------|------------|-----------|
| Auth/connect | ✓ | — |
| Sources | ✓ | — |
| Explorer | — | RequireConnection |
| dbo/em enqueue, distribution | — | RequireToken |
| dbo/em status, result, history | ✓ | — |
| analysis-jobs | — | IsAuthenticated |
| GenericAnalysis preview, point-details | — | RequireConnection |

## AuthController

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/Auth/connect` | Проверка подключения к MSSQL/Postgres, создание сессии |

Возвращает `AuthResponse.Token`. Создаёт `DatabaseSessionInfo` в `ConnectionManagerService`.

## ExplorerController

| Метод | Путь | Параметры |
|-------|------|-----------|
| GET | `/api/Explorer/databases` | — |
| GET | `/api/Explorer/schemas` | `database` |
| GET | `/api/Explorer/tables` | `database`, `schema` |
| GET | `/api/Explorer/columns` | `database`, `schema`, `table` |

Использует `ISqlDialectProvider` + Dapper. Для generic analyzer UI.

## SourcesController

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/Sources` | Список `IDataSourceStrategy` (id, name, distributions) |

**Без авторизации.**

## DboController — `api/dbo`

**Источник:** `dbo.METERINGS`, объекты `dbo.OBJECTS`.

| Группа | Endpoints |
|--------|-----------|
| Справочники | `GET objects`, `GET distribution`, `GET preview` |
| Детализация точки | `GET point-details`, `GET point-channels` |
| Job lifecycle | `POST enqueue`, `GET status/{id}`, `GET partial-result/{id}`, `GET result/{id}`, `GET history`, `DELETE history/{id}` |

Enqueue: `DetectSpikesRequest`, schema=`dbo`, Hangfire `ProcessSourceJobAsync(..., "Dbo", token)`.

Job endpoints делегируют `AnalysisJobQueryService`.

## EmProtocolController — `api/em-protocol`

**Источник:** `em_protocol.Records`, каналы `em_protocol.Channels`.

| Группа | Endpoints |
|--------|-----------|
| Справочники | `GET channels`, `GET distribution?categoryName=EventCode`, `GET preview` |
| Детализация | `GET point-channels` |
| Job lifecycle | те же, что у dbo |

Enqueue: Hangfire id `"em_protocol"`.

## GenericAnalysisController — `api/GenericAnalysis`

Произвольная таблица с колонкой времени.

| Метод | Путь | Особенность |
|-------|------|-------------|
| GET | `preview` | schema, table, timeColumn |
| POST | `enqueue` | `GenericAnalysisRequest` → `ProcessJobAsync` |
| GET | `point-details` | Raw rows в интервале bucket |
| Job lifecycle | status, result, history… | history фильтрует по schema+table |

## AnalysisJobsController — `api/analysis-jobs`

Единая точка для **глобальной** очереди (не привязана к одному источнику).

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `overview` | active + recent |
| GET | `estimate` | ETA по `AnalysisTimingStatsService` |
| POST | `{id}/cancel` | Отмена через coordinator |
| GET | `{id}/export` | Excel (шаблон, лист «Данные»), query `loadDistribution` **игнорируется** |

## Зависимости контроллеров (типичные)

```
AnalysisJobsController
  → AnalysisJobCoordinatorService, AnalysisTimingStatsService
  → AnalysisExportService, AnalysisResultService, InternalDbContext
  → SessionContextService

DboController / EmProtocolController
  → DboDataSource | EmProtocolDataSource
  → InternalDbContext, IBackgroundJobClient
  → SessionContextService, AnalysisJobQueryService
  → AnalysisRequestValidator, TablePreviewService
```
