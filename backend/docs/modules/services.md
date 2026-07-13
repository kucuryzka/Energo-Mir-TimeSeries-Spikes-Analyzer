# Services

Прикладная логика в `API/Services/`.

## AnalysisPipelineService

**Центральный оркестратор анализа.**

Ответственность:

1. Разбиение периода на батчи (`BatchIntervalDays` из settings).
2. SQL-агрегация в `DataPoint` (Dapper).
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

1. Load job из SQLite; skip если уже Completed / Failed / Cancelled
2. Resolve connection из session token + проверка **ConnectionFingerprint**
3. `PrepareResumeStateAsync` — seed из partial + `ProcessedUntil` (или resume без seed)
4. `SetRunningAsync(isResume)` — при resume прогресс **не** сбрасывается
5. Execute через strategy или pipeline с `AnalysisResumeState`
6. Checkpoint после батча: append partial + update `ProcessedUntil` / batch metrics
7. `AnalysisResultService.SaveAsync` → JSONL; status → Completed / Failed / Cancelled

## AnalysisJobResumeRules

```csharp
CanResume =
  status is Failed | Pending | Cancelled
  && ProcessedUntil.HasValue
  && (hasPartialResult || CompletedBatchCount > 0)
```

## AnalysisResultService (Singleton)

| Метод | Описание |
|-------|----------|
| `HasResult` | Completed + (file или legacy inline JSON) |
| `CanExport` | Completed/Cancelled + jsonl file |
| `ResolveResultFilePath` | `ResultFilePath` или fallback `{jobId}.jsonl` |
| `SaveAsync` / `LoadAsync` | JSONL + metadata в `ResultJson` |
| `GetStoredDistribution` | Distribution из `ResultJson` |
| `AppendPartialSeriesAsync` | Checkpoint: дописать точки батча в `{jobId}.partial.jsonl` (пустой батч — no-op) |
| `LoadPartialAlignedAsync` | Resume: загрузка + отсечение хвоста ≥ `ProcessedUntil` |
| `EnumerateSeriesAsync` | Streaming чтения JSONL (не используется текущим export) |

Файлы: `{ContentRoot}/results/` (настраивается `AnalysisSettings.ResultsDirectory`).

## AnalysisJobQueryService

Общая логика status / result / history / delete для job API (и legacy aliases).

| Метод | HTTP-аналог |
|-------|-------------|
| `FindJobAsync` | — |
| `BuildStatus` | GET status (`CanResume`) |
| `TryLoadPartialAsync` | GET partial-result |
| `SerializeResultAsync` | GET result |
| `GetChannelScopedHistoryAsync` | history dbo/em |
| `GetTableScopedHistoryAsync` | history generic |
| `DeleteJobAsync` | DELETE job |

## AnalysisJobCoordinatorService

- `EnqueueAsync` / `EnqueueGenericAnalysisAsync` — создание job + fingerprint + Hangfire
- `GetOverviewAsync` — active + recent (`CanResume` на каждом item)
- `TryCancelAsync` / `MarkCancelledAsync` — cancel token + Hangfire detach
- `TryResumeAsync` — requeue Failed/Cancelled/Pending с checkpoint
- `ResolveSourceKind` — schema → `dbo` | `em_protocol` | `generic`

## AnalysisTimingStatsService

Хранит скользящие средние длительности батчей/post-process в `AnalysisSourceTimingStats`. `EstimateAsync` → `AnalysisDurationEstimateDto`.

## ExcelReportService (Scoped)

Загрузка шаблона `API/Resources/ReportTemplate.xlsx` и заполнение листа **«Данные»**.

| Метод | Описание |
|-------|----------|
| `GenerateReport(SpikeResponse)` | Открывает шаблон, заполняет «Данные», сохраняет в `byte[]` |

Колонки: Timestamp (`dd.MM.yyyy HH:mm:ss`), Value, IsSpike, PValue, ChannelBreakdown (строка `имя: count; ...`).

При наличии Excel Table в шаблоне — ресайз таблицы под число строк.

Лист **«График»** не обновляется — график в шаблоне может отображаться некорректно на больших сериях.

## ExcelChartPatcher (static) — не используется

Класс остаётся в репозитории для возможного восстановления расширенного экспорта. Патчит ZIP после ClosedXML:

- `xl/charts/chart1.xml` — диапазоны line chart
- `xl/drawings/drawing1.xml` — размер якоря на «График»
- `PrepareChartWorksheet` — ширина колонок / высота строк

**Текущий export не вызывает этот класс.**

## AnalysisExportService (Scoped)

Оркестратор Excel-экспорта (`GET /api/analysis-jobs/{id}/export`).

**Текущий поток (упрощённый):**

1. `CanExport(job)` — проверка статуса и наличия JSONL
2. `AnalysisResultService.LoadAsync(job)` — полная загрузка серии в память
3. `ExcelReportService.GenerateReport(response)` — заполнение «Данные»
4. Возврат `(MemoryStream, fileName)`

Зависимости: только `AnalysisResultService` + `ExcelReportService`.

| Параметр | Поведение |
|----------|-----------|
| `loadDistribution` | **Игнорируется** (`_ = loadDistribution`) |

Имя файла: `spike-analysis-{DateTime.Now:yyyy-MM-dd_HHmm}.xlsx`.

### Ранее (до revert `1109952`)

Расширенный поток включал: стриминг `FillSeriesAsync`, chart patch, листы «Параметры» и «Распределение», логику `loadDistribution` с перезагрузкой из customer DB.

## AnalysisRequestValidator

Проверяет диапазон дат, `MaxAnalysisRangeDays`, `MaxSeriesPoints`, window size. **Примечание:** требует `customMinutes > 0` даже для не-Custom granularity — клиент должен передавать значение.

## TablePreviewService

`LoadAsync` — approximate count + sample rows (limit ≤ 50, timeout из `PreviewCommandTimeoutSeconds`).

## ConnectionManagerService

In-memory `ConcurrentDictionary<string, DatabaseSessionInfo>`. **Не персистентен** — рестарт API сбрасывает сессии.

## StaleAnalysisJobCleanup

`IHostedService` при старте: job в Running/Pending без живого Hangfire job → Failed.

## Прочие

| Service | Роль |
|---------|------|
| `AnalysisJobCancellationService` | Registry `CancellationTokenSource` per job id |
| `EventCodeLabelService` | EventCode → label из `event_codes.csv` (зарегистрирован, не используется в текущем export) |
