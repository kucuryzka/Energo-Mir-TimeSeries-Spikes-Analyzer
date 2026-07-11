using Core.Enums;

namespace API.DTOs.Analysis;

public class EnqueueAnalysisJobRequest
{
    public string Database { get; set; } = string.Empty;
    public string? SourceId { get; set; }
    public int? ChannelId { get; set; }

    public string? Schema { get; set; }
    public string? Table { get; set; }
    public string? TimeColumn { get; set; }

    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public TimeGranularity Granularity { get; set; } = TimeGranularity.Hour;
    public int? CustomMinutes { get; set; }
    public double Confidence { get; set; } = 95.0;
    public int WindowSize { get; set; } = 30;
}
