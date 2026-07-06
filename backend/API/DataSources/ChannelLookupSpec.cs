namespace API.DataSources;

public class ChannelLookupSpec
{
    public required string Schema { get; init; }
    public required string Table { get; init; }
    public required string IdColumn { get; init; }
    public required string NameColumn { get; init; }
}
