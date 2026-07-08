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
| `DetectSpikesRequest` | Enqueue для dbo / em_protocol |
| `GenericAnalysisRequest` | Enqueue / sync analyze для generic |

### DetectSpikesRequest

```csharp
string Database;
DateTime StartDate, EndDate;
TimeGranularity Granularity;
int? CustomMinutes, WindowSize;
double? Confidence;
int? ChannelId;  // null = все каналы/объекты
```

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
| `AnalysisJobQueueItemDto` | Overview, queue UI |
| `AnalysisJobsOverviewDto` | active + recent |
| `AnalysisJobStatusDto` | status endpoint (новый тип) |
| `AnalysisJobHistoryItemDto` | history lists |
| `AnalysisDurationEstimateDto` | ETA |
| `AnalysisBatchCompletedDto` | Callback из pipeline |
| `AnalysisJobMetadata` | Внутренний wrapper для ResultJson |

## SpikeResponse (файл SpikeResponse.cs)

Содержит также `AnomalyResultDto` и `ChannelContributionDto` — основной контракт между API и React frontend.

## Соглашения

- Enums (`TimeGranularity`) сериализуются как строки (`JsonStringEnumConverter`).
- Некоторые legacy DTO (`ObjectDto`, `MeteringInfoDto`) используют block-scoped namespace — допустимо, унификация не критична.
