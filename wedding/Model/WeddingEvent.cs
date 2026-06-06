using System.Text.Json.Serialization;

namespace wedding.Model;

public sealed class WeddingEvent
{
    [JsonPropertyName("place")]
    public string Place { get; set; } = "Venue TBD";

    [JsonPropertyName("venueName")]
    public string VenueName { get; set; } = string.Empty;

    [JsonPropertyName("mapQuery")]
    public string MapQuery { get; set; } = string.Empty;

    [JsonPropertyName("time")]
    public DateTimeOffset Time { get; set; } = DateTimeOffset.UtcNow;

    [JsonPropertyName("dressCode")]
    public string DressCode { get; set; } = string.Empty;

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = string.Empty;

    [JsonPropertyName("mealOptions")]
    public List<MealOption> MealOptions { get; set; } = new();
}

public sealed class MealOption
{
    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("price")]
    public decimal Price { get; set; }
}
