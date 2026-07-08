using System;
using System.Linq;
using System.Threading.Tasks;
using API.Configuration;
using API.Data;
using API.DataSources;
using API.Models;
using Core.Interfaces;
using Core.Models;
using Hangfire;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace API.Services;

public class AnalysisJobProcessor
{
    private readonly InternalDbContext _internalDb;
    private readonly AnalysisPipelineService _pipeline;
    private readonly ISpikeDetectionService _spikeDetectionService;
    private readonly IEnumerable<IDataSourceStrategy> _dataSourceStrategies;
    private readonly AnalysisResultService _resultService;
    private readonly IConnectionManagerService _connectionManager;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AnalysisJobProcessor> _logger;
    private readonly int _progressSaveIntervalMs;

    public AnalysisJobProcessor(
        InternalDbContext internalDb,
        AnalysisPipelineService pipeline,
        ISpikeDetectionService spikeDetectionService,
        IEnumerable<IDataSourceStrategy> dataSourceStrategies,
        AnalysisResultService resultService,
        IConnectionManagerService connectionManager,
        IServiceScopeFactory scopeFactory,
        ILogger<AnalysisJobProcessor> logger,
        IOptions<AnalysisSettings> settings)
    {
        _internalDb = internalDb;
        _pipeline = pipeline;
        _spikeDetectionService = spikeDetectionService;
        _dataSourceStrategies = dataSourceStrategies;
        _resultService = resultService;
        _connectionManager = connectionManager;
        _scopeFactory = scopeFactory;
        _logger = logger;
        _progressSaveIntervalMs = Math.Max(settings.Value.ProgressSaveIntervalSeconds, 1) * 1000;
    }

    [AutomaticRetry(Attempts = 0)]
    [DisableConcurrentExecution(timeoutInSeconds: 86400)]
    public Task ProcessJobAsync(string jobId, string sessionToken) =>
        ProcessJobCoreAsync(jobId, sessionToken, sourceId: null);

    [AutomaticRetry(Attempts = 0)]
    [DisableConcurrentExecution(timeoutInSeconds: 86400)]
    public Task ProcessSourceJobAsync(string jobId, string sourceId, string sessionToken) =>
        ProcessJobCoreAsync(jobId, sessionToken, sourceId);

    private async Task ProcessJobCoreAsync(string jobId, string sessionToken, string? sourceId)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(jobId);
        if (job == null) return;

        if (job.Status is "Completed" or "Failed")
            return;

        var connectionInfo = _connectionManager.GetConnectionInfo(sessionToken);
        if (connectionInfo == null)
        {
            await FailJobAsync(job, new InvalidOperationException(
                "Database session expired. Please reconnect and run the analysis again."));
            return;
        }

        var provider = DatabaseProvider.Normalize(connectionInfo.Provider);
        var connectionString = connectionInfo.ConnectionString;

        try
        {
            await SetRunningAsync(job);
            _resultService.DeletePartialFile(job.Id);

            var onBatchAggregated = CreateBatchAggregator(job.Id);

            API.DTOs.SpikeResponse response;
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
                    onBatchAggregated);
            }
            else
            {
                var dataSource = _dataSourceStrategies.FirstOrDefault(d => d.Id.Equals(sourceId, StringComparison.OrdinalIgnoreCase))
                    ?? throw new InvalidOperationException($"DataSource {sourceId} not found");

                int? channelId = null;
                if (!string.IsNullOrEmpty(job.Table) && int.TryParse(job.Table, out var cid))
                    channelId = cid;

                var request = new API.DTOs.DetectSpikesRequest
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
                    onBatchAggregated);
            }

            await CompleteJobAsync(job, response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Analysis job {JobId} failed", jobId);
            await FailJobAsync(job, ex);
        }
    }

    private async Task SetRunningAsync(AnalysisJob job)
    {
        job.Status = "Running";
        job.Progress = 0;
        await _internalDb.SaveChangesAsync();
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

    private Action<IReadOnlyList<DataPoint>> CreateBatchAggregator(string jobId)
    {
        var lastSavedCount = -1;
        var lastSaveTicks = 0L;

        return points =>
        {
            if (points.Count == 0 || points.Count == lastSavedCount)
                return;

            var now = Environment.TickCount64;
            if (lastSaveTicks > 0 && now - lastSaveTicks < _progressSaveIntervalMs)
                return;

            lastSavedCount = points.Count;
            lastSaveTicks = now;

            try
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _resultService.SavePartialSeriesAsync(jobId, points);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to persist partial series for job {JobId}", jobId);
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to schedule partial series save for job {JobId}", jobId);
            }
        };
    }

    private async Task CompleteJobAsync(AnalysisJob job, API.DTOs.SpikeResponse response)
    {
        await _resultService.SaveAsync(job, response);
        _resultService.DeletePartialFile(job.Id);
        job.Status = "Completed";
        job.Progress = 100;
        job.CompletedAt = DateTime.UtcNow;
        await _internalDb.SaveChangesAsync();
    }

    private async Task FailJobAsync(AnalysisJob job, Exception ex)
    {
        _resultService.DeleteResultFiles(job);
        job.ResultFilePath = null;
        job.SeriesPointCount = 0;
        job.Status = "Failed";
        job.ErrorMessage = Truncate(ex.Message, 2000);
        job.CompletedAt = DateTime.UtcNow;
        await _internalDb.SaveChangesAsync();
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];
}
