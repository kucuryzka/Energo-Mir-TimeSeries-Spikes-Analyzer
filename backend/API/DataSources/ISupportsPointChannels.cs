using API.Services;

namespace API.DataSources;

public interface ISupportsPointChannels
{
    Task<List<API.DTOs.ChannelContributionDto>> GetPointChannelBreakdownAsync(
        string database,
        DateTime timestamp,
        Core.Enums.TimeGranularity granularity,
        int? customMinutes,
        int? channelId,
        string? connectionString = null,
        string? provider = null);
}
