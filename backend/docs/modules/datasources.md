# DataSources

Стратегии доступа к предопределённым схемам телеметрии. Папка: `API/DataSources/`.

## IDataSourceStrategy

```csharp
string Id { get; }           // Hangfire source id: "Dbo", "em_protocol"
string Name { get; }
string[] SupportedDistributions { get; }

Task<SpikeResponse> ExecuteAnalysisAsync(
    DetectSpikesRequest request,
    ISpikeDetectionService spikeDetectionService,
    string connectionString,
    string provider,
    IProgress<int>? progress = null,
    ...);
```

Регистрация: два `AddScoped<IDataSourceStrategy, ...>` в `Program.cs`.

## DboDataSource

| Свойство | Значение |
|----------|----------|
| Id | `Dbo` |
| Schema | `dbo` |
| Table | `METERINGS` |
| Time column | `TIME_INSERT` |
| Channel | `IDOBJECT` → lookup `OBJECTS` |

Дополнительные методы (не в `IDataSourceStrategy`):

- `GetObjectsAsync` — пагинированный список объектов
- `GetObjectDistributionAsync` — распределение по объектам за период
- `GetPointDetailsAsync` — строки METERINGS в bucket
- `GetPointChannelBreakdownAsync` — делегирует pipeline

`DeferDistribution = true` в `AnalysisTableSpec` — distribution считается один раз в конце анализа и сохраняется в `ResultJson`.

## EmProtocolDataSource

| Свойство | Значение |
|----------|----------|
| Id | `em_protocol` |
| Table | `em_protocol.Records` |
| Time | `InsertTime` |
| Channel | `ChannelId` → `Channels` (+ EventCode) |

Дополнительные методы:

- `GetChannelsAsync` — список каналов
- `GetRecordsDistributionAsync` — распределение Records (EventCode + object name)
- `GetPointChannelBreakdownAsync` — breakdown на точке графика

## AnalysisTableSpec / ChannelLookupSpec

Декларативное описание SQL-источника для `AnalysisPipelineService`:

```csharp
public class AnalysisTableSpec
{
    public string Schema, Table, TimeColumn;
    public string? ChannelColumn, FromClause, TableAlias;
    public ChannelLookupSpec? ChannelLookup;
    public bool OmitDistribution;
    public bool DeferDistribution;
}
```

## DataSourceConnectionResolver

Общая логика получения connection string:

1. Если переданы `connectionString` + `provider` (из Hangfire worker) — использовать их.
2. Иначе — `X-Session-Token` → `IConnectionManagerService`.

Инжектируется в оба DataSource вместо дублированного `ResolveConnection`.

Контроллеры резолвят конкретный источник через `OfType<DboDataSource>()` / `OfType<EmProtocolDataSource>()`.

## Диаграмма выполнения source job

```mermaid
flowchart LR
    HF[Hangfire] --> P[AnalysisJobProcessor]
    P --> DS{sourceId}
    DS -->|Dbo| DBO[DboDataSource]
    DS -->|em_protocol| EM[EmProtocolDataSource]
    DBO --> PL[AnalysisPipelineService]
    EM --> PL
    PL --> ML[SpikeDetectionService]
    P --> RS[AnalysisResultService]
```

## Generic tables

Произвольные таблицы **не** реализуют `IDataSourceStrategy`. Они идут напрямую в `AnalysisPipelineService` через `GenericAnalysisController` / `ProcessJobAsync`.
