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
| `GetStoredDistribution` | Distribution из `ResultJson` (для export без reload) |
| `SavePartialSeriesAsync` | Polling во время Running |
| `EnumerateSeriesAsync` | Streaming для Excel export |

Файлы: `{ContentRoot}/results/` (настраивается `AnalysisSettings.ResultsDirectory`).

## AnalysisJobQueryService

Общая логика status / result / history / delete для трёх контроллеров.

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

- `GetOverviewAsync` — active + recent jobs для UI очереди.
- `TryCancelAsync` — cancel token + Hangfire delete.
- `ResolveSourceKind` — маппинг schema → `dbo` | `em` | `generic` для фронта.

## AnalysisTimingStatsService

Хранит скользящие средние длительности батчей/post-process в `AnalysisSourceTimingStats`. `EstimateAsync` → `AnalysisDurationEstimateDto`.

## ExcelReportService (Scoped)

Загрузка шаблона `API/Resources/ReportTemplate.xlsx` и заполнение листа **«Данные»**.

| Метод | Описание |
|-------|----------|
| `OpenTemplate()` | Открывает xlsx-шаблон (листы «Данные», «График») |
| `FillSeriesAsync` | Стримит точки из JSONL в таблицу «Данные», ресайзит Excel Table |

Колонки: Timestamp, Value, IsSpike, PValue, ChannelBreakdown.

## ExcelChartPatcher (static)

ClosedXML не умеет менять диапазоны графиков. После `SaveAs` патчит ZIP:

- `xl/charts/chart1.xml` — line chart по `'Данные'!$A$2:$A$n` / `$B$2:$B$n`
- `xl/drawings/drawing1.xml` — размер якоря на листе «График» (зависит от числа точек)
- `PrepareChartWorksheet` — ширина колонок / высота строк на «График»

## AnalysisExportService (Scoped)

Оркестратор Excel-экспорта (`GET /api/analysis-jobs/{id}/export`).

Поток:

1. `ExcelReportService.OpenTemplate()` + `FillSeriesAsync` (серия из JSONL)
2. `ExcelChartPatcher.PrepareChartWorksheet` на листе «График»
3. Лист **«Параметры»** — метаданные job
4. Опционально лист **«Распределение»** (dbo / em_protocol / generic)
5. `ExcelChartPatcher.Patch` — фиксация графика после сохранения

`loadDistribution`:

| Значение | Распределение |
|----------|---------------|
| `false` | `GetStoredDistribution` из `ResultJson`; для dbo/em при пустом снимке — fallback из customer DB |
| `true` | Всегда свежий запрос в customer DB за период job |

Для job с фильтром по каналу/объекту лист «Распределение» не добавляется. em_protocol: подписи EventCode через `EventCodeLabelService`.

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
