namespace Core.Models;


// several call records grouped by custom interval
public class DataPoint
{
    public DateTime Timestamp { get; set;}
    public int Value { get; set; }
    public Dictionary<int, int> ChannelBreakdown { get; set; } = new();
}