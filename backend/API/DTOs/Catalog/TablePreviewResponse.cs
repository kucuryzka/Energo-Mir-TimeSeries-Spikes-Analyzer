namespace API.DTOs.Catalog;

public class TablePreviewResponse
{
    public long? ApproximateRowCount { get; set; }
    public List<Dictionary<string, object?>> SampleRows { get; set; } = new();
}
