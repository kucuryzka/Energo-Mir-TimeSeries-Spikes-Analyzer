using Core.Enums;

namespace API.DTOs;

public class AnalysisJobQueueItemDto
{
    public string Id { get; set; } = string.Empty;

    public string Status { get; set; } = string.Empty;

    public int Progress { get; set; }

    public string Database { get; set; } = string.Empty;

    public string Schema { get; set; } = string.Empty;

    public string Table { get; set; } = string.Empty;

    public string SourceKind { get; set; } = string.Empty;

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
}
