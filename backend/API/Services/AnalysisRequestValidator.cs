using API.Configuration;
using API.Infrastructure;
using Core.Enums;
using Microsoft.Extensions.Options;

namespace API.Services;

public class AnalysisRequestValidator
{
    private readonly AnalysisSettings _settings;

    public AnalysisRequestValidator(IOptions<AnalysisSettings> settings)
    {
        _settings = settings.Value;
    }

    public void Validate(
        DateTime startDate,
        DateTime endDate,
        TimeGranularity granularity,
        int? windowSize,
        int? customMinutes)
    {
        if (endDate <= startDate)
            throw new ArgumentException("EndDate must be after StartDate.");

        var rangeDays = (endDate - startDate).TotalDays;
        if (rangeDays > _settings.MaxAnalysisRangeDays)
            throw new ArgumentException(
                $"Date range exceeds the maximum of {_settings.MaxAnalysisRangeDays} days.");

        if (windowSize is < 5 or > 1000)
            throw new ArgumentException("WindowSize must be between 5 and 1000.");

        if (granularity == TimeGranularity.Custom)
        {
            if (customMinutes is null or <= 0)
                throw new ArgumentException("CustomMinutes must be greater than zero for custom granularity.");
        }
        else if (customMinutes is <= 0)
        {
            throw new ArgumentException("CustomMinutes must be greater than zero.");
        }

        var estimatedPoints = EstimateSeriesPoints(startDate, endDate, granularity, customMinutes);
        if (estimatedPoints > _settings.MaxSeriesPoints)
            throw new ArgumentException(
                $"Estimated series size ({estimatedPoints:N0} points) exceeds the maximum of {_settings.MaxSeriesPoints:N0}. " +
                "Use a coarser granularity or a shorter date range.");
    }

    public void ValidateIdentifiers(string schema, string table, string timeColumn)
    {
        SqlIdentifier.EnsureSafeMany(
            (schema, nameof(schema)),
            (table, nameof(table)),
            (timeColumn, nameof(timeColumn)));
    }

    public static long EstimateSeriesPoints(
        DateTime startDate,
        DateTime endDate,
        TimeGranularity granularity,
        int? customMinutes)
    {
        var span = endDate - startDate;
        if (span <= TimeSpan.Zero)
            return 0;

        return granularity switch
        {
            TimeGranularity.Minute => (long)Math.Ceiling(span.TotalMinutes),
            TimeGranularity.Hour => (long)Math.Ceiling(span.TotalHours),
            TimeGranularity.Day => (long)Math.Ceiling(span.TotalDays),
            TimeGranularity.Week => (long)Math.Ceiling(span.TotalDays / 7d),
            TimeGranularity.Month => EstimateMonthBuckets(startDate, endDate),
            TimeGranularity.Custom => (long)Math.Ceiling(span.TotalMinutes / Math.Max(customMinutes ?? 60, 1)),
            _ => (long)Math.Ceiling(span.TotalHours)
        };
    }

    private static long EstimateMonthBuckets(DateTime startDate, DateTime endDate)
    {
        long count = 0;
        var cursor = new DateTime(startDate.Year, startDate.Month, 1, 0, 0, 0, startDate.Kind);
        var end = endDate;
        while (cursor < end)
        {
            count++;
            cursor = cursor.AddMonths(1);
        }

        return Math.Max(count, 1);
    }
}
