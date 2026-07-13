using API.Models;
using Core.Enums;

namespace API.DTOs.Analysis;

public class AnalysisJobQueueItemDto
{
    public string Id { get; set; } = string.Empty;

    public AnalysisJobStatus Status { get; set; }

    public int Progress { get; set; }

    public string Database { get; set; } = string.Empty;

    public string? ConnectionHint { get; set; }

    public string Schema { get; set; } = string.Empty;

    public string Table { get; set; } = string.Empty;

    public AnalysisSourceKind SourceKind { get; set; }

    public DateTime StartDate { get; set; }

    public DateTime EndDate { get; set; }

    public TimeGranularity Granularity { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? CompletedAt { get; set; }

    public string TimeColumn { get; set; } = string.Empty;

    public int? CustomMinutes { get; set; }

    public string? ChannelId { get; set; }

    public int? QueuePosition { get; set; }

    public bool HasPartialResult { get; set; }

    public bool HasResult { get; set; }

    public bool CanResume { get; set; }

    public int CompletedBatchCount { get; set; }

    public int TotalBatchCount { get; set; }

    public long? AvgBatchDurationMs { get; set; }

    public long? LastBatchDurationMs { get; set; }

    public long? PostProcessDurationMs { get; set; }

    public long? ActiveDurationMs { get; set; }

    public DateTime? RunningStartedAt { get; set; }

    public AnalysisQueueJobKind QueueJobKind { get; set; } = AnalysisQueueJobKind.Analysis;

    public string? ParentJobId { get; set; }

    public string? SupplementLabel { get; set; }

    public bool CanRetry { get; set; }

    public string? ErrorMessage { get; set; }
}
