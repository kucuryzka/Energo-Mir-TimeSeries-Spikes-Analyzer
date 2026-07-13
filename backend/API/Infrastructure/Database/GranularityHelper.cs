using Core.Enums;

namespace API.Infrastructure.Database;

public static class GranularityHelper
{
    public static DateTime AlignToBucketStart(DateTime timestamp, TimeGranularity granularity, int? customMinutes)
    {
        var ts = new DateTime(
            timestamp.Year,
            timestamp.Month,
            timestamp.Day,
            timestamp.Hour,
            timestamp.Minute,
            timestamp.Second,
            timestamp.Kind
        );

        return granularity switch
        {
            TimeGranularity.Minute => new DateTime(ts.Year, ts.Month, ts.Day, ts.Hour, ts.Minute, 0, ts.Kind),
            TimeGranularity.Hour => new DateTime(ts.Year, ts.Month, ts.Day, ts.Hour, 0, 0, ts.Kind),
            TimeGranularity.Day => new DateTime(ts.Year, ts.Month, ts.Day, 0, 0, 0, ts.Kind),
            TimeGranularity.Week => AlignToWeekStart(ts),
            TimeGranularity.Month => new DateTime(ts.Year, ts.Month, 1, 0, 0, 0, ts.Kind),
            TimeGranularity.Custom => AlignToCustomBucket(ts, customMinutes ?? 60),
            _ => new DateTime(ts.Year, ts.Month, ts.Day, ts.Hour, 0, 0, ts.Kind),
        };
    }

    public static DateTime GetBucketEnd(DateTime timestamp, TimeGranularity granularity, int? customMinutes) =>
        granularity switch
        {
            TimeGranularity.Minute => timestamp.AddMinutes(1),
            TimeGranularity.Hour => timestamp.AddHours(1),
            TimeGranularity.Day => timestamp.AddDays(1),
            TimeGranularity.Week => timestamp.AddDays(7),
            TimeGranularity.Month => timestamp.AddMonths(1),
            TimeGranularity.Custom => timestamp.AddMinutes(customMinutes ?? 60),
            _ => timestamp.AddHours(1)
        };

    private static DateTime AlignToWeekStart(DateTime ts)
    {
        var epoch = new DateTime(1900, 1, 1, 0, 0, 0, ts.Kind);
        var weeks = (int)((ts.Date - epoch.Date).TotalDays / 7);
        return epoch.AddDays(weeks * 7);
    }

    private static DateTime AlignToCustomBucket(DateTime ts, int minutes)
    {
        var dayStart = new DateTime(ts.Year, ts.Month, ts.Day, 0, 0, 0, ts.Kind);
        var totalMinutes = (int)(ts - dayStart).TotalMinutes;
        var bucket = totalMinutes / minutes * minutes;
        return dayStart.AddMinutes(bucket);
    }
}
