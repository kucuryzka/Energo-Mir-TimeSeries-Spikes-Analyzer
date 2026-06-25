using Core.Models;

namespace Core.Interfaces;


public interface ISpikeDetectionService
{
    IEnumerable<AnomalyResult> DetectSpikes(
        IEnumerable<DataPoint> series,
        double confidence = 95,
        int windowSize = 30
    );
}
