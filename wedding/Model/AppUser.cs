using Microsoft.AspNetCore.Identity;
using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Model;

// Identity-managed user that doubles as the root entity for the family hub.
// Domain-specific fields live here; auth fields are inherited from IdentityUser.
public class AppUser : IdentityUser, IAssetOwner
{
    [MaxLength(120)]
    public string DisplayName { get; set; } = string.Empty;

    // BCP-47 language tag (e.g. "en", "nb", "pt-BR"). Drives which event
    // title/description translation is shown to this user.
    [MaxLength(10)]
    public string PreferredLanguage { get; set; } = "en";

    // Permission flags. Keep as discrete bools for now; promote to a join table
    // once the matrix of capabilities grows beyond a handful.
    public bool CanCreateWeddingEvent { get; set; }
    public bool CanCreateFamilyGathering { get; set; }

    public DietaryPreferences DietaryPreferences { get; set; } = new();

    // Pix key shown at the bottom of this user's personal wishlist so guests
    // know where to send the money. Owned by the wishlist as a whole rather
    // than by individual items.
    [MaxLength(200)]
    public string WishlistPixKey { get; set; } = string.Empty;

    // Whether/how guests can claim items on this user's personal wishlist.
    public WishlistClaimMode WishlistClaimMode { get; set; } = WishlistClaimMode.LimitedQuantities;

    // IAssetOwner: only the user themselves can edit their own assets.
    public IReadOnlyCollection<string> EditorUserIds => new[] { Id };
}
