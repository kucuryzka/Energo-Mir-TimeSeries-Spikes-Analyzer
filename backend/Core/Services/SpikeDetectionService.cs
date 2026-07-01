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

        if (data.Count < windowSize)
        {
            return data.Select(p => new AnomalyResult
            {
                Timestamp = p.Timestamp,
                Value = p.Value,
                IsSpike = false,
                PValue = 1.0
                
            });
        }

        var dataView = _mlContext.Data.LoadFromEnumerable(data);

        var pipeline = _mlContext.Transforms.DetectIidSpike(
            outputColumnName: nameof(SpikePrediction.Prediction),
            inputColumnName: nameof(DataPoint.Value),
            confidence: confidence,
            pvalueHistoryLength: windowSize
        );

        var model = pipeline.Fit(dataView);
        var transformedData = model.Transform(dataView);

        var predictions = _mlContext.Data.CreateEnumerable<SpikePrediction>(transformedData, reuseRowObject: false).ToList();

        var results = new List<AnomalyResult>();
        for (int i = 0; i < data.Count; i++)
        {
            var pred = predictions[i];

            results.Add(new AnomalyResult
            {
                Timestamp = data[i].Timestamp,
                Value = data[i].Value,
                IsSpike = pred.Prediction[0] == 1,
                PValue = pred.Prediction[2]
            });
        } 

        return results;
    }

    private class SpikePrediction
    {
        [VectorType(3)]
        public double[] Prediction { get; set; } = Array.Empty<double>();
    }
}