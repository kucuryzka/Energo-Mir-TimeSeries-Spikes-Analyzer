using API.Models;

namespace API.Services.Analysis;

public static class AnalysisJobDurationHelper
{
    public static long? ComputeActiveDurationMs(AnalysisJob job, DateTime? utcNow = null)
    {
        var now = utcNow ?? DateTime.UtcNow;
        long total = 0;

        if (job.AvgBatchDurationMs is > 0 && job.CompletedBatchCount > 0)
            total = job.AvgBatchDurationMs.Value * job.CompletedBatchCount;

        if (job.Status == AnalysisJobStatus.Running && job.RunningStartedAt.HasValue)
        {
            var segmentMs = (long)Math.Max(0, (now - job.RunningStartedAt.Value).TotalMilliseconds);
            total += segmentMs;
        }

        if (job.PostProcessDurationMs is > 0
            && job.Status is AnalysisJobStatus.Completed or AnalysisJobStatus.Failed)
        {
            total += job.PostProcessDurationMs.Value;
        }

        return total > 0 ? total : null;
    }
}
