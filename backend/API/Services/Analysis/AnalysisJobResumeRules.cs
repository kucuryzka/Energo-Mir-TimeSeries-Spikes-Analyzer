using API.Models;

namespace API.Services.Analysis;

public static class AnalysisJobResumeRules
{
    public static bool CanResume(AnalysisJob job, bool hasPartialResult) =>
        job.Status is AnalysisJobStatus.Failed or AnalysisJobStatus.Pending
        && job.ProcessedUntil.HasValue
        && hasPartialResult;
}
