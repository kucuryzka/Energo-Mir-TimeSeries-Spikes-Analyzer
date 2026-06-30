using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using API.DTOs;

namespace API.DataSources;

public interface ISupportsDistribution
{
    Task<List<DistributionItemDto>> GetDistributionAsync(DateTime start, DateTime end, string categoryName);
}
