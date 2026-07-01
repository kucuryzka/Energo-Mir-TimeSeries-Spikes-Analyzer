using System;
using System.Collections.Generic;

namespace API.DTOs;

public class SpikeResponse
{
    public List<AnomalyResultDto> Series { get; set; } = new();
}

public class AnomalyResultDto
{
    public DateTime Timestamp { get; set; }
    public int Value { get; set; }
    public bool IsSpike { get; set; }
    public double PValue { get; set; }
    public List<ChannelContributionDto> ChannelBreakdown { get; set; } = new();
}

public class ChannelContributionDto
{
    public int ChannelId { get; set; }
    public string ChannelName { get; set; } = string.Empty;
    public string? EventCode { get; set; }
    public int Count { get; set; }
}
