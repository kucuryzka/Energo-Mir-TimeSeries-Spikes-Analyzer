using System.Text.RegularExpressions;

namespace API.Infrastructure.Database;

public static partial class SqlIdentifier
{
    [GeneratedRegex(@"^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.CultureInvariant)]
    private static partial Regex SafeNameRegex();

    public static bool IsSafe(string? name) =>
        !string.IsNullOrEmpty(name) && SafeNameRegex().IsMatch(name);

    public static string EnsureSafe(string? name, string paramName)
    {
        if (!IsSafe(name))
            throw new ArgumentException(
                $"Invalid SQL identifier '{paramName}': only letters, digits and underscore are allowed, and it must not start with a digit.",
                paramName
            );

        return name!;
    }

    public static void EnsureSafeMany(params (string? Value, string Name)[] identifiers)
    {
        foreach (var (value, name) in identifiers)
            EnsureSafe(value, name);
    }

    public static string EscapeForSqlServer(string identifier) =>
        identifier.Replace("]", "]]", StringComparison.Ordinal);

    public static string EscapeForPostgres(string identifier) =>
        identifier.Replace("\"", "\"\"", StringComparison.Ordinal);
}
