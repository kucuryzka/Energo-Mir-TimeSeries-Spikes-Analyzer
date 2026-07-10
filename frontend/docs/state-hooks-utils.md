# State, Hooks & Utils

## Stores (`src/store/`)

Модульные singleton-сторы без Redux/Zustand. Паттерн pub/sub.

### analysisSessionStore

**Путь:** `store/analysisSessionStore.ts`

Центральное хранилище состояния анализа по session key.

#### Session keys

```
telemetry:dbo:{database}
telemetry:em:{database}
generic:{db}:{schema}:{table}:{timeColumn}
```

#### AnalysisSessionSnapshot

```ts
{
  loading: boolean
  progress: number
  error: string | null
  jobId: string | null
}
```

#### API

| Export | Описание |
|--------|----------|
| `subscribeAnalysisSession(key, listener)` | Pub/sub |
| `useAnalysisSession(key)` | React hook для snapshot |
| `useAnalysisResultData(key, api, options?)` | Session + `SpikeResponse`, partial loading, visibility |
| `runAnalysisSessionJob(key, jobId, api, callbacks?)` | Start polling |
| `cancelAnalysisSessionJob(key)` | Stop + reset loading |
| `stopAnalysisSessionPolling(key)` | Bump generation token |
| `updateAnalysisSession(key, patch)` | Partial update |
| `clearAnalysisSession(key)` | Reset one |
| `clearAllAnalysisSessions()` | Reset all (on logout) |

#### useAnalysisResultData

Комбинирует:
- Session snapshot из store
- Загруженный `SpikeResponse`
- `enrichSpikeData` для severity
- Document visibility — pause/resume polling

### requestTracker

**Путь:** `store/requestTracker.ts`

```ts
interface TrackedRequest {
  id: string
  url: string
  method: string
  startTime: number
  endTime?: number
  status?: number
  errorMessage?: string
}
```

| Export | Описание |
|--------|----------|
| `startRequest(url, method)` | Returns id |
| `endRequest(id, status?, error?)` | Complete |
| `subscribe(listener)` | Pub/sub |
| `getSnapshot()` | Current list |
| `clear()` | On logout |

Max **200** entries, FIFO trim.

### apiCache

**Путь:** `store/apiCache.ts`

In-memory `Map` с ключом `JSON.stringify({ url, params, data })`.

Используется для:
- `analyticsApi.dbo.getPointDetails`
- `genericAnalysisApi.getPointDetails`

---

## Hooks (`src/hooks/`)

### useAnalysisJobActions

**Путь:** `hooks/useAnalysisJobActions.ts`

```ts
useAnalysisJobActions(sessionKey, jobId?)
```

| Return | Действие |
|--------|----------|
| `handleCancel` | `analysisJobsApi.cancel` + `cancelAnalysisSessionJob` |
| `handleExport(loadDistribution)` | `analysisJobsApi.downloadExport` |

### useAnalysisHistory

**Путь:** `hooks/useAnalysisHistory.ts`

Параметры: `{ database, schema?, table?, fetchHistory, deleteHistoryItem, onRestoreJob }`

| Return | Описание |
|--------|----------|
| `historyOpen`, `setHistoryOpen` | Drawer state |
| `historyItems`, `historyLoading` | Data |
| `openHistory` | Open drawer + fetch |
| `handleDelete` | Delete item |
| `handleRestore` | Load job params + result |

Регистрирует `onOpenHistory: openHistory` через `useRegisterShellRailActions`.

### useDurationEstimate

**Путь:** `hooks/useDurationEstimate.ts`

Debounced (400ms) вызов `analysisJobsApi.getEstimate`.

Возвращает русскую строку-подсказку или `null`:
- `~2м 30с` (approximate)
- `Недостаточно данных для оценки`

### useTablePreview

**Путь:** `hooks/useTablePreview.ts`

```ts
useTablePreview({ fetchPreview, resetKey, enabled })
```

Lazy-load preview при `enabled=true`. Сброс при смене `resetKey` (database, table, etc.).

---

## Utils (`src/utils/`)

### spikeUtils.ts

| Function | Описание |
|----------|----------|
| `getSeverity(pValue)` | `'critical' \| 'warning' \| 'info' \| 'normal'` |
| `enrichSpikeData(series)` | Adds `severity`, `confidencePercent` → `SpikePoint[]` |
| `getStatistics(series)` | totalCount, spikesCount, criticalCount, avg, max, totalPoints |
| `getSpikesOnly(series)` | Filter `isSpike === true` |

Severity thresholds:
- critical: p < 0.01
- warning: p < 0.05
- info: p < 0.10

### jobPolling.ts

| Export | Описание |
|--------|----------|
| `pollAnalysisJob(api, jobId, options)` | Main polling loop |
| `AnalysisJobCancelledError` | Thrown on cancel |
| `AnalysisJobApi` | Interface for status/result APIs |

Intervals:
- Status: **3s**
- Partial: **8s** while Running

### analysisJobLoader.ts

| Export | Описание |
|--------|----------|
| `PendingAnalysisJobOpen` | Type for queue → analyzer handoff |
| `toPendingAnalysisJobOpen(item)` | From queue item |
| `getAnalysisJobApi(sourceKind)` | Returns dbo/em/generic API |
| `canOpenAnalysisJob(item)` | Boolean guard |
| `loadAnalysisJobResult(api, jobId)` | Fetch full or partial result |

### dateTimeUtils.ts

UTC parse/format с dayjs:
- `parseUtc`, `formatUtc`, `toIsoUtc`

### formatDuration.ts

```ts
formatDurationMs(ms, approximate?) → "~2м 30с" | "45с"
```

### granularityLabels.ts

Russian labels для `TimeGranularity` enum.

### granularityWarning.tsx

| Export | Описание |
|--------|----------|
| `estimateSeriesPointCount(...)` | Rough point count estimate |
| `confirmHeavyAnalysis(estimate)` | Modal if ≥ 100,000 points |

### eventCodeMap.ts

Загружает `public/event_codes.csv` at runtime.

```ts
loadEventCodeMap(): Promise<void>
resolveEventCodeLabel(code): string
```

### downloadBlob.ts

```ts
downloadBlob(data: BlobPart, fileName: string)
parseContentDisposition(header): string | null
```

Used by Excel export.

---

## Context (`src/context/`)

### ShellRailContext

См. [architecture.md](architecture.md#shellrailcontext).

---

## Data enrichment pipeline

```
SpikeResponse.series (API)
    ↓ enrichSpikeData()
SpikePoint[] (severity, confidencePercent)
    ↓ getStatistics()
KPI values
    ↓ downsampleLttb (in SpikeChart)
Visible chart points
```

---

## Logout cleanup

При logout (`App.tsx`):

1. `localStorage.removeItem('dbToken')`
2. `clearAllAnalysisSessions()`
3. `requestTracker.clear()` (if called)

Session store polling останавливается через generation token bump.
