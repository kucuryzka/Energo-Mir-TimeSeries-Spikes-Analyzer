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
    /// <summary>
    /// When true, distribution is not computed per batch; a single query runs after all batches.
    /// </summary>
    public bool DeferDistribution { get; init; }

    /// <summary>
    /// When true, distribution is omitted from the analysis job; load on demand via API.
    /// </summary>
    public bool OmitDistribution { get; init; }
}
