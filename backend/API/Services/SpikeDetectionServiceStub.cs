using System;
using System.Collections.Generic;
using System.Linq;
using Core.Interfaces;
using Core.Models;

namespace API.Services;

public class SpikeDetectionServiceStub : ISpikeDetectionService
{
    public IEnumerable<AnomalyResult> DetectSpikes(
        IEnumerable<DataPoint> series,
        double confidence = 95,
        int windowSize = 30)
    {
        var random = new Random();
        return series.Select(dp =>
        {
            // Simple mock spike detection for API testing:
            // High values are marked as spikes
            bool isSpike = dp.Value > 25 || (dp.Value > 15 && random.NextDouble() > 0.85);
            double pValue = isSpike ? 0.001 : 0.75;

            return new AnomalyResult
            {
                Timestamp = dp.Timestamp,
                Value = dp.Value,
                IsSpike = isSpike,
                PValue = pValue
            };
        }).ToList();
    }
}
