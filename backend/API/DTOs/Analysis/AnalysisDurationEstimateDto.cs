namespace API.DTOs.Analysis;

public class AnalysisDurationEstimateDto
{
    public long EstimatedDurationMs { get; set; }
    public int EstimatedBatchCount { get; set; }
    public long? AvgBatchDurationMs { get; set; }
    public long? AvgPostProcessDurationMs { get; set; }
    public EstimateConfidence Confidence { get; set; } = EstimateConfidence.none;
    public int SampleCount { get; set; }
    public int BatchIntervalDays { get; set; }
}
