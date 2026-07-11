using API.Data;
using API.DTOs;
using API.Models;
using Hangfire;
using Microsoft.EntityFrameworkCore;

namespace API.Services;

public class AnalysisJobQueryService
{
    private readonly InternalDbContext _internalDb;
    private readonly AnalysisResultService _resultService;
    private readonly IBackgroundJobClient _backgroundJobClient;
    private readonly IAnalysisJobCancellationService _cancellation;

    public AnalysisJobQueryService(
        InternalDbContext internalDb,
        AnalysisResultService resultService,
        IBackgroundJobClient backgroundJobClient,
        IAnalysisJobCancellationService cancellation)
    {
        _internalDb = internalDb;
        _resultService = resultService;
        _backgroundJobClient = backgroundJobClient;
        _cancellation = cancellation;
    }

    public async Task<AnalysisJob?> FindJobAsync(string id) =>
        await _internalDb.AnalysisJobs.FindAsync(id);

    public AnalysisJobStatusDto BuildStatus(AnalysisJob job)
    {
        var hasPartial = _resultService.HasPartialResult(job.Id);
        return new()
        {
            Id = job.Id,
            Status = job.Status,
            Progress = job.Progress,
            ErrorMessage = job.ErrorMessage,
            HasResult = _resultService.HasResult(job),
            HasPartialResult = hasPartial,
            CanResume = AnalysisJobResumeRules.CanResume(job, hasPartial),
            SeriesPointCount = job.SeriesPointCount
        };
    }

    public async Task<SpikeResponse?> TryLoadPartialAsync(string id, AnalysisJob job)
    {
        if (job.Status is not ("Running" or "Completed" or "Cancelled" or "Failed" or "Pending"))
            throw new InvalidOperationException("Partial result is not available.");

        return await _resultService.TryLoadPartialAsync(id);
    }

    public async Task<string> SerializeResultAsync(AnalysisJob job)
    {
        if (!_resultService.HasResult(job))
            throw new InvalidOperationException("Result is not ready or failed");

        return await _resultService.SerializeToJsonAsync(job);
    }

    public async Task<List<AnalysisJobHistoryItemDto>> GetChannelScopedHistoryAsync(string database, string schema)
    {
        return await _internalDb.AnalysisJobs
            .Where(j => j.Database == database && j.Schema == schema)
            .OrderByDescending(j => j.CompletedAt ?? j.CreatedAt)
            .Select(j => new AnalysisJobHistoryItemDto
            {
                Id = j.Id,
                StartDate = j.StartDate,
                EndDate = j.EndDate,
                Granularity = j.Granularity,
                Status = j.Status,
                Progress = j.Progress,
                CreatedAt = j.CreatedAt,
                CompletedAt = j.CompletedAt,
                SeriesPointCount = j.SeriesPointCount,
                ChannelId = j.Table == "All" ? null : j.Table
            })
            .ToListAsync();
    }

    public async Task<List<AnalysisJobHistoryItemDto>> GetTableScopedHistoryAsync(string database, string schema, string table)
    {
        return await _internalDb.AnalysisJobs
            .Where(j => j.Database == database && j.Schema == schema && j.Table == table)
            .OrderByDescending(j => j.CompletedAt ?? j.CreatedAt)
            .Select(j => new AnalysisJobHistoryItemDto
            {
                Id = j.Id,
                StartDate = j.StartDate,
                EndDate = j.EndDate,
                Granularity = j.Granularity,
                Status = j.Status,
                Progress = j.Progress,
                CreatedAt = j.CreatedAt,
                CompletedAt = j.CompletedAt,
                SeriesPointCount = j.SeriesPointCount
            })
            .ToListAsync();
    }

    public async Task<bool> DeleteJobAsync(string id)
    {
        var job = await _internalDb.AnalysisJobs.FindAsync(id);
        if (job == null)
            return false;

        if (job.Status is "Running" or "Pending")
            _cancellation.RequestCancel(id);

        if (!string.IsNullOrEmpty(job.BackgroundJobId))
            _backgroundJobClient.Delete(job.BackgroundJobId);

        _resultService.DeleteResultFiles(job);
        _internalDb.AnalysisJobs.Remove(job);
        await _internalDb.SaveChangesAsync();
        return true;
    }
}
