using Core.Models;
using Core.Interfaces;
using Core.Enums;
using nietras.SeparatedValues;
using Microsoft.VisualBasic;
using System;
using System.Text.RegularExpressions;
using System.Drawing;

namespace Core.Services;


public class TimeService : ITimeSeriesService
{
    public IEnumerable<DataPoint> GroupByGranularity(
        IEnumerable<Record> rawData,
        TimeGranularity granularity,
        int? customMinutes = null
    )
    {
        if (rawData == null || !rawData.Any())
        {
            return Enumerable.Empty<DataPoint>();
        }

        var interval = GetInterval(granularity, customMinutes);

        var grouped = rawData
        .GroupBy(record => RoundDown(record.EventTime, interval))
        .Select(group => new DataPoint
        {
            Timestamp = group.Key,
            Value = group.Count()
        })
        .OrderBy(point => point.Timestamp);
        
        return grouped;  // в разбиение фильтр по времени
    }

    private TimeSpan GetInterval(TimeGranularity granularity, int? customMinutes)
    {
        return granularity switch
        {
            TimeGranularity.Minute => TimeSpan.FromMinutes(1),
            TimeGranularity.Hour => TimeSpan.FromHours(1),
            TimeGranularity.Day => TimeSpan.FromDays(1),
            TimeGranularity.Week => TimeSpan.FromDays(7),
            TimeGranularity.Month => TimeSpan.FromDays(30),
            TimeGranularity.Custom => TimeSpan.FromMinutes(customMinutes ?? 60),
            _ => throw new ArgumentException("unknown interval")
        };
    }

    private DateTime RoundDown(DateTime timestamp, TimeSpan interval)
    {
        long ticks = timestamp.Ticks;
        long intervalTicks = interval.Ticks;
        long roundedTicks = (ticks / intervalTicks) * intervalTicks;
        return new DateTime(roundedTicks);
    }
}
// 