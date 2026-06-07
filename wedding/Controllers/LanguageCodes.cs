namespace FamilyHub.Controllers;

// Supported BCP-47 language tags. Kept in one place so backend and frontend
// stay in sync; the frontend mirrors this list in `models.ts`.
public static class LanguageCodes
{
    public const string Default = "en";

    public static readonly HashSet<string> Supported = new(StringComparer.OrdinalIgnoreCase)
    {
        "en",
        "nb",
        "pt-BR",
    };

    public static string Normalize(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return Default;
        var trimmed = code.Trim();
        // Match by case-insensitive lookup but return canonical casing.
        foreach (var s in Supported)
            if (s.Equals(trimmed, StringComparison.OrdinalIgnoreCase)) return s;
        return Default;
    }
}
