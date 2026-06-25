using System;
using System.Collections.Generic;
using System.Linq;
using Core.Enums;
using Core.Interfaces;
using Core.Models;

namespace API.Services;

public class TimeSeriesServiceStub : ITimeSeriesService
{
    public IEnumerable<DataPoint> GroupByGranularity(
        IEnumerable<CallRecord> rawData,
        TimeGranularity granularity,
        int? customMinutes = null)
    {
        var interval = granularity switch
        {
            TimeGranularity.Minute => TimeSpan.FromMinutes(1),
            TimeGranularity.Hour => TimeSpan.FromHours(1),
            TimeGranularity.Day => TimeSpan.FromDays(1),
            TimeGranularity.Week => TimeSpan.FromDays(7),
            TimeGranularity.Month => TimeSpan.FromDays(30),
            TimeGranularity.Custom => TimeSpan.FromMinutes(customMinutes ?? 15),
            _ => TimeSpan.FromHours(1)
        };

        return rawData
            .GroupBy(x => x.Timestamp.Ticks / interval.Ticks)
            .Select(g =>
            {
                var timestamp = new DateTime(g.Key * interval.Ticks);
                var value = g.Count();

                var dp = (DataPoint)System.Runtime.CompilerServices.RuntimeHelpers.GetUninitializedObject(typeof(DataPoint));
                typeof(DataPoint).GetField("<Timestamp>k__BackingField", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)?.SetValue(dp, timestamp);
                typeof(DataPoint).GetField("<Value>k__BackingField", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)?.SetValue(dp, value);
                return dp;
            })
            .OrderBy(x => x.Timestamp)
            .ToList();
    }
}
