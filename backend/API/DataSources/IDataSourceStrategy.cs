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
    string[] SupportedDistributions { get; }
    Task<SpikeResponse> ExecuteAnalysisAsync(
        DetectSpikesRequest request,
        Core.Interfaces.ISpikeDetectionService spikeDetectionService,
        string connectionString,
        string provider,
        IProgress<int>? progress = null,
        Action<IReadOnlyList<DataPoint>>? onBatchAggregated = null,
        Action<AnalysisBatchCompletedDto>? onBatchCompleted = null,
        Action<long>? onFinalizeCompleted = null,
        CancellationToken cancellationToken = default);
}
