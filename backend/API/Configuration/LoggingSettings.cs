namespace API.Configuration;

public class LoggingSettings
{
    public const string SectionName = "Logging:File";

    public bool Enabled { get; set; } = true;

    public string Directory { get; set; } = "logs";

    public string MinLevel { get; set; } = "Information";
}
