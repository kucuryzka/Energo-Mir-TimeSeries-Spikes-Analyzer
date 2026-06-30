using System.Collections.Generic;
using System.Threading.Tasks;
using API.DTOs;

namespace API.DataSources;

public interface ISupportsChannels
{
    Task<List<ChannelDto>> GetChannelsAsync(string? search, int page, int pageSize);
}
