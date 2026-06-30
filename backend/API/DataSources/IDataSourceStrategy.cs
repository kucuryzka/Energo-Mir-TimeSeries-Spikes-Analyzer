using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using API.DTOs;
using Core.Enums;
using Core.Models;

namespace API.DataSources;

public interface IDataSourceStrategy
{
    string Id { get; }
    string Name { get; }
    
    Task<List<ChannelDto>> GetChannelsAsync(string? search, int page, int pageSize);
    Task<List<AggregatedResult>> GetAggregatedDataAsync(DateTime start, DateTime end, int? channelId, TimeGranularity granularity, int? customMinutes);
    Task<Dictionary<int, string>> GetChannelNamesAsync(List<int> channelIds);
}
