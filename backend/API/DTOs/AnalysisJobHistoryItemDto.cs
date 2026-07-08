using Core.Enums;

namespace API.DTOs;

public class AnalysisJobHistoryItemDto
{
    public string Id { get; set; } = string.Empty;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public TimeGranularity Granularity { get; set; }
    public string Status { get; set; } = string.Empty;
    public int Progress { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public int SeriesPointCount { get; set; }
    public string? ChannelId { get; set; }
}
