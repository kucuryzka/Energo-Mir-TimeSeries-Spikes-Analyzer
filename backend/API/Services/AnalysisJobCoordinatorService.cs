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

    public async Task<IReadOnlyList<AnalysisJobQueueItemDto>> GetQueueAsync(string? database = null)
    {
        var query = _db.AnalysisJobs
            .Where(j => j.Status == "Pending" || j.Status == "Running");

        if (!string.IsNullOrWhiteSpace(database))
            query = query.Where(j => j.Database == database);

        var jobs = await query
            .OrderBy(j => j.CreatedAt)
            .ToListAsync();

        var queuePositions = BuildHangfireQueuePositions();

        return jobs.Select(job => new AnalysisJobQueueItemDto
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
            QueuePosition = job.Status == "Pending"
                ? TryGetQueuePosition(job.BackgroundJobId, queuePositions)
                : null,
            HasPartialResult = _resultService.HasPartialResult(job.Id),
        }).ToList();
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
        await _db.SaveChangesAsync();
    }

    private static string ResolveSourceKind(AnalysisJob job) =>
        job.Schema switch
        {
            "dbo" => "dbo",
            "em_protocol" => "em_protocol",
            _ => "generic",
        };

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
