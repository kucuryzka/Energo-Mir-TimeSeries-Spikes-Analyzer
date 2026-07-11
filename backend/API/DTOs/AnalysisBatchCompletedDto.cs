namespace API.DTOs;

public class AnalysisBatchCompletedDto
{
    public int BatchIndex { get; set; }
    public int TotalBatches { get; set; }
    public long DurationMs { get; set; }
    public int SeriesPointCount { get; set; }

    public DateTime BatchEndExclusive { get; set; }

    public int ProgressPercent { get; set; }

    public IReadOnlyList<Core.Models.DataPoint> BatchPoints { get; set; } = Array.Empty<Core.Models.DataPoint>();
}
