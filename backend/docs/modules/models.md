# Models

Доменные / persistence модели API в `API/Models/`.

## AnalysisJob

EF entity для SQLite. См. [data.md](data.md) для полного описания полей.

Создаётся в coordinator при enqueue:

| Источник | Schema | Table | TimeColumn |
|----------|--------|-------|------------|
| Dbo | dbo | ChannelId или "All" | "" |
| Em | em_protocol | ChannelId или "All" | "" |
| Generic | request.Schema | request.Table | request.TimeColumn |

Checkpoint: `ProcessedUntil`, `ConnectionFingerprint`, batch timing fields — см. [data.md](data.md).

## AnalysisSourceTimingStats

Ключ: `SourceKey` (composite: database+schema+table+granularity).

Поля: `AvgBatchDurationMs`, `AvgPostProcessDurationMs`, `SampleCount`, `LastUpdatedAt`.

Обновляется в `AnalysisJobProcessor` после успешного job.

## DatabaseSessionInfo

In-memory сессия подключения к customer DB:

```csharp
public class DatabaseSessionInfo
{
    public string Provider { get; set; }   // "mssql" | "pgsql"
    public string ConnectionString { get; set; }
}
```

Ранее назывался `ConnectionInfo` — переименован из-за конфликта с `Microsoft.AspNetCore.Http.ConnectionInfo`.

Хранится в `ConnectionManagerService` по токену сессии.

## Связь Models ↔ DTOs

| Model | DTO mapping |
|-------|-------------|
| `AnalysisJob` | → `AnalysisJobQueueItemDto`, `AnalysisJobStatusDto`, `AnalysisJobHistoryItemDto` |
| — | `AnomalyResult` (Core) → `AnomalyResultDto` в pipeline |

Persistence models **не** экспонируются напрямую в API — только через DTO или анонимные проекции.
