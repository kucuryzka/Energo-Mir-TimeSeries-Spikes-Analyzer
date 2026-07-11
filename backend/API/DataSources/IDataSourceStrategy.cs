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
        Func<AnalysisBatchCompletedDto, Task>? onBatchCompleted = null,
        Action<long>? onFinalizeCompleted = null,
        AnalysisResumeState? resume = null,
        CancellationToken cancellationToken = default);
}
