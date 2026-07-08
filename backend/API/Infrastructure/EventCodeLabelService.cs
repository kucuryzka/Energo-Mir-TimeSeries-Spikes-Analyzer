using System.Globalization;

namespace API.Infrastructure;

public class EventCodeLabelService
{
    private readonly Lazy<Dictionary<string, string>> _map;

    public EventCodeLabelService(IHostEnvironment environment)
    {
        _map = new Lazy<Dictionary<string, string>>(() => LoadMap(ResolveCsvPath(environment)));
    }

    public string ResolveLabel(string? eventCode)
    {
        if (string.IsNullOrWhiteSpace(eventCode))
            return "Неизвестный код";

        var raw = eventCode.Trim();
        var map = _map.Value;
        if (map.TryGetValue(raw, out var label))
            return label;

        if (long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var numeric))
        {
            var normalized = numeric.ToString(CultureInfo.InvariantCulture);
            if (map.TryGetValue(normalized, out label))
                return label;
        }

        return raw;
    }

    private static string? ResolveCsvPath(IHostEnvironment environment)
    {
        var candidates = new[]
        {
            Path.Combine(environment.ContentRootPath, "Data", "event_codes.csv"),
            Path.GetFullPath(Path.Combine(environment.ContentRootPath, "..", "..", "frontend", "public", "event_codes.csv")),
        };

        return candidates.FirstOrDefault(File.Exists);
    }

    private static Dictionary<string, string> LoadMap(string? path)
    {
        var map = new Dictionary<string, string>(StringComparer.Ordinal);
        if (path == null || !File.Exists(path))
            return map;

        foreach (var line in File.ReadLines(path))
        {
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith("ID;", StringComparison.Ordinal))
                continue;

            var parts = line.Split(';');
            if (parts.Length < 2)
                continue;

            var id = parts[0].Trim();
            if (id.Length == 0)
                continue;

            var label = parts.Length >= 3
                ? (parts[2].Trim().Length > 0 ? parts[2].Trim() : parts[1].Trim())
                : parts[1].Trim();

            if (label.Length > 0)
                map[id] = label;
        }

        return map;
    }
}
