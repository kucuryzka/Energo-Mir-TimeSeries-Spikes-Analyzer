namespace API.Configuration;

public class CorsSettings
{
    public const string SectionName = "Cors";

    public string[] AllowedOrigins { get; set; } =
    [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost"
    ];
}
