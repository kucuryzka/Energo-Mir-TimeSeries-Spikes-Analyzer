namespace API.DTOs.Analysis;

public class AnalysisJobsOverviewDto
{
    public List<AnalysisJobQueueItemDto> Active { get; set; } = new();

    public List<AnalysisJobQueueItemDto> Recent { get; set; } = new();
}
