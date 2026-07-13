# Types

TypeScript-контракты в `src/types/analytics.types.ts` и inline types в API-модулях.

## analytics.types.ts

### TimeGranularity

```ts
type TimeGranularity = 'Minute' | 'Hour' | 'Day' | 'Week' | 'Month' | 'Custom'
```

Сериализуется как строка в API (совпадает с backend enum).

### DataSourceDto

```ts
interface DataSourceDto {
  id: string
  name: string
  supportedDistributions?: string[]
}
```

Пример: `{ id: 'em_protocol', supportedDistributions: ['EventCode'] }`.

### DetectSpikesRequest

```ts
interface DetectSpikesRequest {
  database: string
  sourceId: string
  channelId?: number | null
  granularity: TimeGranularity
  customMinutes?: number | null
  confidence: number
  windowSize: number
  startDate: string   // ISO UTC
  endDate: string
}
```

| Поле | Примечание |
|------|------------|
| `sourceId` | Передаётся фронтом (`'Dbo'` / `'em_protocol'`), backend dbo/em игнорирует |
| `channelId` | `null` = все объекты/каналы |
| `customMinutes` | Обязателен > 0 (backend validator) |
| `confidence` | Default 95 в UI |
| `windowSize` | Default 30, range 10–100 в UI |

### GenericAnalysisRequest

Используется в `genericAnalysisApi.enqueueAnalysis`:

```ts
{
  database: string
  schema: string
  table: string
  timeColumn: string
  startDate: string
  endDate: string
  granularity: TimeGranularity
  customMinutes: number
  confidence: number
  windowSize: number
}
```

### ChannelDto

```ts
interface ChannelDto {
  id: number
  name: string
  eventCode?: string
}
```

Используется для dbo objects и em channels (один DTO).

### DistributionItemDto

```ts
interface DistributionItemDto {
  category: string
  count: number
}
```

EM categorical distribution (EventCode groups).

### AnomalyResultDto

```ts
interface AnomalyResultDto {
  timestamp: string
  value: number
  isSpike: boolean
  pValue: number
  channelBreakdown?: ChannelContributionDto[]
}
```

### ChannelContributionDto

```ts
interface ChannelContributionDto {
  channelId: number
  channelName: string
  eventCode?: string
  count: number
}
```

Используется в:
- `SpikeResponse.distribution`
- `AnomalyResultDto.channelBreakdown`
- Point channel breakdown API

### SpikeResponse

```ts
interface SpikeResponse {
  series: AnomalyResultDto[]
  distribution?: ChannelContributionDto[]
}
```

Основной контракт результата анализа.

### SpikePoint (frontend-only)

```ts
interface SpikePoint extends AnomalyResultDto {
  severity: 'critical' | 'warning' | 'info' | 'normal'
  confidencePercent: number
}
```

Создаётся в `enrichSpikeData()` — не приходит с API.

---

## analysisJobsApi types

Определены в `api/analysisJobsApi.ts`, экспортируются:

### AnalysisJobQueueItem

Полная карточка job в очереди. См. [api-client.md](api-client.md#types-exported).

### AnalysisDurationEstimate

ETA для hint в `TelemetryControls`.

### AnalysisJobsOverview

```ts
{ active: AnalysisJobQueueItem[], recent: AnalysisJobQueueItem[] }
```

---

## Inline / any types

Некоторые API methods типизированы как `any` (legacy):

| Method | Тип ответа |
|--------|------------|
| `getJobStatus` | `{ status, progress, hasResult, hasPartialResult, ... }` |
| `getHistory` | `AnalysisJobHistoryItem[]` (не экспортирован) |
| `getTablePreview` | `{ approximateRowCount, sampleRows }` |
| `getPointDetails` | `Record<string, unknown>[]` |

Рекомендация при рефакторинге: вынести в `analytics.types.ts`.

---

## Severity mapping

```ts
function getSeverity(pValue: number):
  pValue < 0.01  → 'critical'
  pValue < 0.05  → 'warning'
  pValue < 0.10  → 'info'
  else           → 'normal'
```

`confidencePercent = (1 - pValue) * 100` в `enrichSpikeData`.

---

## Соответствие backend DTO

| Frontend | Backend |
|----------|---------|
| `DetectSpikesRequest` | `API.DTOs.DetectSpikesRequest` |
| `SpikeResponse` | `API.DTOs.SpikeResponse` |
| `ChannelContributionDto` | `API.DTOs.ChannelContributionDto` |
| `AnalysisJobQueueItem` | `AnalysisJobQueueItemDto` |
| `AnalysisDurationEstimate` | `AnalysisDurationEstimateDto` |

JSON: camelCase на обеих сторонах.

Полный справочник backend DTO: [backend/docs/api-reference.md](../../backend/docs/api-reference.md).

---

## PendingAnalysisJobOpen

**Путь:** `utils/analysisJobLoader.ts`

```ts
interface PendingAnalysisJobOpen {
  id: string
  status: string
  progress: number
  sourceKind: string  // 'dbo' | 'em_protocol' | 'generic'
  database: string
  schema: string
  table: string
  timeColumn: string
  channelId?: string | null
  startDate: string
  endDate: string
  hasPartialResult: boolean
  hasResult: boolean
  granularity: TimeGranularity
  customMinutes?: number | null
}
```

Handoff от `AnalysisJobQueue` к analyzer при открытии job.

---

## ShellRailActions

**Путь:** `context/ShellRailContext.tsx`

```ts
interface ShellRailActions {
  onOpenHistory?: () => void
}
```

Расширяемый интерфейс для действий в icon rail.
