namespace API.DTOs.Analysis;

public class AnalysisJobMetadata
{
    public List<ChannelContributionDto> Distribution { get; set; } = new();
    public Dictionary<string, List<DistributionItemDto>> CategoricalDistributions { get; set; } = new();
}
