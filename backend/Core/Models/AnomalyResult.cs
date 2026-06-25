namespace Core.Models;


// result whether a point is a spike or not
public class AnomalyResult
{
    public DateTime Timestamp { get; set; }
    public int Value { get; set; }
    public bool IsSpike { get; set; }
    public double PValue { get; set; }
}