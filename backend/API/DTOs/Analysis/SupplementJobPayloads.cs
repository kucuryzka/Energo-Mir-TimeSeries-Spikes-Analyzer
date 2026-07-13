namespace API.DTOs.Analysis;

public class PointDetailsSupplementPayload
{
    public string TimestampIso { get; set; } = string.Empty;
    public int? ChannelId { get; set; }
}

public class DistributionSupplementPayload
{
    public List<string> Categories { get; set; } = new();
}
