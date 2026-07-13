using System.Collections.Concurrent;
using API.Contracts;
using API.Models;
using Hangfire;

namespace API.Services.Analysis;

public class SupplementJobCancellationService : ISupplementJobCancellationService
{
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _tokens = new(StringComparer.Ordinal);
    private readonly IBackgroundJobClient _backgroundJobs;

    public SupplementJobCancellationService(IBackgroundJobClient backgroundJobs)
    {
        _backgroundJobs = backgroundJobs;
    }

    public CancellationToken Register(string supplementJobId)
    {
        var cts = new CancellationTokenSource();
        _tokens.AddOrUpdate(supplementJobId, cts, (_, existing) =>
        {
            existing.Dispose();
            return cts;
        });
        return cts.Token;
    }

    public void Unregister(string supplementJobId)
    {
        if (_tokens.TryRemove(supplementJobId, out var cts))
            cts.Dispose();
    }

    public void RequestCancel(string supplementJobId)
    {
        if (_tokens.TryGetValue(supplementJobId, out var cts))
            cts.Cancel();
    }

    public bool IsCancellationRequested(string supplementJobId) =>
        _tokens.TryGetValue(supplementJobId, out var cts) && cts.IsCancellationRequested;

    public void StopAndDetach(SupplementJob job)
    {
        RequestCancel(job.Id);
        DetachHangfire(job);
    }

    public void DetachHangfire(SupplementJob job)
    {
        if (!string.IsNullOrEmpty(job.BackgroundJobId))
            _backgroundJobs.Delete(job.BackgroundJobId);
    }
}
