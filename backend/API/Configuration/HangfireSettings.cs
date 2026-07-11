namespace API.Configuration;

public class HangfireSettings
{
    public const string SectionName = "Hangfire";

    public string DashboardPrefixPath { get; set; } = "/api/dist";
}
