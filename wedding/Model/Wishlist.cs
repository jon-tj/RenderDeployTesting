namespace FamilyHub.Model;

using System.ComponentModel.DataAnnotations;

// A wishlist belongs to exactly one owner — either a CalendarEvent (any of
// its editors can manage it) or an AppUser (only that user). The owner is
// kept on the wishlist itself, so all wishlist-level settings (claim mode,
// Pix key) and the items collection live in one place.
public class Wishlist : ISearchable
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

    // ISearchable: a wishlist's title is its owner's display name; the
    // subtitle distinguishes event vs personal so the dropdown isn't
    // ambiguous when two wishlists share a name. Requires Event/Owner to be
    // Include()'d by the caller.
    public SearchableKind SearchableKind => SearchableKind.Wishlist;
    public int SearchableId => Id;
    public string SearchableTitle => Event?.Title ?? Owner?.DisplayName ?? string.Empty;
    public string? SearchableSubtitle => Event is not null ? "Event wishlist" : "Personal wishlist";
    public int? SearchableIconImageId => null;

    public bool MatchesSearch(string needle)
    {
        var title = SearchableTitle;
        if (string.IsNullOrEmpty(title)) return false;
        if (SearchMatch.Contains(title, needle)) return true;
        // Also let "<name> wishlist" partials hit, normalized so "jons w" works.
        var normalizedNeedle = SearchMatch.NormalizeOwnerKey(needle);
        var key = SearchMatch.NormalizeOwnerKey(title + " wishlist");
        return key.Contains(normalizedNeedle, StringComparison.OrdinalIgnoreCase);
    }
}
