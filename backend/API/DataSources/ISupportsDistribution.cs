using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace API.DataSources;

public interface ISupportsDistribution
{
    Task<List<API.DTOs.DistributionItemDto>> GetDistributionAsync(string database, DateTime start, DateTime end, string categoryName);
}
