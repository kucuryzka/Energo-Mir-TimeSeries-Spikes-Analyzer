using Core.Enums;

namespace API.Infrastructure;

public static class GranularityHelper
{
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
}
