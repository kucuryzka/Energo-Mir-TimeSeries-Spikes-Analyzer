using API.Data;
using API.DTOs.Analysis;
using API.Infrastructure.Database;
using API.Models;
using Core.Enums;
using Microsoft.EntityFrameworkCore;

namespace API.Services.Analysis;

public class PointDetailsService
{
    private static readonly TimeSpan StaleLoadingThreshold = TimeSpan.FromHours(2);
    private static readonly TimeSpan LoadingRestartThreshold = TimeSpan.FromMinutes(2);

    private readonly InternalDbContext _internalDb;
    private readonly AnalysisResultService _resultService;
    private readonly SupplementJobService _supplementJobs;

    public PointDetailsService(
        InternalDbContext internalDb,
        AnalysisResultService resultService,
        SupplementJobService supplementJobs
    )
    {
        _internalDb = internalDb;
        _resultService = resultService;
        _supplementJobs = supplementJobs;
    }

    public async Task<PointDetailsStatusResponse> GetOrStartFetchAsync(
        string jobId,
        DateTime timestamp,
        string sessionToken,
        int? channelIdOverride = null,
        CancellationToken cancellationToken = default
    )
    {
        var job = await _internalDb.AnalysisJobs.FindAsync([jobId], cancellationToken)
            ?? throw new KeyNotFoundException("Задача анализа не найдена.");

        var aligned = GranularityHelper.AlignToBucketStart(timestamp, job.Granularity, job.CustomMinutes);
        var channelId = channelIdOverride ?? ResolveChannelId(job);
        var cached = await _resultService.TryLoadPointDetailsAsync(
            jobId, aligned, channelId, job.Granularity, job.CustomMinutes, cancellationToken
        );

        if (cached != null)
        {
            if (cached.Status is "complete" or "failed")
                return ToResponse(cached);

            if (cached.Status == "loading")
            {
                var supplement = await _supplementJobs.FindLatestPointDetailsSupplementAsync(
                    job, aligned, channelId, cancellationToken
                );
                if (supplement?.Status == AnalysisJobStatus.Failed)
                {
                    return new PointDetailsStatusResponse
                    {
                        Status = "failed",
                        ErrorMessage = supplement.ErrorMessage ?? "Не удалось загрузить детали точки.",
                    };
                }

                var hasActiveSupplement = supplement?.Status is AnalysisJobStatus.Pending or AnalysisJobStatus.Running;
                var loadingAge = DateTime.UtcNow - cached.RequestedAt;
                if (hasActiveSupplement || loadingAge < LoadingRestartThreshold)
                    return ToResponse(cached);
            }
        }

        await _supplementJobs.StartPointDetailsAsync(jobId, aligned, sessionToken, channelIdOverride, cancellationToken);
        return new PointDetailsStatusResponse { Status = "loading" };
    }

    private static int? ResolveChannelId(AnalysisJob job) =>
        job.Schema is "dbo" or "em_protocol"
        && !string.IsNullOrEmpty(job.Table)
        && !string.Equals(job.Table, "All", StringComparison.OrdinalIgnoreCase)
        && int.TryParse(job.Table, out var cid)
            ? cid
            : null;

    private static PointDetailsStatusResponse ToResponse(PointDetailsLineDto line) =>
        new()
        {
            Status = line.Status,
            ChannelBreakdown = line.ChannelBreakdown,
            MeteringRows = line.MeteringRows,
            ErrorMessage = line.ErrorMessage,
        };
}
