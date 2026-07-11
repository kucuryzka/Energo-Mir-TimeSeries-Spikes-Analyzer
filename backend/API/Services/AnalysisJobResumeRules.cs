using API.Models;

namespace API.Services;

public static class AnalysisJobResumeRules
{
    public static bool CanResume(AnalysisJob job, bool hasPartialResult) =>
        job.Status is "Failed" or "Pending"
        && job.ProcessedUntil.HasValue
        && hasPartialResult;
}
