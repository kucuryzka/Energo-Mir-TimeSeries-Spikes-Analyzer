using API.Models;

namespace API.Contracts;

public interface ISupplementJobCancellationService
{
    CancellationToken Register(string supplementJobId);

    void Unregister(string supplementJobId);

    void RequestCancel(string supplementJobId);

    bool IsCancellationRequested(string supplementJobId);

    void StopAndDetach(SupplementJob job);

    void DetachHangfire(SupplementJob job);
}
