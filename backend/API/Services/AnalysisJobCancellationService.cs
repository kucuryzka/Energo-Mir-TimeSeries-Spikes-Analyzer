using System.Collections.Concurrent;

namespace API.Services;

public interface IAnalysisJobCancellationService
{
    CancellationToken Register(string jobId);

    void Unregister(string jobId);

    void RequestCancel(string jobId);

    bool IsCancellationRequested(string jobId);
}

public class AnalysisJobCancellationService : IAnalysisJobCancellationService
{
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _tokens = new(StringComparer.Ordinal);

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
}
