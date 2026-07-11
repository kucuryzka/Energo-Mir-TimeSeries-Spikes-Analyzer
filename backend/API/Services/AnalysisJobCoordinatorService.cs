using API.Data;
using API.DTOs;
using API.Models;
using Hangfire;
using Hangfire.Storage;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public class AnalysisJobCoordinatorService
{
    private readonly InternalDbContext _db;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly IAnalysisJobCancellationService _cancellation;
    private readonly AnalysisResultService _resultService;

    public AnalysisJobCoordinatorService(
        InternalDbContext db,
        IBackgroundJobClient backgroundJobClient,
        IAnalysisJobCancellationService cancellation,
        AnalysisResultService resultService)
    {
        _db = db;
        _backgroundJobClient = backgroundJobClient;
        _cancellation = cancellation;
        _resultService = resultService;
    }

    public async Task<AnalysisJobsOverviewDto> GetOverviewAsync(string? database = null, int recentLimit = 50)
    {
        var activeQuery = _db.AnalysisJobs
            .Where(j => j.Status == "Pending" || j.Status == "Running");

        var recentQuery = _db.AnalysisJobs
            .Where(j => j.Status == "Completed" || j.Status == "Failed" || j.Status == "Cancelled");

        if (!string.IsNullOrWhiteSpace(database))
        {
            activeQuery = activeQuery.Where(j => j.Database == database);
            recentQuery = recentQuery.Where(j => j.Database == database);
        }

        var activeJobs = await activeQuery
            .OrderBy(j => j.CreatedAt)
            .ToListAsync();

        var recentJobs = await recentQuery
            .OrderByDescending(j => j.CompletedAt ?? j.CreatedAt)
            .Take(Math.Clamp(recentLimit, 1, 200))
            .ToListAsync();

        var queuePositions = BuildHangfireQueuePositions();

        return new AnalysisJobsOverviewDto
        {
            Active = activeJobs.Select(job => MapJob(job, queuePositions)).ToList(),
            Recent = recentJobs.Select(job => MapJob(job, queuePositions)).ToList(),
        };
    }

    private AnalysisJobQueueItemDto MapJob(AnalysisJob job, IReadOnlyDictionary<string, int> queuePositions)
    {
        var hasPartial = _resultService.HasPartialResult(job.Id);
        return new()
        {
            Id = job.Id,
            Status = job.Status,
            Progress = job.Progress,
            Database = job.Database,
            Schema = job.Schema,
            Table = job.Table,
            SourceKind = ResolveSourceKind(job),
            StartDate = job.StartDate,
            EndDate = job.EndDate,
            Granularity = job.Granularity,
            CreatedAt = job.CreatedAt,
            CompletedAt = job.CompletedAt,
            TimeColumn = job.TimeColumn,
            CustomMinutes = job.CustomMinutes,
            ChannelId = ResolveChannelId(job),
            QueuePosition = job.Status == "Pending"
                ? TryGetQueuePosition(job.BackgroundJobId, queuePositions)
                : null,
            HasPartialResult = hasPartial,
            HasResult = _resultService.HasResult(job),
            CanResume = AnalysisJobResumeRules.CanResume(job, hasPartial),
            CompletedBatchCount = job.CompletedBatchCount,
            TotalBatchCount = job.TotalBatchCount,
            AvgBatchDurationMs = job.AvgBatchDurationMs,
            LastBatchDurationMs = job.LastBatchDurationMs,
            PostProcessDurationMs = job.PostProcessDurationMs,
        };
    }

    public async Task<bool> TryCancelAsync(string jobId)
    {
        var job = await _db.AnalysisJobs.FindAsync(jobId);
        if (job == null)
            return false;

        if (job.Status is "Completed" or "Failed" or "Cancelled")
            return false;

        _cancellation.RequestCancel(jobId);

        if (!string.IsNullOrEmpty(job.BackgroundJobId))
            _backgroundJobClient.Delete(job.BackgroundJobId);

        if (job.Status == "Pending")
            await MarkCancelledAsync(job);

        return true;
    }

    public async Task MarkCancelledAsync(AnalysisJob job)
    {
        job.Status = "Cancelled";
        job.ErrorMessage = "Задача отменена пользователем.";
        job.CompletedAt = DateTime.UtcNow;
        job.ConnectionString = null;
        job.ConnectionProvider = null;
        await _db.SaveChangesAsync();
    }

    public async Task<(bool Ok, string? Error)> TryResumeAsync(
        string jobId,
        string? connectionProvider = null,
        string? connectionString = null)
    {
        var job = await _db.AnalysisJobs.FindAsync(jobId);
        if (job == null)
            return (false, "Задача не найдена.");

        if (job.Status is "Completed" or "Cancelled" or "Running")
            return (false, "Задачу нельзя возобновить в текущем статусе.");

        if (!string.IsNullOrWhiteSpace(connectionString))
        {
            job.ConnectionProvider = connectionProvider;
            job.ConnectionString = connectionString;
        }

        if (string.IsNullOrWhiteSpace(job.ConnectionString))
            return (false, "Нет сохранённого подключения. Подключитесь к БД и повторите resume.");

        if (!string.IsNullOrEmpty(job.BackgroundJobId))
            _backgroundJobClient.Delete(job.BackgroundJobId);

        job.Status = "Pending";
        job.ErrorMessage = null;
        job.CompletedAt = null;

        var hangfireId = string.IsNullOrEmpty(job.SourceId)
            ? _backgroundJobClient.Enqueue<AnalysisJobProcessor>(p => p.ProcessJobAsync(job.Id))
            : _backgroundJobClient.Enqueue<AnalysisJobProcessor>(p => p.ProcessSourceJobAsync(job.Id, job.SourceId));

        job.BackgroundJobId = hangfireId;
        await _db.SaveChangesAsync();
        return (true, null);
    }

    private static string ResolveSourceKind(AnalysisJob job) =>
        job.Schema switch
        {
            "dbo" => "dbo",
            "em_protocol" => "em_protocol",
            _ => "generic",
        };

    private static string? ResolveChannelId(AnalysisJob job) =>
        job.Schema is "dbo" or "em_protocol"
        && !string.Equals(job.Table, "All", StringComparison.OrdinalIgnoreCase)
            ? job.Table
            : null;

    private static Dictionary<string, int> BuildHangfireQueuePositions()
    {
        var positions = new Dictionary<string, int>(StringComparer.Ordinal);
        try
        {
            var monitor = JobStorage.Current.GetMonitoringApi();
            var position = 0;
            foreach (var queue in monitor.Queues())
            {
                var enqueued = monitor.EnqueuedJobs(queue.Name, 0, 200);
                foreach (var entry in enqueued)
                {
                    position++;
                    positions[entry.Key] = position;
                }
            }
        }
        catch
        {
            // Hangfire storage may be unavailable during tests.
        }

        return positions;
    }

    private static int? TryGetQueuePosition(string? backgroundJobId, IReadOnlyDictionary<string, int> positions)
    {
        if (string.IsNullOrEmpty(backgroundJobId))
            return null;

        return positions.TryGetValue(backgroundJobId, out var position) ? position : null;
    }
}
