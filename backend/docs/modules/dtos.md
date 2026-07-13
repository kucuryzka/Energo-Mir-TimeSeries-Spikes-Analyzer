# DTOs

API contracts в `API/DTOs/`. JSON serialization: **camelCase**.

## Аутентификация

| DTO | Файл |
|-----|------|
| `AuthRequest` | AuthModels.cs |
| `AuthResponse` | AuthModels.cs |

## Запросы анализа

| DTO | Назначение |
|-----|------------|
| `DetectSpikesRequest` | Legacy enqueue body для dbo / em_protocol |
| `GenericAnalysisRequest` | Legacy enqueue body для generic analyzer |
| `EnqueueAnalysisJobRequest` | Unified `POST /api/analysis-jobs` |
| `AnalysisPipelineRequest` | Внутренний typed request pipeline (window, detection, connection, hooks, resume) |
| `AnalysisResumeState` | `ProcessedUntil` + `SeedSeries` для продолжения |

### DetectSpikesRequest

```csharp
string Database;
DateTime StartDate, EndDate;
TimeGranularity Granularity;
int? CustomMinutes;
int ChannelId;       // в JSON: channelId, null = все
double Confidence;   // default 95
int WindowSize;      // default 30
```

`sourceId` в теле запроса фронтенд передаёт; unified enqueue использует его / schema для выбора источника.

## Ответы анализа

| DTO | Содержимое |
|-----|------------|
| `SpikeResponse` | `List<AnomalyResultDto> Series`, `List<ChannelContributionDto> Distribution` |
| `AnomalyResultDto` | Timestamp, Value, IsSpike, PValue, ChannelBreakdown |
| `ChannelContributionDto` | ChannelId, ChannelName, EventCode?, Count |

## Справочники

| DTO | Источник |
|-----|----------|
| `ObjectDto` | dbo.OBJECTS |
| `ChannelDto` | em_protocol.Channels |
| `MeteringInfoDto` | dbo point-details |
| `DistributionItemDto` | Категориальное распределение |
| `TablePreviewResponse` | Count + sample rows |

## Job / Queue

| DTO | Использование |
|-----|---------------|
| `AnalysisJobQueueItemDto` | Overview, queue UI (`CanResume`) |
| `AnalysisJobsOverviewDto` | active + recent |
| `AnalysisJobStatusDto` | status endpoint (`CanResume`) |
| `AnalysisJobHistoryItemDto` | history lists |
| `AnalysisDurationEstimateDto` | ETA |
| `AnalysisBatchCompletedDto` | Callback из pipeline (BatchPoints, BatchEndExclusive) |
| `AnalysisJobMetadata` | Внутренний wrapper для ResultJson |
| `AnalysisResumeState` | Seed + курсор для resume |

## SpikeResponse (файл SpikeResponse.cs)

Содержит также `AnomalyResultDto` и `ChannelContributionDto` — основной контракт между API и React frontend.

## Соглашения

- Enums (`TimeGranularity`) сериализуются как строки (`JsonStringEnumConverter`).
- Некоторые legacy DTO (`ObjectDto`, `MeteringInfoDto`) используют block-scoped namespace — допустимо, унификация не критична.
