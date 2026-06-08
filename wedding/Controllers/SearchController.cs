using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Controllers;

// Unified "go to" search used by the navbar. Returns matching events
// (filtered by effective visibility for the caller) and wishlist items so
// the user can jump to either an event page or the host wishlist.
[ApiController]
[Route("api/search")]
[Authorize]
public class SearchController : ControllerBase
{
    private const int MaxPerKind = 8;

    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;

    public SearchController(AppDbContext db, UserManager<AppUser> users)
    {
        _db = db;
        _users = users;
    }

    [HttpGet]
    public async Task<ActionResult<SearchResultsDto>> Search([FromQuery] string? q)
    {
        var needle = (q ?? string.Empty).Trim();
        if (needle.Length < 2)
            return new SearchResultsDto(new(), new());

        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var allEvents = await _db.Events
            .Include(e => e.Invites)
            .Include(e => e.Images)
            .Include(e => e.CoOwners)
            .ToListAsync();
        var byId = allEvents.ToDictionary(e => e.Id);

        var events = allEvents
            .Where(e => Contains(e.Title, needle) || Contains(e.Location, needle))
            .Where(e => IsEffectivelyVisible(e, uid, byId, new HashSet<int>()))
            .OrderBy(e => e.StartUtc)
            .Take(MaxPerKind)
            .Select(e => new EventSummaryDto(
                e.Id, e.Type, e.Title, e.StartUtc, e.EndUtc, e.Location,
                e.EditorUserIds.Contains(uid),
                e.Images.FirstOrDefault(i => i.Role == ImageRole.Icon)?.Id))
            .ToList();

        var pattern = $"%{needle}%";

        // Normalize the needle so partial typing like "jon w", "jons w",
        // "jon's wishl" all match the same owner. We strip apostrophes and
        // collapse any "s " into a single space on both sides, then append
        // " wishlist" to each owner's display name / event title so the
        // query can substring-match against the combined form.
        var normalizedNeedle = NormalizeOwnerKey(needle);

        // Whole-wishlist hits: events and users with at least one wishlist
        // item, matched by the owner's display name / event title. Item
        // contents are intentionally not searched.
        var eventWishlistOwnerIds = await _db.WishlistItems
            .Where(w => w.EventId != null)
            .Select(w => w.EventId!.Value)
            .Distinct()
            .ToListAsync();
        var userWishlistOwnerIds = (await _db.WishlistItems
            .Where(w => w.OwnerUserId != null)
            .Select(w => w.OwnerUserId!)
            .Distinct()
            .ToListAsync());

        var wishlistOwners = new List<WishlistOwnerHitDto>();
        foreach (var ev in allEvents)
        {
            if (!eventWishlistOwnerIds.Contains(ev.Id)) continue;
            if (!MatchesOwner(ev.Title, needle, normalizedNeedle)) continue;
            wishlistOwners.Add(new WishlistOwnerHitDto(ev.Id, null, ev.Title));
        }
        if (userWishlistOwnerIds.Count > 0)
        {
            var candidates = await _db.Users
                .Where(u => userWishlistOwnerIds.Contains(u.Id))
                .OrderBy(u => u.DisplayName)
                .Select(u => new { u.Id, u.DisplayName })
                .ToListAsync();
            foreach (var u in candidates)
            {
                if (!MatchesOwner(u.DisplayName, needle, normalizedNeedle)) continue;
                wishlistOwners.Add(new WishlistOwnerHitDto(null, u.Id, u.DisplayName));
            }
        }
        wishlistOwners = wishlistOwners.Take(MaxPerKind).ToList();

        return new SearchResultsDto(events, wishlistOwners);
    }

    private static bool Contains(string? haystack, string needle)
        => !string.IsNullOrEmpty(haystack)
           && haystack.Contains(needle, StringComparison.OrdinalIgnoreCase);

    private static bool MatchesOwner(string? name, string needle, string normalizedNeedle)
    {
        if (string.IsNullOrEmpty(name)) return false;
        if (name.Contains(needle, StringComparison.OrdinalIgnoreCase)) return true;
        var key = NormalizeOwnerKey(name + " wishlist");
        return key.Contains(normalizedNeedle, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeOwnerKey(string s)
        => s.Replace("'", "")
            .Replace("\u2019", "")
            .Replace("s ", " ", StringComparison.OrdinalIgnoreCase);

    // Mirrors EventsController.IsEffectivelyVisible — kept private here so
    // the search has its own copy without exposing an internal helper.
    private static bool IsEffectivelyVisible(
        CalendarEvent ev,
        string uid,
        IReadOnlyDictionary<int, CalendarEvent> byId,
        HashSet<int> seen)
    {
        if (!seen.Add(ev.Id)) return false;
        if (ev.EditorUserIds.Contains(uid)) return true;
        if (ev.Visibility == EventVisibility.Private) return false;
        if (ev.Visibility == EventVisibility.Open) return true;
        if (ev.Invites.Any(i => i.InviteeId == uid)) return true;
        if (ev.InheritParentInvites && ev.ParentEventId.HasValue
            && byId.TryGetValue(ev.ParentEventId.Value, out var parent))
            return IsEffectivelyVisible(parent, uid, byId, seen);
        return false;
    }
}

public sealed record SearchResultsDto(
    List<EventSummaryDto> Events,
    List<WishlistOwnerHitDto> Wishlists);

public sealed record WishlistOwnerHitDto(
    int? EventId,
    string? OwnerUserId,
    string DisplayName);
