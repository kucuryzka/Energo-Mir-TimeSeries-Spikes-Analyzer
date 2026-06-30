using System;
using Core.Enums;

namespace API.DTOs;

public class DetectSpikesRequest
{
    public int ChannelId { get; set; }
    public TimeGranularity Granularity { get; set; } = TimeGranularity.Hour;
    public int? CustomMinutes { get; set; }
    public double Confidence { get; set; } = 95.0;
    public int WindowSize { get; set; } = 30;
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
}
