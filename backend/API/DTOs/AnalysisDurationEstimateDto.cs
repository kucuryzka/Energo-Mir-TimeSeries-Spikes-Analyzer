namespace API.DTOs;

public class AnalysisDurationEstimateDto
{
    public long EstimatedDurationMs { get; set; }
    public int EstimatedBatchCount { get; set; }
    public long? AvgBatchDurationMs { get; set; }
    public long? AvgPostProcessDurationMs { get; set; }
    public string Confidence { get; set; } = "none";
    public int SampleCount { get; set; }
    public int BatchIntervalDays { get; set; }
}
