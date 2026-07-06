namespace API.DataSources;

public class AnalysisTableSpec
{
    public required string Schema { get; init; }
    public required string Table { get; init; }
    public required string TimeColumn { get; init; }
    public string? ChannelColumn { get; init; }
    public string? FromClause { get; init; }
    public string? TableAlias { get; init; }
    public ChannelLookupSpec? ChannelLookup { get; init; }
}
