namespace API.Configuration;

public class AnalysisSettings
{
    public const string SectionName = "Analysis";

    public int CommandTimeoutSeconds { get; set; } = 86400;

    public int BatchIntervalDays { get; set; } = 7;

    public int HangfireWorkerCount { get; set; } = 2;

    public int HangfireSupplementWorkerCount { get; set; } = 1;

    public int HangfireJobInvisibilityTimeoutHours { get; set; } = 720;

    public string ResultsDirectory { get; set; } = "results";

    public int MaxAnalysisRangeDays { get; set; } = 3650;

    public int MaxSeriesPoints { get; set; } = 500_000;

    public int PreviewCommandTimeoutSeconds { get; set; } = 120;

    public long PreviewOrderedSampleMaxRows { get; set; } = 500_000;
}
