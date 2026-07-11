using API.DataSources;
using Core.Enums;
using Core.Interfaces;
using Core.Models;

namespace API.DTOs.Analysis;

public sealed record AnalysisPipelineRequest(
    AnalysisTableSpec Spec,
    AnalysisWindow Window,
    AnalysisDetection Detection,
    AnalysisConnection Connection,
    AnalysisPipelineHooks? Hooks = null,
    AnalysisResumeState? Resume = null
);

public sealed record AnalysisWindow(
    DateTime StartDate,
    DateTime EndDate,
    TimeGranularity Granularity,
    int? CustomMinutes = null
);

public sealed record AnalysisDetection(
    ISpikeDetectionService SpikeDetectionService,
    double Confidence,
    int WindowSize
);

public sealed record AnalysisConnection(
    string ConnectionString,
    DatabaseProviderKind Provider,
    string Database,
    int? ChannelId = null
);

public sealed record AnalysisPipelineHooks(
    IProgress<int>? Progress = null,
    Action<IReadOnlyList<DataPoint>>? OnBatchAggregated = null,
    Func<AnalysisBatchCompletedDto, Task>? OnBatchCompleted = null,
    Action<long>? OnFinalizeCompleted = null
);
