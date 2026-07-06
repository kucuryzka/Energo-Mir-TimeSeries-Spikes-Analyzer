namespace API.Configuration;

public class AnalysisSettings
{
    public const string SectionName = "Analysis";

    public int CommandTimeoutSeconds { get; set; } = 86400;

    public int ConnectionTimeoutSeconds { get; set; } = 15;

    public int BatchIntervalDays { get; set; } = 7;

    public int HangfireWorkerCount { get; set; } = 2;

    public int HangfireJobInvisibilityTimeoutHours { get; set; } = 24;

    public string ResultsDirectory { get; set; } = "results";

    public int MaxAnalysisRangeDays { get; set; } = 3650;

    public int MaxSeriesPoints { get; set; } = 500_000;

    public int ProgressSaveIntervalSeconds { get; set; } = 5;

    /// <summary>Timeout for lightweight table preview queries (seconds).</summary>
    public int PreviewCommandTimeoutSeconds { get; set; } = 120;
}
