using System.Diagnostics;
using API.Contracts;
using API.Data;
using API.DataSources;
using API.DTOs;
using API.Models;
using Core.Interfaces;
using Core.Models;
using Hangfire;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Analysis;

public class AnalysisJobProcessor
{
    private const int DisableConcurrentTimeoutSeconds = 90 * 24 * 60 * 60;

    private readonly InternalDbContext _internalDb;
    private readonly AnalysisPipelineService _pipeline;
    private readonly ISpikeDetectionService _spikeDetectionService;
    private readonly IEnumerable<IDataSourceStrategy> _dataSourceStrategies;
    private readonly AnalysisResultService _resultService;
    private readonly AnalysisTimingStatsService _timingStats;
    private readonly IConnectionManagerService _connectionManager;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IAnalysisJobCancellationService _cancellation;
    private readonly AnalysisJobCoordinatorService _coordinator;
    private readonly SupplementJobService _supplementJobs;
    private readonly ILogger<AnalysisJobProcessor> _logger;

    public AnalysisJobProcessor(
        InternalDbContext internalDb,
        AnalysisPipelineService pipeline,
        ISpikeDetectionService spikeDetectionService,
        IEnumerable<IDataSourceStrategy> dataSourceStrategies,
        AnalysisResultService resultService,
        AnalysisTimingStatsService timingStats,
        IConnectionManagerService connectionManager,
        IServiceScopeFactory scopeFactory,
        IAnalysisJobCancellationService cancellation,
        AnalysisJobCoordinatorService coordinator,
        SupplementJobService supplementJobs,
        ILogger<AnalysisJobProcessor> logger
    )
    {
        _internalDb = internalDb;
        _pipeline = pipeline;
        _spikeDetectionService = spikeDetectionService;
        _dataSourceStrategies = dataSourceStrategies;
        _resultService = resultService;
        _timingStats = timingStats;
        _connectionManager = connectionManager;
        _scopeFactory = scopeFactory;
        _cancellation = cancellation;
        _coordinator = coordinator;
        _supplementJobs = supplementJobs;
        _logger = logger;
    }

    [AutomaticRetry(Attempts = 0)]
    [DisableConcurrentExecution(DisableConcurrentTimeoutSeconds)]
    public Task ProcessJobAsync(string jobId, string sessionToken) =>
        ProcessJobCoreAsync(jobId, sessionToken, sourceId: null);

    [AutomaticRetry(Attempts = 0)]
    [DisableConcurrentExecution(DisableConcurrentTimeoutSeconds)]
    public Task ProcessSourceJobAsync(string jobId, string sourceId, string sessionToken) =>
        ProcessJobCoreAsync(jobId, sessionToken, sourceId);

    private async Task ProcessJobCoreAsync(string jobId, string sessionToken, string? sourceId)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(jobId);
        if (job == null) return;

        if (job.Status is AnalysisJobStatus.Completed or AnalysisJobStatus.Failed or AnalysisJobStatus.Cancelled)
            return;

        var connectionInfo = _connectionManager.GetConnectionInfo(sessionToken);
        if (connectionInfo == null)
        {
            await FailJobAsync(job, new InvalidOperationException(
                "Сессия БД недоступна. Подключитесь к базе и продолжите анализ (resume), если есть сохранённый прогресс."
            )
            );
            return;
        }

        if (!ConnectionFingerprint.Matches(job.ConnectionFingerprint, connectionInfo.Provider, connectionInfo.ConnectionString))
        {
            await FailJobAsync(job, new InvalidOperationException(
                "Текущее подключение не совпадает с сервером, на котором запускался анализ. Подключитесь к тому же хосту и пользователю, затем resume."
            )
            );
            return;
        }

        var provider = connectionInfo.Provider;
        var connectionString = connectionInfo.ConnectionString;
        sourceId ??= job.SourceId;
        var cancellationToken = _cancellation.Register(jobId);

        long finalizeMs = 0;

        try
        {
            if (_cancellation.IsCancellationRequested(jobId))
            {
                await _coordinator.MarkCancelledAsync(job);
                return;
            }

            var resume = await PrepareResumeStateAsync(job);
            await SetRunningAsync(job, isResume: resume != null);

            var onBatchCompleted = CreateCheckpointHandler(job);

            SpikeResponse response;
            if (string.IsNullOrEmpty(sourceId))
            {
                var spec = new AnalysisTableSpec
                {
                    Schema = job.Schema,
                    Table = job.Table,
                    TimeColumn = job.TimeColumn
                };

                response = await _pipeline.ExecuteAsync(
                    new AnalysisPipelineRequest(
                        Spec: spec,
                        Window: new AnalysisWindow(job.StartDate, job.EndDate, job.Granularity, job.CustomMinutes),
                        Detection: new AnalysisDetection(_spikeDetectionService, job.Confidence ?? 95, job.WindowSize ?? 30),
                        Connection: new AnalysisConnection(connectionString, provider, job.Database),
                        Hooks: new AnalysisPipelineHooks(
                            OnBatchCompleted: onBatchCompleted,
                            OnFinalizeCompleted: ms => finalizeMs = ms
                        ),
                        Resume: resume
                    ),
                    cancellationToken
                );
            }
            else
            {
                var dataSource = _dataSourceStrategies.FirstOrDefault(d => d.Id.Equals(sourceId, StringComparison.OrdinalIgnoreCase))
                    ?? throw new InvalidOperationException($"DataSource {sourceId} not found");

                int? channelId = null;
                if (!string.IsNullOrEmpty(job.Table) && int.TryParse(job.Table, out var cid))
                    channelId = cid;

                var request = new DetectSpikesRequest
                {
                    Database = job.Database,
                    SourceId = sourceId,
                    ChannelId = channelId,
                    Granularity = job.Granularity,
                    CustomMinutes = job.CustomMinutes,
                    Confidence = job.Confidence ?? 95.0,
                    WindowSize = job.WindowSize ?? 30,
                    StartDate = job.StartDate,
                    EndDate = job.EndDate
                };

                response = await dataSource.ExecuteAnalysisAsync(
                    request,
                    _spikeDetectionService,
                    connectionString,
                    provider,
                    progress: null,
                    onBatchAggregated: null,
                    onBatchCompleted,
                    ms => finalizeMs = ms,
                    resume,
                    cancellationToken
                );
            }

            job.PostProcessDurationMs = finalizeMs;

            await CompleteJobAsync(job, response);

            if (string.Equals(sourceId, "em_protocol", StringComparison.OrdinalIgnoreCase))
            {
                await _supplementJobs.EnqueueDistributionAfterAnalysisAsync(job.Id, sessionToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            _logger.LogInformation("Analysis job {JobId} cancelled by user", jobId);
            await _coordinator.MarkCancelledAsync(job);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Analysis job {JobId} failed", jobId);
            await FailJobAsync(job, ex);
        }
        finally
        {
            _cancellation.Unregister(jobId);
        }
    }

    private async Task<AnalysisResumeState?> PrepareResumeStateAsync(AnalysisJob job)
    {
        if (!job.ProcessedUntil.HasValue || job.ProcessedUntil.Value <= job.StartDate)
        {
            _resultService.DeletePartialFile(job.Id);
            return null;
        }

        var aligned = await _resultService.LoadPartialAlignedAsync(job.Id, job.ProcessedUntil.Value);
        if (aligned.Count == 0)
        {
            _logger.LogWarning(
                "Job {JobId} has ProcessedUntil={ProcessedUntil} but no partial series; resuming from checkpoint without seed",
                job.Id,
                job.ProcessedUntil
            );

            return new AnalysisResumeState
            {
                ProcessedUntil = job.ProcessedUntil,
                SeedSeries = Array.Empty<DataPoint>()
            };
        }

        var seed = aligned
            .Select(p => new DataPoint { Timestamp = p.Timestamp, Value = p.Value })
            .ToList();

        _logger.LogInformation(
            "Resuming job {JobId} from {ProcessedUntil} with {PointCount} seeded points",
            job.Id,
            job.ProcessedUntil,
            seed.Count
        );

        return new AnalysisResumeState
        {
            ProcessedUntil = job.ProcessedUntil,
            SeedSeries = seed
        };
    }

    private async Task SetRunningAsync(AnalysisJob job, bool isResume)
    {
        job.Status = AnalysisJobStatus.Running;
        job.ErrorMessage = null;
        job.CompletedAt = null;
        job.RunningStartedAt = DateTime.UtcNow;

        if (!isResume)
        {
            job.Progress = 0;
            job.CompletedBatchCount = 0;
            job.TotalBatchCount = 0;
            job.AvgBatchDurationMs = null;
            job.LastBatchDurationMs = null;
            job.PostProcessDurationMs = null;
            job.ProcessedUntil = null;
            _resultService.DeletePartialFile(job.Id);
        }

        await _internalDb.SaveChangesAsync();
    }

    private Func<AnalysisBatchCompletedDto, Task> CreateCheckpointHandler(AnalysisJob job)
    {
        long batchDurationSum = (job.AvgBatchDurationMs ?? 0) * Math.Max(job.CompletedBatchCount, 0);

        return async info =>
        {
            await _resultService.AppendPartialSeriesAsync(job.Id, info.BatchPoints);

            batchDurationSum += info.DurationMs;
            job.CompletedBatchCount = info.BatchIndex + 1;
            job.TotalBatchCount = info.TotalBatches;
            job.LastBatchDurationMs = info.DurationMs;
            job.AvgBatchDurationMs = batchDurationSum / Math.Max(job.CompletedBatchCount, 1);
            job.ProcessedUntil = info.BatchEndExclusive;
            job.SeriesPointCount = info.SeriesPointCount;
            job.Progress = Math.Clamp(info.ProgressPercent, 0, 99);
            job.RunningStartedAt = DateTime.UtcNow;

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<InternalDbContext>();
            await db.AnalysisJobs
                .Where(j => j.Id == job.Id && j.Status == AnalysisJobStatus.Running)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(j => j.CompletedBatchCount, job.CompletedBatchCount)
                    .SetProperty(j => j.TotalBatchCount, job.TotalBatchCount)
                    .SetProperty(j => j.LastBatchDurationMs, job.LastBatchDurationMs)
                    .SetProperty(j => j.AvgBatchDurationMs, job.AvgBatchDurationMs)
                    .SetProperty(j => j.ProcessedUntil, job.ProcessedUntil)
                    .SetProperty(j => j.SeriesPointCount, job.SeriesPointCount)
                    .SetProperty(j => j.Progress, job.Progress)
                    .SetProperty(j => j.RunningStartedAt, job.RunningStartedAt)
                );
        };
    }

    private async Task CompleteJobAsync(AnalysisJob job, SpikeResponse response)
    {
        if (!await JobStillExistsAsync(job.Id))
            return;

        var saveSw = Stopwatch.StartNew();
        await _resultService.SaveAsync(job, response);
        saveSw.Stop();

        if (!await JobStillExistsAsync(job.Id))
        {
            _resultService.DeleteResultFiles(job);
            return;
        }

        var saveMs = saveSw.ElapsedMilliseconds;
        job.PostProcessDurationMs = (job.PostProcessDurationMs ?? 0) + saveMs;
        _resultService.DeletePartialFile(job.Id);
        job.Status = AnalysisJobStatus.Completed;
        job.Progress = 100;
        job.CompletedAt = DateTime.UtcNow;
        job.RunningStartedAt = null;
        await _internalDb.SaveChangesAsync();
        await _timingStats.RecordCompletedJobAsync(job);
    }

    private async Task FailJobAsync(AnalysisJob job, Exception ex)
    {
        if (!await JobStillExistsAsync(job.Id))
            return;

        var hasCheckpoint = job.ProcessedUntil.HasValue && _resultService.HasPartialResult(job.Id);
        if (!hasCheckpoint)
        {
            _resultService.DeleteResultFiles(job);
            job.ResultFilePath = null;
            job.SeriesPointCount = 0;
            job.ProcessedUntil = null;
        }

        job.Status = AnalysisJobStatus.Failed;
        job.ErrorMessage = Truncate(ex.Message, 2000);
        job.CompletedAt = DateTime.UtcNow;
        job.RunningStartedAt = null;
        await _internalDb.SaveChangesAsync();
    }

    private Task<bool> JobStillExistsAsync(string jobId) =>
        _internalDb.AnalysisJobs.AsNoTracking().AnyAsync(j => j.Id == jobId);

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];
}
