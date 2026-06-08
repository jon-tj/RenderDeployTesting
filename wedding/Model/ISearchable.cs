namespace FamilyHub.Model;

// Anything that can show up in the navbar's global "go to" search. The
// interface lets the search controller treat events, wishlists, and
// anything we add later (people, albums, …) uniformly.
public interface ISearchable
{
    // Stable kind label that the frontend uses to route the click.
    SearchableKind SearchableKind { get; }

    // Primary key the frontend navigates with (e.g. event id, wishlist id).
    int SearchableId { get; }

    // The display title shown in the search dropdown.
    string SearchableTitle { get; }

    // Optional secondary line (e.g. "Personal wishlist", event location).
    string? SearchableSubtitle { get; }

    // Optional icon image id (event Icon role, etc.) for thumbnails.
    int? SearchableIconImageId { get; }

    // Whether the given needle matches this item. Each implementation owns
    // its own normalization (e.g. wishlists fold the owner's display name
    // with " wishlist" so "jons w" still hits).
    bool MatchesSearch(string needle);
}

public enum SearchableKind
{
    Event = 0,
    Wishlist = 1,
}

// Tiny shared helpers for substring matching. Lives here so every
// ISearchable implementation matches identically.
public static class SearchMatch
{
    public static bool Contains(string? haystack, string needle)
        => !string.IsNullOrEmpty(haystack)
            && haystack.Contains(needle, StringComparison.OrdinalIgnoreCase);

    // Strips apostrophes and collapses "s " into a single space so that
    // "jon w", "jons w" and "jon's wishl" all match "Jon's wishlist".
    public static string NormalizeOwnerKey(string s)
        => s.Replace("'", "")
            .Replace("\u2019", "")
            .Replace("s ", " ", StringComparison.OrdinalIgnoreCase);
}
