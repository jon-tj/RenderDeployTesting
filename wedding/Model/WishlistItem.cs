namespace FamilyHub.Model;

using System.ComponentModel.DataAnnotations;

public enum WishlistCurrency { BRL = 0, NOK = 1, USD = 2 }

// A single thing on a wishlist. The wishlist itself carries the owner
// (event or user) and all wishlist-level settings; items just point back
// to it via WishlistId.
public class WishlistItem
{
    public int Id { get; set; }

    public int WishlistId { get; set; }
    public Wishlist? Wishlist { get; set; }

    [Required, MaxLength(200)] public string Name { get; set; } = string.Empty;
    [MaxLength(2000)] public string Description { get; set; } = string.Empty;
    [MaxLength(500)] public string Url { get; set; } = string.Empty;
    [MaxLength(500)] public string ImageUrl { get; set; } = string.Empty;

    // Optional uploaded image bytes. When present, the frontend uses
    // /api/wishlist/{id}/image to render instead of ImageUrl.
    public byte[]? ImageData { get; set; }
    [MaxLength(100)] public string ImageContentType { get; set; } = string.Empty;

    // Stored in minor units of the chosen currency (e.g. cents/øre/centavos).
    public long PriceMinor { get; set; }
    public WishlistCurrency Currency { get; set; } = WishlistCurrency.BRL;

    // How many of this item the owner wants. Claims sum up against this
    // when the wishlist's ClaimMode is LimitedQuantities.
    public int WishedQuantity { get; set; } = 1;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<WishlistClaim> Claims { get; set; } = new();
}
