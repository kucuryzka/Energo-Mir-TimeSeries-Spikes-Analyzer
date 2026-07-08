namespace API.DTOs;

public class AnalysisJobsOverviewDto
{
    public List<AnalysisJobQueueItemDto> Active { get; set; } = new();

    public List<AnalysisJobQueueItemDto> Recent { get; set; } = new();
}
