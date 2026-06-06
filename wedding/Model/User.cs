using System.Text.Json.Serialization;

namespace wedding.Model;

public sealed class User
{
    [JsonPropertyName("fullName")]
    public string FullName { get; set; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string DisplayName { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [JsonPropertyName("pat")]
    public string Pat { get; set; } = string.Empty;

    [JsonPropertyName("addedToCalendar")]
    public bool AddedToCalendar { get; set; }

    [JsonPropertyName("lastVersionSeen")]
    public int LastVersionSeen { get; set; }

    [JsonPropertyName("lastAnnouncementSeen")]
    public int LastAnnouncementSeen { get; set; } = -1;

    [JsonPropertyName("admin")]
    public bool Admin { get; set; }

    [JsonPropertyName("locale")]
    public string Locale { get; set; } = string.Empty;

    [JsonPropertyName("allergies")]
    public List<string> Allergies { get; set; } = new();

    [JsonPropertyName("eventChoices")]
    public Dictionary<string, GuestEventChoice> EventChoices { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class GuestEventChoice
{
    [JsonPropertyName("meal")]
    public string Meal { get; set; } = string.Empty;

    [JsonPropertyName("drink")]
    public string Drink { get; set; } = string.Empty;

    [JsonPropertyName("rsvp")]
    public string Rsvp { get; set; } = string.Empty;
}