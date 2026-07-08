namespace API.DTOs;

public class AnalysisBatchCompletedDto
{
    public int BatchIndex { get; set; }
    public int TotalBatches { get; set; }
    public long DurationMs { get; set; }
    public int SeriesPointCount { get; set; }
}
