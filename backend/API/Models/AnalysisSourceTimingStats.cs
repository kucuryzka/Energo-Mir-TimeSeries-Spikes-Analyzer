using System.ComponentModel.DataAnnotations;

namespace API.Models;

public class AnalysisSourceTimingStats
{
    [Key]
    [MaxLength(512)]
    public string SourceKey { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Database { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Schema { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Table { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Granularity { get; set; } = string.Empty;

    public int SampleCount { get; set; }
    public long AvgBatchDurationMs { get; set; }
    public long AvgPostProcessDurationMs { get; set; }
    public long AvgMsPerPeriodDay { get; set; }
    public DateTime LastUpdatedAt { get; set; } = DateTime.UtcNow;
}
