namespace Core.Models;


// a single call (db row)
public class Record
{
    public int Id { get; set; }
    public int ChannelId { get; set; }
    public DateTime EventTime { get; set; }
}