using API.Configuration;
using API.Data;
using API.Models;
using Core.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace API.Services;

public class AnalysisTimingStatsService
{
    private readonly InternalDbContext _db;
    private readonly int _batchIntervalDays;

    public AnalysisTimingStatsService(InternalDbContext db, IOptions<AnalysisSettings> settings)
    {
        _db = db;
        _batchIntervalDays = Math.Max(settings.Value.BatchIntervalDays, 1);
    }

    public static string BuildSourceKey(string database, string schema, string table, TimeGranularity granularity) =>
        $"{database}|{schema}|{table}|{granularity}";

    public async Task RecordCompletedJobAsync(AnalysisJob job, long saveDurationMs, CancellationToken cancellationToken = default)
    {
        if (job.CompletedBatchCount <= 0 || job.AvgBatchDurationMs is null or <= 0)
            return;

        var periodDays = Math.Max((job.EndDate - job.StartDate).TotalDays, 1);
        var totalJobMs = job.AvgBatchDurationMs.Value * job.CompletedBatchCount
            + (job.PostProcessDurationMs ?? 0)
            + saveDurationMs;
        var msPerDay = (long)(totalJobMs / periodDays);

        var sourceKey = BuildSourceKey(job.Database, job.Schema, job.Table, job.Granularity);
        var stats = await _db.AnalysisSourceTimingStats.FindAsync([sourceKey], cancellationToken);
        if (stats == null)
        {
            stats = new AnalysisSourceTimingStats
            {
                SourceKey = sourceKey,
                Database = job.Database,
                Schema = job.Schema,
                Table = job.Table,
                Granularity = job.Granularity.ToString(),
                SampleCount = 1,
                AvgBatchDurationMs = job.AvgBatchDurationMs.Value,
                AvgPostProcessDurationMs = (job.PostProcessDurationMs ?? 0) + saveDurationMs,
                AvgMsPerPeriodDay = msPerDay,
                LastUpdatedAt = DateTime.UtcNow,
            };
            _db.AnalysisSourceTimingStats.Add(stats);
        }
        else
        {
            var n = stats.SampleCount;
            stats.SampleCount = n + 1;
            stats.AvgBatchDurationMs = (stats.AvgBatchDurationMs * n + job.AvgBatchDurationMs.Value) / (n + 1);
            var postMs = (job.PostProcessDurationMs ?? 0) + saveDurationMs;
            stats.AvgPostProcessDurationMs = (stats.AvgPostProcessDurationMs * n + postMs) / (n + 1);
            stats.AvgMsPerPeriodDay = (stats.AvgMsPerPeriodDay * n + msPerDay) / (n + 1);
            stats.LastUpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task<DTOs.AnalysisDurationEstimateDto> EstimateAsync(
        string database,
        string schema,
        string table,
        TimeGranularity granularity,
        DateTime startDate,
        DateTime endDate,
        CancellationToken cancellationToken = default)
    {
        var periodDays = Math.Max((endDate - startDate).TotalDays, 1);
        var batchCount = Math.Max(1, (int)Math.Ceiling(periodDays / _batchIntervalDays));
        var sourceKey = BuildSourceKey(database, schema, table, granularity);
        var stats = await _db.AnalysisSourceTimingStats.FindAsync([sourceKey], cancellationToken);

        if (stats == null || stats.SampleCount == 0)
        {
            return new DTOs.AnalysisDurationEstimateDto
            {
                EstimatedBatchCount = batchCount,
                BatchIntervalDays = _batchIntervalDays,
                Confidence = "none",
                SampleCount = 0,
            };
        }

        var estimatedMs = batchCount * stats.AvgBatchDurationMs + stats.AvgPostProcessDurationMs;
        return new DTOs.AnalysisDurationEstimateDto
        {
            EstimatedDurationMs = estimatedMs,
            EstimatedBatchCount = batchCount,
            AvgBatchDurationMs = stats.AvgBatchDurationMs,
            AvgPostProcessDurationMs = stats.AvgPostProcessDurationMs,
            Confidence = stats.SampleCount >= 5 ? "high" : "low",
            SampleCount = stats.SampleCount,
            BatchIntervalDays = _batchIntervalDays,
        };
    }
}
