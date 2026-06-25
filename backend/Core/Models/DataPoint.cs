namespace Core.Models;


// several call records grouped by custom interval
public class DataPoint
{
    public DateTime Timestamp { get; }
    public int Value { get; }
}