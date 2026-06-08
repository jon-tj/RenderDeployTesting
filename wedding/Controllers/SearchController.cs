using FamilyHub.Data;
using FamilyHub.Model;
using FamilyHub.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Controllers;

// Unified "go to" search used by the navbar. Iterates every ISearchable in
// the database and returns a single flat hit list. Per-kind access control
// (currently: only event visibility) is applied before adding a hit.
[ApiController]
[Route("api/search")]
[Authorize]
public class SearchController : ControllerBase
{
    private const int MaxHits = 16;
    private const int MaxPerKind = 8;
    private const int MinNeedleLength = 2;

    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;

    public SearchController(AppDbContext db, UserManager<AppUser> users)
    {
        _db = db;
        _users = users;
    }

    [HttpGet]
    public async Task<ActionResult<List<SearchHitDto>>> Search([FromQuery] string? q)
    {
        var needle = (q ?? string.Empty).Trim();
        if (needle.Length < MinNeedleLength) return new List<SearchHitDto>();

        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var allEvents = await _db.Events
            .Include(e => e.Invites)
            .Include(e => e.Images)
            .Include(e => e.CoOwners)
            .ToListAsync();
        var eventsById = allEvents.ToDictionary(e => e.Id);

        var allWishlists = await _db.Wishlists
            .Include(w => w.Event)
            .Include(w => w.Owner)
            .ToListAsync();

        // Funnel everything through ISearchable. Adding a new searchable
        // entity is now just: implement the interface + include it here.
        IEnumerable<ISearchable> candidates = allEvents.Cast<ISearchable>().Concat(allWishlists);

        var hits = new List<SearchHitDto>();
        var perKind = new Dictionary<SearchableKind, int>();
        foreach (var item in candidates)
        {
            if (!item.MatchesSearch(needle)) continue;
            if (!IsAccessible(item, uid, eventsById)) continue;

            perKind.TryGetValue(item.SearchableKind, out var taken);
            if (taken >= MaxPerKind) continue;
            perKind[item.SearchableKind] = taken + 1;

            hits.Add(SearchHitDto.From(item));
            if (hits.Count >= MaxHits) break;
        }
        return hits;
    }

    // Per-kind access rules. Events use the shared visibility helper;
    // wishlists are public (anyone with the link can browse them anyway).
    private static bool IsAccessible(
        ISearchable item,
        string uid,
        IReadOnlyDictionary<int, CalendarEvent> eventsById) => item switch
    {
        CalendarEvent ev => EventAccess.IsVisibleTo(ev, uid, eventsById),
        Wishlist => true,
        _ => false,
    };
}

public sealed record SearchHitDto(
    SearchableKind Kind,
    int Id,
    string Title,
    string? Subtitle,
    int? IconImageId)
{
    public static SearchHitDto From(ISearchable s) => new(
        s.SearchableKind,
        s.SearchableId,
        s.SearchableTitle,
        s.SearchableSubtitle,
        s.SearchableIconImageId);
}
