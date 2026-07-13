# API Client

HTTP-слой фронтенда в `src/api/`.

## Базовый клиент (`api/index.ts`)

```ts
API_BASE_PATH  = import.meta.env.VITE_API_BASE_PATH ?? '/api/dist/api'
HANGFIRE_PATH  = import.meta.env.VITE_HANGFIRE_PATH ?? '/api/dist/hangfire/'
```

### Axios instance

| Настройка | Значение |
|-----------|----------|
| `baseURL` | `API_BASE_PATH` |
| Headers | `X-Session-Token` из `localStorage.dbToken` |

### Interceptors

**Request:**
- Убирает ведущий `/` из URL (workaround для axios + baseURL)
- Регистрирует запрос в `requestTracker.startRequest`

**Response:**
- `requestTracker.endRequest` с status
- При ошибке с текстом `Invalid or missing session token` → очищает `dbToken` и `location.reload()`

### Re-exports

```ts
export { apiClient, API_BASE_PATH, HANGFIRE_PATH }
export { analyticsApi } from './analyticsApi'
export { analysisJobsApi } from './analysisJobsApi'
export { explorerApi, authApi, genericAnalysisApi } from './explorerApi'
```

---

## authApi (`explorerApi.ts`)

| Метод | HTTP | Path | Body | Returns |
|-------|------|------|------|---------|
| `connect` | POST | `/auth/connect` | `{ provider, host, port, database?, username, password }` | `{ token: string }` |

Используется в `ConnectionSetup`. Токен сохраняется как `localStorage.dbToken`.

---

## explorerApi (`explorerApi.ts`)

| Метод | HTTP | Path | Params | Returns |
|-------|------|------|--------|---------|
| `getDatabases` | GET | `/explorer/databases` | — | `string[]` |
| `getSchemas` | GET | `/explorer/schemas` | `database` | `string[]` |
| `getTables` | GET | `/explorer/tables` | `database`, `schema` | `string[]` |
| `getColumns` | GET | `/explorer/columns` | `database`, `schema`, `table` | `{ name, isTimeColumn }[]` |

---

## analyticsApi (`analyticsApi.ts`)

### Top-level

| Метод | HTTP | Path | Returns |
|-------|------|------|---------|
| `getSources` | GET | `/sources` | `DataSourceDto[]` |

### `analyticsApi.dbo`

| Метод | HTTP | Path | Params / Body | Returns |
|-------|------|------|---------------|---------|
| `enqueueAnalysis` | POST | `/dbo/enqueue` | `DetectSpikesRequest` | `{ jobId }` |
| `getJobStatus` | GET | `/dbo/status/{jobId}` | — | status object |
| `getJobResult` | GET | `/dbo/result/{jobId}` | — | `SpikeResponse` |
| `getJobPartialResult` | GET | `/dbo/partial-result/{jobId}` | — | `SpikeResponse` |
| `getHistory` | GET | `/dbo/history` | `database` | history items |
| `deleteHistoryItem` | DELETE | `/dbo/history/{jobId}` | — | void |
| `getObjects` | GET | `/dbo/objects` | `database`, `search?`, `page=1`, `pageSize=50` | `ChannelDto[]` |
| `getObjectDistribution` | GET | `/dbo/distribution` | `database`, `startDate`, `endDate`, `channelId?` | `ChannelContributionDto[]` |
| `getTablePreview` | GET | `/dbo/preview` | `database`, `limit=15` | preview |
| `getPointDetails` | GET | `/dbo/point-details` | `database`, `timestamp`, `granularity`, `customMinutes?`, `channelId?` | rows (**cached**) |
| `getPointChannels` | GET | `/dbo/point-channels` | same | `ChannelContributionDto[]` |

`getPointDetails` использует `apiCache` — повторные запросы с теми же params не идут на сервер.

### `analyticsApi.emProtocol`

| Метод | HTTP | Path | Params / Body | Returns |
|-------|------|------|---------------|---------|
| `getDistribution` | GET | `/em-protocol/distribution` | `database`, `startDate`, `endDate`, `categoryName` | `DistributionItemDto[]` |
| `getChannels` | GET | `/em-protocol/channels` | `database`, `search?`, `page`, `pageSize` | `ChannelDto[]` |
| `enqueueAnalysis` | POST | `/em-protocol/enqueue` | `DetectSpikesRequest` | `{ jobId }` |
| `getJobStatus` | GET | `/em-protocol/status/{jobId}` | — | status |
| `getJobResult` | GET | `/em-protocol/result/{jobId}` | — | `SpikeResponse` |
| `getJobPartialResult` | GET | `/em-protocol/partial-result/{jobId}` | — | `SpikeResponse` |
| `getHistory` | GET | `/em-protocol/history` | `database` | history |
| `deleteHistoryItem` | DELETE | `/em-protocol/history/{jobId}` | — | void |
| `getTablePreview` | GET | `/em-protocol/preview` | `database`, `limit=15` | preview |
| `getPointChannels` | GET | `/em-protocol/point-channels` | `database`, `timestamp`, `granularity`, `customMinutes?`, `channelId?` | contributions |

---

## genericAnalysisApi (`explorerApi.ts`)

| Метод | HTTP | Path | Params / Body | Returns |
|-------|------|------|---------------|---------|
| `getPointDetails` | GET | `/GenericAnalysis/point-details` | `database`, `schema`, `table`, `timeColumn`, `timestamp`, `granularity`, `customMinutes?` | rows (**cached**) |
| `getTablePreview` | GET | `/GenericAnalysis/preview` | `database`, `schema`, `table`, `timeColumn`, `limit=15` | preview |
| `enqueueAnalysis` | POST | `/GenericAnalysis/enqueue` | `GenericAnalysisRequest` | `{ jobId }` |
| `getJobStatus` | GET | `/GenericAnalysis/status/{id}` | — | status |
| `getJobResult` | GET | `/GenericAnalysis/result/{id}` | — | `SpikeResponse` |
| `getJobPartialResult` | GET | `/GenericAnalysis/partial-result/{id}` | — | `SpikeResponse` |
| `getHistory` | GET | `/GenericAnalysis/history` | `database`, `schema`, `table` | history |
| `deleteHistoryItem` | DELETE | `/GenericAnalysis/history/{jobId}` | — | void |

---

## analysisJobsApi (`analysisJobsApi.ts`)

Глобальная очередь и экспорт.

### Types (exported)

```ts
interface AnalysisJobQueueItem {
  id: string
  status: string
  progress: number
  database: string
  schema: string
  table: string
  sourceKind: 'dbo' | 'em_protocol' | 'generic'
  startDate: string
  endDate: string
  granularity: string
  createdAt: string
  completedAt?: string
  timeColumn: string
  customMinutes?: number
  channelId?: string | null
  queuePosition?: number
  hasPartialResult: boolean
  hasResult: boolean
  canResume?: boolean
  completedBatchCount?: number
  totalBatchCount?: number
  avgBatchDurationMs?: number
  lastBatchDurationMs?: number
  postProcessDurationMs?: number
}

interface AnalysisDurationEstimate {
  estimatedDurationMs: number
  estimatedBatchCount: number
  avgBatchDurationMs?: number
  avgPostProcessDurationMs?: number
  confidence: 'high' | 'low' | 'none'
  sampleCount: number
  batchIntervalDays: number
}

interface AnalysisJobsOverview {
  active: AnalysisJobQueueItem[]
  recent: AnalysisJobQueueItem[]
}
```

### Methods

| Метод | HTTP | Path | Params | Returns |
|-------|------|------|--------|---------|
| `getOverview` | GET | `/analysis-jobs/overview` | `database?`, `recentLimit=50` | `AnalysisJobsOverview` |
| `cancel` | POST | `/analysis-jobs/{jobId}/cancel` | — | void |
| `resume` | POST | `/analysis-jobs/{jobId}/resume` | — | void |
| `getEstimate` | GET | `/analysis-jobs/estimate` | `database`, `schema`, `table`, `granularity`, `startDate`, `endDate` | `AnalysisDurationEstimate` |
| `downloadExport` | GET | `/analysis-jobs/{jobId}/export` | `loadDistribution=false`, `responseType: 'blob'` | browser download |

**Resume:** доступен когда backend отдаёт `canResume: true` (Failed / Pending / Cancelled + checkpoint). Требует живую сессию к тому же серверу (fingerprint).

### downloadExport

1. GET blob с `loadDistribution` query param
2. Парсит `Content-Disposition` для имени файла
3. При ошибке (JSON в blob) — читает текст и показывает русское сообщение
4. Вызывает `downloadBlob(bytes, fileName)`

**Примечание:** на backend `loadDistribution` в текущей версии игнорируется — оба пункта меню экспорта ведут к одинаковому файлу (только лист «Данные»).

---

## Маппинг API → Feature

| Feature | API module |
|---------|------------|
| ConnectionSetup | `authApi` |
| DatabaseTreeSidebar | `explorerApi` |
| TelemetryContent (dbo) | `analyticsApi.dbo` |
| TelemetryContent (em) | `analyticsApi.emProtocol`, `getSources` |
| GenericAnalyzer | `genericAnalysisApi` |
| AnalysisJobQueue | `analysisJobsApi` |
| Duration hint | `analysisJobsApi.getEstimate` |
| Excel export | `analysisJobsApi.downloadExport` |
| Cancel job | `analysisJobsApi.cancel` |
| Resume job | `analysisJobsApi.resume` |

---

## Job polling (`utils/jobPolling.ts`)

Универсальный интерфейс для polling:

```ts
interface AnalysisJobApi {
  getJobStatus(jobId: string): Promise<any>
  getJobPartialResult?(jobId: string): Promise<SpikeResponse>
  getJobResult(jobId: string): Promise<SpikeResponse>
}
```

`pollAnalysisJob(api, jobId, callbacks)`:
- Status poll: каждые **3 секунды**
- Partial result: каждые **8 секунд** пока `Running`
- On `Completed` → full result
- On `Cancelled` / `Failed` → throws `AnalysisJobCancelledError` или error callback

Используется через `runAnalysisSessionJob` в `analysisSessionStore`.
