using Core.Models;

namespace API.DTOs;

public sealed class AnalysisResumeState
{
    public DateTime? ProcessedUntil { get; init; }
    public IReadOnlyList<DataPoint>? SeedSeries { get; init; }
}
