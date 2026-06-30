using Core.Models;
using Core.Enums;

namespace Core.Interfaces;


public interface ITimeSeriesService
{
    public IEnumerable<DataPoint> GroupByGranularity(
        IEnumerable<CallRecord> rawData,
        TimeGranularity granularity,
        int? customMinutes = null
    );
}
