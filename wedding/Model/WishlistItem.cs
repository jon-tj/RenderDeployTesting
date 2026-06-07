namespace FamilyHub.Model;

using System.ComponentModel.DataAnnotations;

public enum WishlistCurrency { BRL = 0, NOK = 1, USD = 2 }

// A single thing on someone's wishlist. Owned by a user (not an event); the
// wedding page links to the bride/groom's wishlist directly.
public class WishlistItem
{
    public int Id { get; set; }

    [Required] public string OwnerUserId { get; set; } = string.Empty;
    public AppUser? Owner { get; set; }

    [Required, MaxLength(200)] public string Name { get; set; } = string.Empty;
    [MaxLength(2000)] public string Description { get; set; } = string.Empty;
    [MaxLength(500)] public string Url { get; set; } = string.Empty;
    [MaxLength(500)] public string ImageUrl { get; set; } = string.Empty;

    // Stored in minor units of the chosen currency (e.g. cents/øre/centavos).
    public long PriceMinor { get; set; }
    public WishlistCurrency Currency { get; set; } = WishlistCurrency.BRL;

    // Optional Pix key for BRL-denominated items so guests can pay directly.
    [MaxLength(200)] public string PixKey { get; set; } = string.Empty;

    // How many of this item the owner wants. Claims sum up against this.
    public int WishedQuantity { get; set; } = 1;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<WishlistClaim> Claims { get; set; } = new();
}
