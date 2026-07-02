using System.Collections.Generic;
using System.Threading.Tasks;
using API.DTOs;

namespace API.DataSources;

public interface ISupportsChannels
{
    Task<List<ChannelDto>> GetChannelsAsync(string database, string? search, int page = 1, int pageSize = 50);
}
