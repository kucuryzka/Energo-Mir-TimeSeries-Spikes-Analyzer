using Core.Models;
using Core.Interfaces;
using Core.Enums;
using Microsoft.ML;
using Microsoft.ML.Transforms.TimeSeries;
using Microsoft.ML.Data;

namespace Core.Services;


public class SpikeDetectionService : ISpikeDetectionService
{
    private readonly MLContext _mlContext = new MLContext();

    public IEnumerable<AnomalyResult> DetectSpikes(IEnumerable<DataPoint> series, double confidence = 95, int windowSize = 30)
    {
        var data = series.ToList();

        if (data.Count < 3)
        {
            return data.Select(p => new AnomalyResult
            {
                Timestamp = p.Timestamp,
                Value = p.Value,
                IsSpike = false,
                PValue = 1.0,
                ChannelBreakdown = p.ChannelBreakdown
            });
        }

        // ---- Approach 1: ML.NET IID Spike Detection (sliding window) ----
        var mlAnomalies = new bool[data.Count];
        var mlPValues = new double[data.Count];
        Array.Fill(mlPValues, 1.0);

        if (data.Count >= windowSize)
        {
            try
            {
                var mlData = data.Select(p => new MlDataPoint { Value = (float)p.Value }).ToList();
                var dataView = _mlContext.Data.LoadFromEnumerable(mlData);

                var pipeline = _mlContext.Transforms.DetectIidSpike(
                    outputColumnName: nameof(SpikePrediction.Prediction),
                    inputColumnName: nameof(MlDataPoint.Value),
                    confidence: confidence,
                    pvalueHistoryLength: windowSize
                );

                var model = pipeline.Fit(dataView);
                var transformedData = model.Transform(dataView);
                var predictions = _mlContext.Data.CreateEnumerable<SpikePrediction>(transformedData, reuseRowObject: false).ToList();

                for (int i = 0; i < data.Count; i++)
                {
                    mlAnomalies[i] = predictions[i].Prediction[0] == 1;
                    mlPValues[i] = predictions[i].Prediction[2];
                }
            }
            catch
            {
                // Fallback: all false
            }
        }

        // ---- Approach 2: Z-Score based detection (global + local) ----
        var values = data.Select(d => (double)d.Value).ToArray();
        double globalMean = values.Average();
        double globalStd = Math.Sqrt(values.Sum(v => Math.Pow(v - globalMean, 2)) / values.Length);
        if (globalStd < 0.001) globalStd = 1.0; // avoid division by zero

        var results = new List<AnomalyResult>();
        for (int i = 0; i < data.Count; i++)
        {
            // Local z-score: compare against a window around this point
            int halfWindow = Math.Max(3, windowSize / 2);
            int winStart = Math.Max(0, i - halfWindow);
            int winEnd = Math.Min(data.Count - 1, i + halfWindow);
            var windowVals = values[winStart..(winEnd + 1)];
            double localMean = windowVals.Average();
            double localStd = Math.Sqrt(windowVals.Sum(v => Math.Pow(v - localMean, 2)) / windowVals.Length);
            if (localStd < 0.001) localStd = 1.0;

            double zScore = (values[i] - localMean) / localStd;

            // Global z-score
            double globalZ = (values[i] - globalMean) / globalStd;

            // Combined score: use the more sensitive of the two
            double effectiveZ = Math.Max(zScore, globalZ);

            // Convert z-score to p-value (one-tailed: only interested in positive spikes)
            double pValue = ZToPValue(effectiveZ);

            // A point is a spike if:
            // 1. ML.NET says it's anomalous AND value is above local baseline, OR
            // 2. Z-score > threshold (more sensitive for early/isolated spikes)
            bool isMlSpike = mlAnomalies[i] && values[i] > localMean;
            
            // Adaptive z-score threshold: lower when we have less data
            double zThreshold = data.Count < 50 ? 2.0 : 2.5;
            bool isZScoreSpike = effectiveZ > zThreshold && values[i] > localMean;

            bool isSpike = isMlSpike || isZScoreSpike;

            // Use the more significant p-value
            double finalPValue = Math.Min(mlPValues[i], pValue);

            results.Add(new AnomalyResult
            {
                Timestamp = data[i].Timestamp,
                Value = data[i].Value,
                IsSpike = isSpike,
                PValue = finalPValue,
                ChannelBreakdown = data[i].ChannelBreakdown
            });
        }

        return results;
    }

    /// <summary>
    /// Converts a z-score to a one-tailed p-value using the standard normal distribution approximation.
    /// </summary>
    private static double ZToPValue(double z)
    {
        if (z < 0) z = 0;
        // Abramowitz and Stegun approximation for the standard normal CDF
        double cdf = 0.5 * (1.0 + Erf(z / Math.Sqrt(2.0)));
        // One-tailed p-value: probability of observing a value this extreme or more
        return 1.0 - cdf;
    }

    /// <summary>
    /// Error function approximation (Abramowitz and Stegun).
    /// </summary>
    private static double Erf(double x)
    {
        if (x < 0) return -Erf(-x);
        double[] a = { 0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429 };
        double p = 0.3275911;
        double t = 1.0 / (1.0 + p * x);
        double y = 1.0 - (((((a[4] * t + a[3]) * t) + a[2]) * t + a[1]) * t + a[0]) * t * Math.Exp(-x * x);
        return y;
    }

    private class MlDataPoint
    {
        public float Value { get; set; }
    }

    private class SpikePrediction
    {
        [VectorType(3)]
        public double[] Prediction { get; set; } = Array.Empty<double>();
    }
}