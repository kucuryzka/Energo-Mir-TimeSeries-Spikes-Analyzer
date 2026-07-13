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

Job lifecycle (`enqueue` / `status` / `result` / `history`) — **legacy aliases** на `AnalysisJobsController` (фронт всё ещё бьёт в `/dbo/…`).

## EmProtocolController — `api/em-protocol`

**Источник:** `em_protocol.Records`, каналы `em_protocol.Channels`.

| Группа | Endpoints |
|--------|-----------|
| Справочники | `GET channels`, `GET distribution?categoryName=EventCode`, `GET preview` |
| Детализация | `GET point-channels` |

Job lifecycle — аналогично dbo: legacy aliases на `AnalysisJobsController`.

## GenericAnalysisController — `api/GenericAnalysis`

Произвольная таблица с колонкой времени.

| Метод | Путь | Особенность |
|-------|------|-------------|
| GET | `preview` | schema, table, timeColumn |
| GET | `point-details` | Raw rows в интервале bucket |

Enqueue / status / result / history — legacy aliases на `AnalysisJobsController`.

## AnalysisJobsController — `api/analysis-jobs`

Единая точка для **жизненного цикла job**: enqueue, list/history, overview, ETA, status/result, cancel, **resume**, export.

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `` | Unified enqueue (`EnqueueAnalysisJobRequest`) |
| GET | `` | History (channel- или table-scoped) |
| GET | `overview` | active + recent |
| GET | `estimate` | ETA по `AnalysisTimingStatsService` |
| GET | `{id}` | Status (`canResume`) |
| GET | `{id}/partial-result` / `{id}/result` | Результаты |
| DELETE | `{id}` | Удаление job |
| POST | `{id}/cancel` | Отмена через coordinator |
| POST | `{id}/resume` | Продолжение с checkpoint |
| GET | `{id}/export` | Excel (шаблон, лист «Данные»), query `loadDistribution` **игнорируется** |

Legacy aliases на том же контроллере: `/api/dbo|em-protocol|GenericAnalysis/{enqueue,status,…}` — browse endpoints остаются на domain-контроллерах.

## Зависимости контроллеров (типичные)

```
AnalysisJobsController
  → AnalysisJobCoordinatorService, AnalysisTimingStatsService
  → AnalysisExportService, AnalysisResultService, AnalysisJobQueryService
  → InternalDbContext, SessionContextService

DboController / EmProtocolController / GenericAnalysisController
  → DataSource / TablePreview / point & distribution endpoints
  → SessionContextService
  (job lifecycle → legacy aliases на AnalysisJobsController)
```
