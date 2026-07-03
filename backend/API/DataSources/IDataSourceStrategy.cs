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
    DataSourceKind Kind { get; }
    DatabaseProvider Provider { get; }
    string[] SupportedDistributions { get; }
    
    Task<SpikeResponse> ExecuteAnalysisAsync(DetectSpikesRequest request, Core.Interfaces.ISpikeDetectionService spikeDetectionService);
}
