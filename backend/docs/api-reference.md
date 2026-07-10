# API Reference

Полный справочник HTTP API на текущее состояние ветки `upgradments` (коммит `1109952` — упрощённый Excel-экспорт).

**Base URL (локально):** `http://localhost:5090/api`  
**Base URL (через Vite proxy):** `/api/dist/api` → rewrite на `/api`

## Аутентификация

| Механизм | Описание |
|----------|----------|
| Заголовок | `X-Session-Token: <token>` |
| Получение токена | `POST /api/Auth/connect` |
| Хранение на клиенте | `localStorage.dbToken` |

Сессии in-memory в `ConnectionManagerService`. Рестарт API сбрасывает все токены.

### Матрица авторизации

Не все эндпоинты требуют токен. Уровни проверки:

| Уровень | Метод | Поведение при отсутствии токена |
|---------|-------|----------------------------------|
| Нет | — | Запрос выполняется |
| `IsAuthenticated` | `SessionContextService` | HTTP 401 |
| `RequireToken` | Токен обязателен | HTTP 401 |
| `RequireConnection` | Токен + валидная сессия | HTTP 401 |
| Implicit | `DataSourceConnectionResolver` | Часто HTTP 500 с текстом ошибки |

---

## Auth

### `POST /api/Auth/connect`

Подключение к customer DB (MSSQL или PostgreSQL). Тело запроса не требует токена.

**Request body** (`AuthRequest`):

```json
{
  "provider": "mssql",
  "host": "localhost",
  "port": 1433,
  "username": "sa",
  "password": "***",
  "database": "MyDb"
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `provider` | string | `"mssql"` или `"pgsql"` |
| `host` | string | Хост |
| `port` | number | Порт (1433 / 5432) |
| `username` | string | Логин |
| `password` | string | Пароль |
| `database` | string? | Начальная БД (опционально) |

**Response 200** (`AuthResponse`):

```json
{
  "token": "guid-string",
  "message": "Connected successfully"
}
```

**Response 400:** `{ "message": "..." }`

---

## Explorer

Все эндпоинты требуют **RequireConnection** (`X-Session-Token`).

| Метод | Путь | Query | Response |
|-------|------|-------|----------|
| GET | `/api/Explorer/databases` | — | `string[]` |
| GET | `/api/Explorer/schemas` | `database` | `string[]` |
| GET | `/api/Explorer/tables` | `database`, `schema` | `string[]` |
| GET | `/api/Explorer/columns` | `database`, `schema`, `table` | `{ name, isTimeColumn }[]` |

---

## Sources

### `GET /api/Sources`

Без авторизации. Список зарегистрированных стратегий данных.

**Response:**

```json
[
  { "id": "Dbo", "name": "DBO Meterings", "supportedDistributions": [] },
  { "id": "em_protocol", "name": "EM Protocol", "supportedDistributions": ["EventCode"] }
]
```

---

## DBO — `/api/dbo`

**Таблицы:** `dbo.METERINGS` (время: `TIME_INSERT`, канал: `IDOBJECT`), справочник `dbo.OBJECTS`.

### Справочники и preview

| Метод | Путь | Auth | Query | Response |
|-------|------|------|-------|----------|
| GET | `objects` | Implicit | `database`, `search?`, `page=1`, `pageSize=50` | `ObjectDto[]` |
| GET | `distribution` | RequireToken | `database`, `startDate`, `endDate`, `channelId?` | `ChannelContributionDto[]` |
| GET | `preview` | RequireConnection | `database`, `limit=15` | `TablePreviewResponse` |

### Детализация точки

| Метод | Путь | Auth | Query | Response |
|-------|------|------|-------|----------|
| GET | `point-details` | Implicit | `database`, `timestamp`, `granularity`, `customMinutes?`, `channelId?` | `MeteringInfoDto[]` |
| GET | `point-channels` | Implicit | те же | `ChannelContributionDto[]` |

### Жизненный цикл задачи

| Метод | Путь | Auth | Body / Params | Response |
|-------|------|------|---------------|----------|
| POST | `enqueue` | RequireToken | `DetectSpikesRequest` | `{ "jobId": "..." }` |
| GET | `status/{id}` | Нет | — | `AnalysisJobStatusDto` |
| GET | `partial-result/{id}` | Нет | — | `SpikeResponse` (только series) |
| GET | `result/{id}` | Нет | — | `SpikeResponse` (JSON) |
| GET | `history` | Нет | `database` | `AnalysisJobHistoryItemDto[]` |
| DELETE | `history/{id}` | Нет | — | 204 / 404 |

**Enqueue:** создаёт `AnalysisJob` с `schema=dbo`, `table=channelId` или `"All"`, `timeColumn=""`. Hangfire: `ProcessSourceJobAsync(..., "Dbo", token)`.

---

## EM Protocol — `/api/em-protocol`

**Таблицы:** `em_protocol.Records`, `em_protocol.Channels`.

| Метод | Путь | Auth | Query / Body | Response |
|-------|------|------|--------------|----------|
| GET | `channels` | Implicit | `database`, `search?`, `page`, `pageSize` | `ChannelDto[]` |
| GET | `distribution` | Нет | `database`, `startDate`, `endDate`, `categoryName` | `DistributionItemDto[]` |
| GET | `preview` | RequireConnection | `database`, `limit` | `TablePreviewResponse` |
| GET | `point-channels` | Implicit | `database`, `timestamp`, `granularity`, `customMinutes?`, `channelId?` | `ChannelContributionDto[]` |
| POST | `enqueue` | RequireToken | `DetectSpikesRequest` | `{ "jobId" }` |
| GET | `status/{id}` | Нет | — | `AnalysisJobStatusDto` |
| GET | `partial-result/{id}` | Нет | — | `SpikeResponse` |
| GET | `result/{id}` | Нет | — | `SpikeResponse` |
| GET | `history` | Нет | `database` | `AnalysisJobHistoryItemDto[]` |
| DELETE | `history/{id}` | Нет | — | 204 / 404 |

Нет эндпоинта `point-details` (в отличие от dbo).

---

## Generic Analysis — `/api/GenericAnalysis`

Произвольная таблица с колонкой времени. Hangfire: `ProcessJobAsync`.

| Метод | Путь | Auth | Query / Body | Response |
|-------|------|------|--------------|----------|
| GET | `preview` | RequireConnection | `database`, `schema`, `table`, `timeColumn`, `limit` | `TablePreviewResponse` |
| POST | `enqueue` | RequireToken | `GenericAnalysisRequest` | `{ "jobId" }` |
| GET | `point-details` | RequireConnection | `database`, `schema`, `table`, `timeColumn`, `timestamp`, `granularity`, `customMinutes?` | dynamic rows (≤1000) |
| GET | `status/{id}` | Нет | — | `AnalysisJobStatusDto` |
| GET | `partial-result/{id}` | Нет | — | `SpikeResponse` |
| GET | `result/{id}` | Нет | — | `SpikeResponse` |
| GET | `history` | Нет | `database`, `schema`, `table` | `AnalysisJobHistoryItemDto[]` |
| DELETE | `history/{id}` | Нет | — | 204 / 404 |

---

## Analysis Jobs — `/api/analysis-jobs`

Глобальная очередь и экспорт. Все эндпоинты требуют **IsAuthenticated**.

| Метод | Путь | Query | Response |
|-------|------|-------|----------|
| GET | `overview` | `database?`, `recentLimit=50` | `AnalysisJobsOverviewDto` |
| GET | `estimate` | `database`, `schema`, `table`, `granularity`, `startDate`, `endDate` | `AnalysisDurationEstimateDto` |
| POST | `{id}/cancel` | — | `{ "message": "..." }` |
| GET | `{id}/export` | `loadDistribution=false` | `.xlsx` file |

### Excel export (`GET {id}/export`)

**Текущая реализация (упрощённая):**

1. Загружает полный `SpikeResponse` из JSONL в память (`LoadAsync`)
2. Заполняет шаблон `ReportTemplate.xlsx`, лист **«Данные»** только
3. Параметр `loadDistribution` **игнорируется**
4. Нет листов «Параметры», «Распределение»; график на «График» не обновляется

**Условия экспорта:** `CanExport` = статус `Completed` или `Cancelled` + существует JSONL-файл.

**Имя файла:** `spike-analysis-{yyyy-MM-dd_HHmm}.xlsx` (локальное время сервера).

**Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Ошибки:**

| Код | Условие |
|-----|---------|
| 401 | Нет/невалидный токен |
| 404 | Job не найден |
| 400 | Результат недоступен для экспорта |
| 500 | Ошибка формирования файла |

---

## DTO Reference

### DetectSpikesRequest

```json
{
  "database": "MyDb",
  "sourceId": "Dbo",
  "channelId": null,
  "granularity": "Hour",
  "customMinutes": 15,
  "confidence": 95,
  "windowSize": 30,
  "startDate": "2025-01-01T00:00:00Z",
  "endDate": "2025-01-31T23:59:59Z"
}
```

| Поле | Тип | По умолчанию | Примечание |
|------|-----|--------------|------------|
| `confidence` | number | 95 | Не nullable в коде |
| `windowSize` | number | 30 | Не nullable в коде |
| `customMinutes` | number? | — | Валидатор требует `> 0` для всех granularity |
| `channelId` | number? | null | null = все объекты/каналы |

### GenericAnalysisRequest

```json
{
  "database": "MyDb",
  "schema": "dbo",
  "table": "MyTable",
  "timeColumn": "CreatedAt",
  "granularity": "Day",
  "customMinutes": 1,
  "confidence": 95,
  "windowSize": 30,
  "startDate": "...",
  "endDate": "..."
}
```

### SpikeResponse

```json
{
  "series": [
    {
      "timestamp": "2025-01-15T10:00:00Z",
      "value": 123.45,
      "isSpike": true,
      "pValue": 0.003,
      "channelBreakdown": [
        { "channelId": 1, "channelName": "Объект А", "count": 5 }
      ]
    }
  ],
  "distribution": [
    { "channelId": 1, "channelName": "Объект А", "eventCode": null, "count": 42 }
  ]
}
```

### AnalysisJobStatusDto

```json
{
  "id": "guid",
  "status": "Running",
  "progress": 45,
  "errorMessage": null,
  "hasResult": false,
  "hasPartialResult": true,
  "seriesPointCount": 1200
}
```

Статусы: `Pending`, `Running`, `Completed`, `Failed`, `Cancelled`.

### AnalysisJobsOverviewDto

```json
{
  "active": [ /* AnalysisJobQueueItemDto[] */ ],
  "recent": [ /* AnalysisJobQueueItemDto[] */ ]
}
```

`AnalysisJobQueueItemDto` включает: `id`, `status`, `progress`, `database`, `schema`, `table`, `sourceKind` (`dbo`|`em`|`generic`), даты, `granularity`, `queuePosition`, `hasPartialResult`, `hasResult`, метрики батчей.

### AnalysisDurationEstimateDto

```json
{
  "estimatedDurationMs": 120000,
  "estimatedBatchCount": 8,
  "avgBatchDurationMs": 15000,
  "avgPostProcessDurationMs": 2000,
  "confidence": "high",
  "sampleCount": 12,
  "batchIntervalDays": 7
}
```

`confidence`: `"high"` | `"low"` | `"none"`.

### TablePreviewResponse

```json
{
  "approximateRowCount": 1500000,
  "sampleRows": [ { "col1": "...", "col2": 123 } ]
}
```

---

## JSON conventions

- camelCase для всех полей
- Enums (`TimeGranularity`) — строки: `Minute`, `Hour`, `Day`, `Week`, `Month`, `Custom`
- Даты — ISO 8601 UTC

---

## Hangfire

- Dashboard: `/hangfire` (локально) или `/api/dist/hangfire/` (за reverse proxy)
- Очередь: `default`
- Worker methods: `AnalysisJobProcessor.ProcessJobAsync`, `ProcessSourceJobAsync`

---

## Коды ошибок (типичные)

| HTTP | Причина |
|------|---------|
| 400 | Невалидный запрос, job не отменяется, export недоступен |
| 401 | Нет сессии |
| 404 | Job / history item не найден |
| 500 | SQL ошибка, внутренняя ошибка export |
