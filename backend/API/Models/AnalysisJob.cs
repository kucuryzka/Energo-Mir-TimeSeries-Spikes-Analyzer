using System;
using System.ComponentModel.DataAnnotations;
using Core.Enums;

namespace API.Models;

public class AnalysisJob
{
    [Key]
    public string Id { get; set; } = Guid.NewGuid().ToString();

    public string Database { get; set; } = string.Empty;
    public string Schema { get; set; } = string.Empty;
    public string Table { get; set; } = string.Empty;
    public string TimeColumn { get; set; } = string.Empty;

    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public TimeGranularity Granularity { get; set; }
    public int? CustomMinutes { get; set; }
    public double? Confidence { get; set; }
    public int? WindowSize { get; set; }

    public AnalysisJobStatus Status { get; set; } = AnalysisJobStatus.Pending;

    [Range(0, 100)]
    public int Progress { get; set; }

    public int CompletedBatchCount { get; set; }
    public int TotalBatchCount { get; set; }
    public long? AvgBatchDurationMs { get; set; }
    public long? LastBatchDurationMs { get; set; }
    public long? PostProcessDurationMs { get; set; }

    public DateTime? ProcessedUntil { get; set; }

    public string? SourceId { get; set; }

    public string? ConnectionFingerprint { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
    public DateTime? RunningStartedAt { get; set; }
    public string? ErrorMessage { get; set; }

    public string? ResultJson { get; set; }

    public string? ResultFilePath { get; set; }

    public int SeriesPointCount { get; set; }

    public string? BackgroundJobId { get; set; }
}
