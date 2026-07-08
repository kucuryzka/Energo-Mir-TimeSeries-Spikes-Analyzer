# Services

Прикладная логика в `API/Services/`.

## AnalysisPipelineService

**Центральный оркестратор анализа.**

Ответственность:

1. Разбиение периода на батчи (`BatchIntervalDays` из settings).
2. SQL-агрегация в `DataPoint` (Dapper + `AppDbContext` через factory).
3. Вызов `ISpikeDetectionService` для каждого батча.
4. Callbacks: progress, partial save, batch completed stats.
5. Формирование `SpikeResponse` (series + distribution).

Публичные методы:

- `ExecuteAsync(...)` — полный pipeline для `AnalysisTableSpec`.
- `GetDistributionAsync`, `GetPointChannelBreakdownAsync` — вспомогательные запросы.

Использует `GranularityHelper.GetBucketEnd` для интервалов точек.

## AnalysisJobProcessor

Hangfire worker. Точки входа:

| Метод | Когда |
|-------|-------|
| `ProcessJobAsync(jobId, sessionToken)` | Generic job (`sourceId == null`) |
| `ProcessSourceJobAsync(jobId, sourceId, sessionToken)` | dbo / em_protocol |

Жизненный цикл job:

1. Load job из SQLite, status → Running
2. Resolve connection из session token
3. Execute через strategy или pipeline
4. `AnalysisResultService.SaveAsync` → JSONL
5. Update timing stats, status → Completed / Failed / Cancelled

## AnalysisResultService (Singleton)

| Метод | Описание |
|-------|----------|
| `HasResult` | Completed + (file или legacy inline JSON) |
| `CanExport` | Completed/Cancelled + jsonl file |
| `ResolveResultFilePath` | `ResultFilePath` или fallback `{jobId}.jsonl` |
| `SaveAsync` / `LoadAsync` | JSONL + metadata в `ResultJson` |
| `SavePartialSeriesAsync` | Polling во время Running |
| `EnumerateSeriesAsync` | Streaming для Excel export |

Файлы: `{ContentRoot}/results/` (настраивается `AnalysisSettings.ResultsDirectory`).

## AnalysisJobQueryService

**Новый сервис** — устраняет дублирование в трёх контроллерах.

| Метод | HTTP-аналог |
|-------|-------------|
| `FindJobAsync` | — |
| `BuildStatus` | GET status |
| `TryLoadPartialAsync` | GET partial-result |
| `SerializeResultAsync` | GET result |
| `GetChannelScopedHistoryAsync` | history dbo/em |
| `GetTableScopedHistoryAsync` | history generic |
| `DeleteJobAsync` | DELETE history |

## AnalysisJobCoordinatorService

- `GetQueueAsync`, `GetOverviewAsync` — для UI очереди.
- `TryCancelAsync` — cancel token + Hangfire delete.
- `ResolveSourceKind` — маппинг schema → `dbo` | `em` | `generic` для фронта.

## AnalysisTimingStatsService

Хранит скользящие средние длительности батчей/post-process в `AnalysisSourceTimingStats`. `EstimateAsync` → `AnalysisDurationEstimateDto`.

## AnalysisExportService

ClosedXML: листы «Аномалии», «Параметры», опционально «Распределение».

`loadDistribution=true` — повторный запрос distribution из customer DB (dbo/em/generic).

## AnalysisRequestValidator

Проверяет диапазон дат, `MaxAnalysisRangeDays`, `MaxSeriesPoints`, window size. **Примечание:** требует `customMinutes > 0` даже для не-Custom granularity — клиент должен передавать значение.

## TablePreviewService

`LoadAsync` — approximate count + sample rows (limit ≤ 50, timeout из `PreviewCommandTimeoutSeconds`).

## ConnectionManagerService

In-memory `ConcurrentDictionary<string, DatabaseSessionInfo>`. **Не персистентен** — рестарт API сбрасывает сессии.

## DatabaseContextFactory

Создаёт `AppDbContext` с динамической connection string и provider (MSSQL/Npgsql). Используется DataSources и pipeline.

## StaleAnalysisJobCleanup

`IHostedService` при старте: job в Running/Pending без живого Hangfire job → Failed.

## Прочие

| Service | Роль |
|---------|------|
| `AnalysisJobCancellationService` | Registry `CancellationTokenSource` per job id |
