namespace FamilyHub.Model;

using System.ComponentModel.DataAnnotations;

// A wishlist belongs to exactly one owner — either a CalendarEvent (any of
// its editors can manage it) or an AppUser (only that user). The owner is
// kept on the wishlist itself, so all wishlist-level settings (claim mode,
// Pix key) and the items collection live in one place.
public class Wishlist
{
    public int Id { get; set; }

    public int? EventId { get; set; }
    public CalendarEvent? Event { get; set; }

    public string? OwnerUserId { get; set; }
    public AppUser? Owner { get; set; }

    public WishlistClaimMode ClaimMode { get; set; } = WishlistClaimMode.LimitedQuantities;

    // Optional Pix key shown to guests so they can pay the owner back.
    [MaxLength(200)] public string PixKey { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<WishlistItem> Items { get; set; } = new();
}
