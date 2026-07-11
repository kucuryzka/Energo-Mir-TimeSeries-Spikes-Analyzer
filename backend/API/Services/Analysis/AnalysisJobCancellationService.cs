using System.Collections.Concurrent;
using API.Contracts;
using API.Models;
using Hangfire;

namespace API.Services.Analysis;

public class AnalysisJobCancellationService : IAnalysisJobCancellationService
{
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _tokens = new(StringComparer.Ordinal);
    private readonly IBackgroundJobClient _backgroundJobs;

    public AnalysisJobCancellationService(IBackgroundJobClient backgroundJobs)
    {
        _backgroundJobs = backgroundJobs;
    }

    public CancellationToken Register(string jobId)
    {
        var cts = new CancellationTokenSource();
        _tokens.AddOrUpdate(jobId, cts, (_, existing) =>
        {
            existing.Dispose();
            return cts;
        });
        return cts.Token;
    }

    public void Unregister(string jobId)
    {
        if (_tokens.TryRemove(jobId, out var cts))
            cts.Dispose();
    }

    public void RequestCancel(string jobId)
    {
        if (_tokens.TryGetValue(jobId, out var cts))
            cts.Cancel();
    }

    public bool IsCancellationRequested(string jobId) =>
        _tokens.TryGetValue(jobId, out var cts) && cts.IsCancellationRequested;

    public void StopAndDetach(AnalysisJob job)
    {
        RequestCancel(job.Id);
        DetachHangfire(job);
    }

    public void DetachHangfire(AnalysisJob job)
    {
        if (!string.IsNullOrEmpty(job.BackgroundJobId))
            _backgroundJobs.Delete(job.BackgroundJobId);
    }
}
