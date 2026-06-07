namespace FamilyHub.Model;

using System.ComponentModel.DataAnnotations;

// A claim on (some of) a wishlist item. ClaimantUserId is nullable so guests
// can claim anonymously without an account.
public class WishlistClaim
{
    public int Id { get; set; }

    public int ItemId { get; set; }
    public WishlistItem? Item { get; set; }

    public string? ClaimantUserId { get; set; }
    public AppUser? Claimant { get; set; }

    // Free-form label kept when the claim is anonymous, so the owner can
    // tell their guests apart in the claims list.
    [MaxLength(120)] public string ClaimantLabel { get; set; } = string.Empty;

    public int Quantity { get; set; } = 1;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
