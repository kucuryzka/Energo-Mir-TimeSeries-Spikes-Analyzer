using API.Models;

namespace API.Contracts;

public interface IAnalysisJobCancellationService
{
    CancellationToken Register(string jobId);

    void Unregister(string jobId);

    void RequestCancel(string jobId);

    bool IsCancellationRequested(string jobId);

    void StopAndDetach(AnalysisJob job);

    void DetachHangfire(AnalysisJob job);
}
