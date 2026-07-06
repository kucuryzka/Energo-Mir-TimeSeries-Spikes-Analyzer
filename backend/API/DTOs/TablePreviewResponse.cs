namespace API.DTOs;

public class TablePreviewResponse
{
    public DateTime? MinDate { get; set; }
    public DateTime? MaxDate { get; set; }
    public long? ApproximateRowCount { get; set; }
    public List<Dictionary<string, object?>> EarliestRows { get; set; } = new();
    public List<Dictionary<string, object?>> LatestRows { get; set; } = new();
}
