namespace FamilyHub.Model;

// Per-language overrides for an event's title and description. Stored as a
// JSON column on CalendarEvent — owners can opt-in via EnableTranslations.
public class EventTranslation
{
    public string Title { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    // Keyed by the canonical (English) option text; value is the translation.
    public Dictionary<string, string> MealOptions { get; set; } = new();
    public Dictionary<string, string> DrinkOptions { get; set; } = new();
}
