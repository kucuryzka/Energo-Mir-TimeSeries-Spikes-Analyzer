using API.Models;

namespace API.DTOs.Analysis;

public class AnalysisJobStatusDto
{
    public string Id { get; set; } = string.Empty;
    public AnalysisJobStatus Status { get; set; }
    public int Progress { get; set; }
    public string? ErrorMessage { get; set; }
    public bool HasResult { get; set; }
    public bool HasPartialResult { get; set; }
    public bool CanResume { get; set; }
    public int SeriesPointCount { get; set; }
}
