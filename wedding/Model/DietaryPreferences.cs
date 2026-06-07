using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Model;

public enum DietaryPreference
{
    None = 0,
    Vegan = 1,
    Vegetarian = 2,
    Halal = 3
}

// Owned-style entity attached one-to-one to AppUser. Stored as a separate row
// for easy extension (notes, kosher, etc.) without bloating the user table.
public class DietaryPreferences
{
    public int Id { get; set; }

    public string UserId { get; set; } = string.Empty;
    public AppUser? User { get; set; }

    public DietaryPreference Preference { get; set; } = DietaryPreference.None;

    // Common allergens picked from a fixed list.
    public List<Allergen> Allergens { get; set; } = new();

    // Free-form text for anything not covered by Allergen/Preference.
    [MaxLength(1000)]
    public string CustomAllergens { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string Notes { get; set; } = string.Empty;
}

public enum Allergen
{
    Peanut = 0,
    TreeNut = 1,
    Dairy = 2,
    Egg = 3,
    Soy = 4,
    Wheat = 5,
    Gluten = 6,
    Fish = 7,
    Shellfish = 8,
    Sesame = 9
}
