using System.Diagnostics;
using API.Configuration;
using API.Data;
using API.DataSources;
using API.DTOs;
using API.Infrastructure;
using API.Models;
using Core.Interfaces;
using Core.Models;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace API.Services;

public class AnalysisJobProcessor
{
    private const int DisableConcurrentTimeoutSeconds = 90 * 24 * 60 * 60;

    private readonly InternalDbContext _internalDb;
    private readonly AnalysisPipelineService _pipeline;
    private readonly ISpikeDetectionService _spikeDetectionService;
    private readonly IEnumerable<IDataSourceStrategy> _dataSourceStrategies;
    private readonly AnalysisResultService _resultService;
    private readonly AnalysisTimingStatsService _timingStats;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IAnalysisJobCancellationService _cancellation;
    private readonly AnalysisJobCoordinatorService _coordinator;
    private readonly ILogger<AnalysisJobProcessor> _logger;
    private readonly int _progressSaveIntervalMs;

    public AnalysisJobProcessor(
        InternalDbContext internalDb,
        AnalysisPipelineService pipeline,
        ISpikeDetectionService spikeDetectionService,
        IEnumerable<IDataSourceStrategy> dataSourceStrategies,
        AnalysisResultService resultService,
        AnalysisTimingStatsService timingStats,
        IServiceScopeFactory scopeFactory,
        IAnalysisJobCancellationService cancellation,
        AnalysisJobCoordinatorService coordinator,
        ILogger<AnalysisJobProcessor> logger,
        IOptions<AnalysisSettings> settings)
    {
        _internalDb = internalDb;
        _pipeline = pipeline;
        _spikeDetectionService = spikeDetectionService;
        _dataSourceStrategies = dataSourceStrategies;
        _resultService = resultService;
        _timingStats = timingStats;
        _scopeFactory = scopeFactory;
        _cancellation = cancellation;
        _coordinator = coordinator;
        _logger = logger;
        _progressSaveIntervalMs = Math.Max(settings.Value.ProgressSaveIntervalSeconds, 1) * 1000;
    }

    [AutomaticRetry(Attempts = 0)]
    [DisableConcurrentExecution(DisableConcurrentTimeoutSeconds)]
    public Task ProcessJobAsync(string jobId) =>
        ProcessJobCoreAsync(jobId, sourceId: null);

    [AutomaticRetry(Attempts = 0)]
    [DisableConcurrentExecution(DisableConcurrentTimeoutSeconds)]
    public Task ProcessSourceJobAsync(string jobId, string sourceId) =>
        ProcessJobCoreAsync(jobId, sourceId);

    private async Task ProcessJobCoreAsync(string jobId, string? sourceId)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(jobId);
        if (job == null) return;

        if (job.Status is "Completed" or "Failed" or "Cancelled")
            return;

        if (!TryResolveConnection(job, out var provider, out var connectionString))
        {
            await FailJobAsync(job, new InvalidOperationException(
                "Database connection for this job is no longer available. Reconnect and enqueue the analysis again."));
            return;
        }

        sourceId ??= job.SourceId;
        var cancellationToken = _cancellation.Register(jobId);

        long finalizeMs = 0;

        try
        {
            if (_cancellation.IsCancellationRequested(jobId))
            {
                await _coordinator.MarkCancelledAsync(job);
                ClearStoredConnection(job);
                await _internalDb.SaveChangesAsync();
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
                    spec,
                    job.StartDate,
                    job.EndDate,
                    job.Granularity,
                    job.CustomMinutes,
                    channelId: null,
                    job.Confidence ?? 95,
                    job.WindowSize ?? 30,
                    _spikeDetectionService,
                    connectionString,
                    provider,
                    job.Database,
                    CreateProgressReporter(job.Id),
                    onBatchAggregated: null,
                    onBatchCompleted,
                    ms => finalizeMs = ms,
                    resume,
                    cancellationToken);
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
                    CreateProgressReporter(job.Id),
                    onBatchAggregated: null,
                    onBatchCompleted,
                    ms => finalizeMs = ms,
                    resume,
                    cancellationToken);
            }

            job.PostProcessDurationMs = finalizeMs;
            await CompleteJobAsync(job, response);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            _logger.LogInformation("Analysis job {JobId} cancelled by user", jobId);
            await _coordinator.MarkCancelledAsync(job);
            ClearStoredConnection(job);
            await _internalDb.SaveChangesAsync();
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

    private static bool TryResolveConnection(AnalysisJob job, out string provider, out string connectionString)
    {
        if (!string.IsNullOrWhiteSpace(job.ConnectionString))
        {
            provider = DatabaseProvider.Normalize(job.ConnectionProvider ?? "mssql");
            connectionString = job.ConnectionString;
            return true;
        }

        provider = string.Empty;
        connectionString = string.Empty;
        return false;
    }

    private async Task<AnalysisResumeState?> PrepareResumeStateAsync(AnalysisJob job)
    {
        if (!job.ProcessedUntil.HasValue || job.ProcessedUntil.Value <= job.StartDate)
        {
            _resultService.DeletePartialFile(job.Id);
            return null;
        }

        var partial = await _resultService.TryLoadPartialAsync(job.Id);
        if (partial == null || partial.Series.Count == 0)
        {
            _logger.LogWarning(
                "Job {JobId} has ProcessedUntil={ProcessedUntil} but no partial series; restarting from StartDate",
                job.Id,
                job.ProcessedUntil);
            job.ProcessedUntil = null;
            job.CompletedBatchCount = 0;
            job.Progress = 0;
            await _internalDb.SaveChangesAsync();
            return null;
        }

        var seed = partial.Series
            .Select(p => new DataPoint { Timestamp = p.Timestamp, Value = p.Value })
            .ToList();

        _logger.LogInformation(
            "Resuming job {JobId} from {ProcessedUntil} with {PointCount} seeded points",
            job.Id,
            job.ProcessedUntil,
            seed.Count);

        return new AnalysisResumeState
        {
            ProcessedUntil = job.ProcessedUntil,
            SeedSeries = seed
        };
    }

    private async Task SetRunningAsync(AnalysisJob job, bool isResume)
    {
        job.Status = "Running";
        job.ErrorMessage = null;
        job.CompletedAt = null;

        if (!isResume)
        {
            job.Progress = 0;
            job.CompletedBatchCount = 0;
            job.TotalBatchCount = 0;
            job.AvgBatchDurationMs = null;
            job.LastBatchDurationMs = null;
            job.PostProcessDurationMs = null;
            job.ProcessedUntil = null;
        }

        await _internalDb.SaveChangesAsync();
    }

    private Func<AnalysisBatchCompletedDto, Task> CreateCheckpointHandler(AnalysisJob job)
    {
        long batchDurationSum = (job.AvgBatchDurationMs ?? 0) * Math.Max(job.CompletedBatchCount, 0);

        return async info =>
        {
            batchDurationSum += info.DurationMs;
            job.CompletedBatchCount = info.BatchIndex + 1;
            job.TotalBatchCount = info.TotalBatches;
            job.LastBatchDurationMs = info.DurationMs;
            job.AvgBatchDurationMs = batchDurationSum / Math.Max(job.CompletedBatchCount, 1);
            job.ProcessedUntil = info.BatchEndExclusive;
            job.SeriesPointCount = info.SeriesPointCount;

            // Persist partial series first, then advance the resume cursor.
            await _resultService.SavePartialSeriesAsync(job.Id, info.SeriesSnapshot);

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<InternalDbContext>();
            await db.AnalysisJobs
                .Where(j => j.Id == job.Id && j.Status == "Running")
                .ExecuteUpdateAsync(s => s
                    .SetProperty(j => j.CompletedBatchCount, job.CompletedBatchCount)
                    .SetProperty(j => j.TotalBatchCount, job.TotalBatchCount)
                    .SetProperty(j => j.LastBatchDurationMs, job.LastBatchDurationMs)
                    .SetProperty(j => j.AvgBatchDurationMs, job.AvgBatchDurationMs)
                    .SetProperty(j => j.ProcessedUntil, job.ProcessedUntil)
                    .SetProperty(j => j.SeriesPointCount, job.SeriesPointCount));
        };
    }

    private IProgress<int> CreateProgressReporter(string jobId)
    {
        var lastSavedProgress = -1;
        var lastSaveTicks = 0L;

        return new Progress<int>(percent =>
        {
            var clamped = Math.Clamp(percent, 0, 99);
            if (clamped <= lastSavedProgress)
                return;

            var now = Environment.TickCount64;
            if (now - lastSaveTicks < _progressSaveIntervalMs && clamped < 99)
                return;

            lastSavedProgress = clamped;
            lastSaveTicks = now;

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<InternalDbContext>();
                db.AnalysisJobs
                    .Where(j => j.Id == jobId && j.Status == "Running")
                    .ExecuteUpdate(s => s.SetProperty(j => j.Progress, clamped));
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to persist progress for job {JobId}", jobId);
            }
        });
    }

    private async Task CompleteJobAsync(AnalysisJob job, SpikeResponse response)
    {
        var saveSw = Stopwatch.StartNew();
        await _resultService.SaveAsync(job, response);
        saveSw.Stop();

        var saveMs = saveSw.ElapsedMilliseconds;
        job.PostProcessDurationMs = (job.PostProcessDurationMs ?? 0) + saveMs;
        _resultService.DeletePartialFile(job.Id);
        job.Status = "Completed";
        job.Progress = 100;
        job.CompletedAt = DateTime.UtcNow;
        ClearStoredConnection(job);
        await _internalDb.SaveChangesAsync();
        await _timingStats.RecordCompletedJobAsync(job, saveMs);
    }

    private async Task FailJobAsync(AnalysisJob job, Exception ex)
    {
        var hasCheckpoint = job.ProcessedUntil.HasValue && _resultService.HasPartialResult(job.Id);
        if (!hasCheckpoint)
        {
            _resultService.DeleteResultFiles(job);
            job.ResultFilePath = null;
            job.SeriesPointCount = 0;
            job.ProcessedUntil = null;
            ClearStoredConnection(job);
        }

        job.Status = "Failed";
        job.ErrorMessage = Truncate(ex.Message, 2000);
        job.CompletedAt = DateTime.UtcNow;
        await _internalDb.SaveChangesAsync();
    }

    private static void ClearStoredConnection(AnalysisJob job)
    {
        job.ConnectionString = null;
        job.ConnectionProvider = null;
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];
}
