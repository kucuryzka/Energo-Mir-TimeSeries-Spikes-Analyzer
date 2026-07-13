using System;
using System.Collections.Generic;
using API.DTOs;

namespace API.DTOs.Analysis;

public class PointDetailsLineDto
{
    public DateTime Timestamp { get; set; }
    public int? ChannelId { get; set; }
    public string Status { get; set; } = "loading";
    public List<ChannelContributionDto> ChannelBreakdown { get; set; } = new();
    public List<MeteringInfoDto>? MeteringRows { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }
}

public class PointDetailsStatusResponse
{
    public string Status { get; set; } = "loading";
    public List<ChannelContributionDto> ChannelBreakdown { get; set; } = new();
    public List<MeteringInfoDto>? MeteringRows { get; set; }
    public string? ErrorMessage { get; set; }
}
