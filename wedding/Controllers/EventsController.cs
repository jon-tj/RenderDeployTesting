using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Controllers;

[ApiController]
[Route("api/events")]
[Authorize]
public class EventsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;

    public EventsController(AppDbContext db, UserManager<AppUser> users)
    {
        _db = db;
        _users = users;
    }

    // Events visible to the current user: created by them, directly invited,
    // or invited to an ancestor whose child opted into invite inheritance.
    // We fetch in two passes so the recursive visibility walk works for any
    // depth without N+1 round-trips.
    [HttpGet]
    public async Task<ActionResult<List<EventSummaryDto>>> List(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var all = await _db.Events
            .Include(e => e.Invites)
            .Include(e => e.Images)
            .ToListAsync();
        var byId = all.ToDictionary(e => e.Id);

        return all
            .Where(e => (!from.HasValue || e.EndUtc >= from.Value)
                     && (!to.HasValue || e.StartUtc <= to.Value))
            .Where(e => IsEffectivelyVisible(e, uid, byId, new HashSet<int>()))
            .OrderBy(e => e.StartUtc)
            .Select(e => new EventSummaryDto(
                e.Id, e.Type, e.Title, e.StartUtc, e.EndUtc, e.Location, e.CreatedById == uid,
                e.Images.FirstOrDefault(i => i.Role == ImageRole.Icon)?.Id))
            .ToList();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<EventDetailDto>> Get(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.CreatedBy)
            .Include(e => e.ParentEvent)
            .Include(e => e.Children).ThenInclude(c => c.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.Images)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();

        if (!await IsVisibleViaInheritanceAsync(ev, uid))
            return Forbid();

        return EventDetailDto.From(ev, uid);
    }

    // Candidates the current user can attach as children of `id`: events they
    // own, not already children of anything, with no children of their own,
    // and obviously not the parent itself.
    [HttpGet("{id:int}/child-candidates")]
    public async Task<ActionResult<List<EventSummaryDto>>> ChildCandidates(int id, [FromQuery] string? q)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var parent = await _db.Events.FindAsync(id);
        if (parent is null) return NotFound();
        if (parent.CreatedById != uid) return Forbid();
        if (parent.ParentEventId is not null) return new List<EventSummaryDto>();

        var query = _db.Events
            .Where(e => e.Id != id
                && e.CreatedById == uid
                && e.ParentEventId == null
                && !e.Children.Any());

        if (!string.IsNullOrWhiteSpace(q))
        {
            var needle = q.Trim();
            query = query.Where(e => EF.Functions.Like(e.Title, $"%{needle}%"));
        }

        return await query
            .OrderBy(e => e.StartUtc)
            .Take(10)
            .Select(e => new EventSummaryDto(
                e.Id, e.Type, e.Title, e.StartUtc, e.EndUtc, e.Location, true,
                e.Images.Where(i => i.Role == ImageRole.Icon).Select(i => (int?)i.Id).FirstOrDefault()))
            .ToListAsync();
    }

    // Create a blank event for the calendar-click flow. The detail page then
    // PUTs the actual values. Defaults to a 1-hour slot on the requested day.
    [HttpPost]
    public async Task<ActionResult<EventDetailDto>> Create([FromBody] CreateEventDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var user = await _users.FindByIdAsync(uid);
        if (user is null) return Unauthorized();

        // If we're being created under a parent, default the start to the
        // parent's start so child events land on the same day by default.
        CalendarEvent? parent = null;
        if (dto.ParentEventId.HasValue)
        {
            var parentCheck = await ValidateParentAsync(dto.ParentEventId.Value, uid, attachingEventId: null);
            if (parentCheck is not null) return parentCheck;
            parent = await _db.Events.FindAsync(dto.ParentEventId.Value);
        }

        var start = dto.StartUtc ?? parent?.StartUtc ?? DateTime.UtcNow.Date.AddHours(12);
        var ev = new CalendarEvent
        {
            Type = dto.Type ?? EventType.FamilyGathering,
            Title = string.IsNullOrWhiteSpace(dto.Title) ? "Untitled event" : dto.Title.Trim(),
            StartUtc = start,
            EndUtc = dto.EndUtc ?? start.AddHours(1),
            CreatedById = uid,
            ParentEventId = parent?.Id,
            // Default child events to inherit so invitees of the parent
            // automatically see them; owners can toggle this off in the editor.
            InheritParentInvites = parent is not null,
        };

        if (!CanCreateType(user, ev.Type))
            return Forbid();

        _db.Events.Add(ev);
        await _db.SaveChangesAsync();

        await _db.Entry(ev).Reference(e => e.CreatedBy).LoadAsync();
        return EventDetailDto.From(ev, uid);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<EventDetailDto>> Update(int id, [FromBody] UpdateEventDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.CreatedBy)
            .Include(e => e.ParentEvent)
            .Include(e => e.Children)
            .Include(e => e.Images)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (ev.CreatedById != uid) return Forbid();

        if (dto.Type.HasValue)
        {
            var user = await _users.FindByIdAsync(uid);
            if (user is null || !CanCreateType(user, dto.Type.Value)) return Forbid();
            ev.Type = dto.Type.Value;
        }
        if (dto.Title is not null) ev.Title = dto.Title.Trim();
        if (dto.Description is not null) ev.Description = dto.Description;
        if (dto.Location is not null) ev.Location = dto.Location;
        if (dto.StartUtc.HasValue) ev.StartUtc = dto.StartUtc.Value;
        if (dto.EndUtc.HasValue) ev.EndUtc = dto.EndUtc.Value;
        if (dto.MealOptions is not null) ev.MealOptions = NormalizeOptions(dto.MealOptions);
        if (dto.DrinkOptions is not null) ev.DrinkOptions = NormalizeOptions(dto.DrinkOptions);
        if (dto.InheritParentInvites.HasValue) ev.InheritParentInvites = dto.InheritParentInvites.Value;
        if (dto.CollectChildRsvps.HasValue) ev.CollectChildRsvps = dto.CollectChildRsvps.Value;
        if (dto.AllowGuestAlbumUploads.HasValue) ev.AllowGuestAlbumUploads = dto.AllowGuestAlbumUploads.Value;

        if (dto.ParentEventId.HasValue)
        {
            // Treat 0 / negative as "detach". Anything else is a real parent.
            var newParentId = dto.ParentEventId.Value <= 0 ? (int?)null : dto.ParentEventId.Value;
            if (newParentId != ev.ParentEventId)
            {
                if (newParentId is null)
                {
                    ev.ParentEventId = null;
                }
                else
                {
                    if (ev.Children.Any())
                        return BadRequest("Recursive event depth can not exceed 1.");
                    var parentCheck = await ValidateParentAsync(newParentId.Value, uid, attachingEventId: ev.Id);
                    if (parentCheck is not null) return parentCheck;
                    ev.ParentEventId = newParentId;
                }
            }
        }

        // Drop choices that no longer match the option list so the data stays
        // consistent when an option is renamed or removed.
        foreach (var inv in ev.Invites)
        {
            if (inv.MealChoice is not null && !ev.MealOptions.Contains(inv.MealChoice))
                inv.MealChoice = null;
            if (inv.DrinkChoice is not null && !ev.DrinkOptions.Contains(inv.DrinkChoice))
                inv.DrinkChoice = null;
        }

        await _db.SaveChangesAsync();
        return EventDetailDto.From(ev, uid);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.FindAsync(id);
        if (ev is null) return NotFound();
        if (ev.CreatedById != uid) return Forbid();

        _db.Events.Remove(ev);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:int}/invites")]
    public async Task<ActionResult<InviteDto>> AddInvite(int id, [FromBody] AddInviteDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.FindAsync(id);
        if (ev is null) return NotFound();
        if (ev.CreatedById != uid) return Forbid();

        var invitee = await _users.FindByIdAsync(dto.UserId);
        if (invitee is null) return BadRequest("User not found.");

        var existing = await _db.Invites.FirstOrDefaultAsync(i => i.EventId == id && i.InviteeId == dto.UserId);
        if (existing is not null) return InviteDto.From(existing, invitee);

        var invite = new EventInvite
        {
            EventId = id,
            InviteeId = dto.UserId,
            Status = InviteStatus.Pending,
        };
        _db.Invites.Add(invite);
        await _db.SaveChangesAsync();

        return InviteDto.From(invite, invitee);
    }

    [HttpDelete("{id:int}/invites/{inviteId:int}")]
    public async Task<IActionResult> RemoveInvite(int id, int inviteId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.FindAsync(id);
        if (ev is null) return NotFound();
        if (ev.CreatedById != uid) return Forbid();

        var invite = await _db.Invites.FirstOrDefaultAsync(i => i.Id == inviteId && i.EventId == id);
        if (invite is null) return NotFound();

        // Mirror the RSVP ripple: removing a user's invite from the parent
        // also strips their rippled/inherited RSVP rows from all descendants.
        // We can't tell rippled rows apart from independent ones, so the
        // owner is expected to re-add the user on any sub-event they still
        // want them on. Walks the tree breadth-first; cycle-safe via `seen`.
        var inviteeId = invite.InviteeId;
        var descendantIds = new List<int>();
        var seen = new HashSet<int> { id };
        var frontier = new List<int> { id };
        while (frontier.Count > 0)
        {
            var children = await _db.Events
                .Where(e => e.ParentEventId != null && frontier.Contains(e.ParentEventId.Value))
                .Select(e => e.Id)
                .ToListAsync();
            var next = new List<int>();
            foreach (var cid in children)
            {
                if (seen.Add(cid))
                {
                    descendantIds.Add(cid);
                    next.Add(cid);
                }
            }
            frontier = next;
        }

        _db.Invites.Remove(invite);
        if (descendantIds.Count > 0)
        {
            var descendantInvites = await _db.Invites
                .Where(i => i.InviteeId == inviteeId && descendantIds.Contains(i.EventId))
                .ToListAsync();
            _db.Invites.RemoveRange(descendantInvites);
        }
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Lets an invitee set their own RSVP / meal / drink. If the user has no
    // direct invite row but can see the event via inheritance, we create one
    // on the fly. When the event is in "collected" mode, the status ripples
    // to all child events (creating child invite rows as needed).
    [HttpPut("{id:int}/rsvp")]
    public async Task<ActionResult<InviteDto>> Rsvp(int id, [FromBody] RsvpDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.ParentEvent)
            .Include(e => e.Children).ThenInclude(c => c.Invites)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();

        if (!await IsVisibleViaInheritanceAsync(ev, uid))
            return Forbid();

        var invite = ev.Invites.FirstOrDefault(i => i.InviteeId == uid);
        if (invite is null)
        {
            invite = new EventInvite
            {
                EventId = ev.Id,
                InviteeId = uid,
                Status = InviteStatus.Pending,
            };
            ev.Invites.Add(invite);
            _db.Invites.Add(invite);
            await _db.Entry(invite).Reference(i => i.Invitee).LoadAsync();
        }

        if (dto.Status.HasValue) invite.Status = dto.Status.Value;

        // null = "keep current"; empty string = "clear". Any non-empty value
        // must match an option offered by the event.
        if (dto.MealChoice is not null)
        {
            var choice = dto.MealChoice.Trim();
            if (choice.Length == 0) invite.MealChoice = null;
            else if (ev.MealOptions.Contains(choice)) invite.MealChoice = choice;
            else return BadRequest("Meal choice is not one of the available options.");
        }
        if (dto.DrinkChoice is not null)
        {
            var choice = dto.DrinkChoice.Trim();
            if (choice.Length == 0) invite.DrinkChoice = null;
            else if (ev.DrinkOptions.Contains(choice)) invite.DrinkChoice = choice;
            else return BadRequest("Drink choice is not one of the available options.");
        }

        // Ripple status only — children have their own meal/drink option lists.
        if (ev.CollectChildRsvps && dto.Status.HasValue)
        {
            foreach (var child in ev.Children)
            {
                var childInvite = child.Invites.FirstOrDefault(i => i.InviteeId == uid);
                if (childInvite is null)
                {
                    childInvite = new EventInvite
                    {
                        EventId = child.Id,
                        InviteeId = uid,
                        Status = dto.Status.Value,
                    };
                    child.Invites.Add(childInvite);
                    _db.Invites.Add(childInvite);
                }
                else
                {
                    childInvite.Status = dto.Status.Value;
                }
            }
        }

        await _db.SaveChangesAsync();
        if (invite.Invitee is null)
            await _db.Entry(invite).Reference(i => i.Invitee).LoadAsync();
        return InviteDto.From(invite, invite.Invitee);
    }

    // Serves the raw image bytes. Anyone who can see the event can download.
    [HttpGet("{id:int}/images/{imageId:int}")]
    public async Task<IActionResult> GetImage(int id, int imageId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.Invites)
            .Include(e => e.ParentEvent)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!await IsVisibleViaInheritanceAsync(ev, uid)) return Forbid();

        var img = await _db.Images.FirstOrDefaultAsync(i => i.Id == imageId && i.EventId == id);
        if (img is null) return NotFound();

        return File(img.Data, string.IsNullOrEmpty(img.ContentType) ? "application/octet-stream" : img.ContentType);
    }

    // Owner can upload any role. Non-owners may only upload Album images,
    // and only when AllowGuestAlbumUploads is enabled. Banner and Icon are
    // singletons per event — uploading a new one replaces the existing.
    [HttpPost("{id:int}/images")]
    [RequestSizeLimit(20_000_000)] // 20 MB ceiling per upload.
    public async Task<ActionResult<EventImageDto>> UploadImage(
        int id,
        [FromForm] ImageUploadDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.Invites)
            .Include(e => e.ParentEvent)
            .Include(e => e.Images)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!await IsVisibleViaInheritanceAsync(ev, uid)) return Forbid();

        var isOwner = ev.CreatedById == uid;
        if (!isOwner && (dto.Role != ImageRole.Album || !ev.AllowGuestAlbumUploads))
            return Forbid();

        if (dto.File is null || dto.File.Length == 0) return BadRequest("File is required.");
        if (!dto.File.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest("File must be an image.");

        // Banner and Icon are unique — replace the existing one.
        if (dto.Role == ImageRole.Banner || dto.Role == ImageRole.Icon)
        {
            var existing = ev.Images.Where(i => i.Role == dto.Role).ToList();
            foreach (var e in existing) _db.Images.Remove(e);
        }

        using var ms = new MemoryStream();
        await dto.File.CopyToAsync(ms);

        var img = new EventImage
        {
            EventId = ev.Id,
            Role = dto.Role,
            Description = (dto.Description ?? string.Empty).Trim(),
            FileName = Path.GetFileName(dto.File.FileName) ?? string.Empty,
            ContentType = dto.File.ContentType,
            Data = ms.ToArray(),
            UploadedById = uid,
            UploadedAtUtc = DateTime.UtcNow,
        };
        _db.Images.Add(img);
        await _db.SaveChangesAsync();

        return EventImageDto.From(img, uid, ev.CreatedById);
    }

    // Update description (anyone with edit rights). Only the event owner can
    // change the role — guests' album uploads stay as Album.
    [HttpPut("{id:int}/images/{imageId:int}")]
    public async Task<ActionResult<EventImageDto>> UpdateImage(
        int id,
        int imageId,
        [FromBody] ImageUpdateDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.Images)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();

        var img = ev.Images.FirstOrDefault(i => i.Id == imageId);
        if (img is null) return NotFound();

        var isOwner = ev.CreatedById == uid;
        if (!isOwner && img.UploadedById != uid) return Forbid();

        if (dto.Description is not null) img.Description = dto.Description.Trim();
        if (dto.Role.HasValue && isOwner && dto.Role.Value != img.Role)
        {
            if (dto.Role.Value == ImageRole.Banner || dto.Role.Value == ImageRole.Icon)
            {
                var existing = ev.Images.Where(i => i.Role == dto.Role.Value && i.Id != img.Id).ToList();
                foreach (var e in existing) _db.Images.Remove(e);
            }
            img.Role = dto.Role.Value;
        }

        await _db.SaveChangesAsync();
        return EventImageDto.From(img, uid, ev.CreatedById);
    }

    [HttpDelete("{id:int}/images/{imageId:int}")]
    public async Task<IActionResult> DeleteImage(int id, int imageId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();

        var img = await _db.Images.FirstOrDefaultAsync(i => i.Id == imageId && i.EventId == id);
        if (img is null) return NotFound();

        if (ev.CreatedById != uid && img.UploadedById != uid) return Forbid();

        _db.Images.Remove(img);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static List<string> NormalizeOptions(IEnumerable<string> raw) =>
        raw.Select(s => s?.Trim() ?? string.Empty)
           .Where(s => s.Length > 0)
           .Distinct(StringComparer.Ordinal)
           .ToList();

    // Recursive visibility for an already-loaded-from-DB graph. Walks up via
    // ParentEventId for any ancestor that the current event opts to inherit
    // invites from. Cycle-safe via the `seen` set so it's depth-agnostic.
    private static bool IsEffectivelyVisible(
        CalendarEvent ev,
        string uid,
        IReadOnlyDictionary<int, CalendarEvent> byId,
        HashSet<int> seen)
    {
        if (!seen.Add(ev.Id)) return false;
        if (ev.CreatedById == uid) return true;
        if (ev.Invites.Any(i => i.InviteeId == uid)) return true;
        if (ev.InheritParentInvites && ev.ParentEventId.HasValue
            && byId.TryGetValue(ev.ParentEventId.Value, out var parent))
            return IsEffectivelyVisible(parent, uid, byId, seen);
        return false;
    }

    // Same logic but lazy-loads ancestors via the DB when the in-memory
    // graph isn't pre-built (used by the single-event Get endpoint).
    private async Task<bool> IsVisibleViaInheritanceAsync(CalendarEvent ev, string uid)
    {
        var current = ev;
        var seen = new HashSet<int>();
        while (current is not null && seen.Add(current.Id))
        {
            if (current.CreatedById == uid) return true;
            var invites = current.Invites?.Count > 0
                ? current.Invites
                : await _db.Invites.Where(i => i.EventId == current.Id).ToListAsync();
            if (invites.Any(i => i.InviteeId == uid)) return true;
            if (!current.InheritParentInvites || current.ParentEventId is null) return false;
            current = current.ParentEvent
                ?? await _db.Events
                    .Include(e => e.Invites)
                    .FirstOrDefaultAsync(e => e.Id == current.ParentEventId!.Value);
        }
        return false;
    }

    // Returns null if `parentId` is a valid parent for the current user, or
    // an ActionResult describing the failure otherwise. `attachingEventId`
    // is the event being re-parented (null on create).
    private async Task<ActionResult?> ValidateParentAsync(int parentId, string uid, int? attachingEventId)
    {
        if (attachingEventId == parentId)
            return BadRequest("An event cannot be its own parent.");

        var parent = await _db.Events.FindAsync(parentId);
        if (parent is null) return BadRequest("Parent event not found.");
        if (parent.CreatedById != uid) return Forbid();
        if (parent.ParentEventId is not null)
            return BadRequest("Recursive event depth can not exceed 1.");
        return null;
    }

    private static bool CanCreateType(AppUser user, EventType type) => type switch
    {
        EventType.Wedding => user.CanCreateWeddingEvent,
        EventType.FamilyGathering => user.CanCreateFamilyGathering || user.CanCreateWeddingEvent,
        _ => false,
    };
}

public sealed record EventSummaryDto(
    int Id,
    EventType Type,
    string Title,
    DateTime StartUtc,
    DateTime EndUtc,
    string Location,
    bool IsOwner,
    int? IconImageId);

public sealed record EventDetailDto(
    int Id,
    EventType Type,
    string Title,
    string Description,
    string Location,
    DateTime StartUtc,
    DateTime EndUtc,
    string CreatedById,
    string CreatedByDisplayName,
    bool IsOwner,
    List<string> MealOptions,
    List<string> DrinkOptions,
    int? ParentEventId,
    string? ParentEventTitle,
    bool InheritParentInvites,
    bool CollectChildRsvps,
    bool AllowGuestAlbumUploads,
    List<ChildEventDto> Children,
    List<InviteDto> Invites,
    InviteDto? MyInvite,
    List<EventImageDto> Images)
{
    public static EventDetailDto From(CalendarEvent e, string currentUserId)
    {
        var invites = e.Invites.Select(i => InviteDto.From(i, i.Invitee)).ToList();
        var mine = invites.FirstOrDefault(i => i.InviteeId == currentUserId);
        var children = e.Children
            .OrderBy(c => c.StartUtc)
            .Select(c => ChildEventDto.From(c, currentUserId))
            .ToList();
        var images = (e.Images ?? new())
            .OrderBy(i => i.Role)
            .ThenBy(i => i.UploadedAtUtc)
            .Select(i => EventImageDto.From(i, currentUserId, e.CreatedById))
            .ToList();
        return new(
            e.Id, e.Type, e.Title, e.Description, e.Location, e.StartUtc, e.EndUtc,
            e.CreatedById,
            e.CreatedBy?.DisplayName ?? string.Empty,
            e.CreatedById == currentUserId,
            e.MealOptions.ToList(),
            e.DrinkOptions.ToList(),
            e.ParentEventId,
            e.ParentEvent?.Title,
            e.InheritParentInvites,
            e.CollectChildRsvps,
            e.AllowGuestAlbumUploads,
            children,
            invites,
            mine,
            images);
    }
}

public sealed record EventImageDto(
    int Id,
    ImageRole Role,
    string Description,
    string FileName,
    string ContentType,
    string UploadedById,
    DateTime UploadedAtUtc,
    bool CanEdit)
{
    public static EventImageDto From(EventImage i, string currentUserId, string eventOwnerId) => new(
        i.Id,
        i.Role,
        i.Description,
        i.FileName,
        i.ContentType,
        i.UploadedById,
        i.UploadedAtUtc,
        i.UploadedById == currentUserId || eventOwnerId == currentUserId);
}

// A child event surfaced on the parent detail. Carries enough to render the
// per-child RSVP card on the view page without a second round-trip.
public sealed record ChildEventDto(
    int Id,
    EventType Type,
    string Title,
    string Description,
    string Location,
    DateTime StartUtc,
    DateTime EndUtc,
    bool IsOwner,
    List<string> MealOptions,
    List<string> DrinkOptions,
    InviteDto? MyInvite)
{
    public static ChildEventDto From(CalendarEvent c, string currentUserId)
    {
        var mine = c.Invites?
            .Where(i => i.InviteeId == currentUserId)
            .Select(i => InviteDto.From(i, i.Invitee))
            .FirstOrDefault();
        return new(
            c.Id, c.Type, c.Title, c.Description, c.Location, c.StartUtc, c.EndUtc,
            c.CreatedById == currentUserId,
            c.MealOptions.ToList(),
            c.DrinkOptions.ToList(),
            mine);
    }
}

public sealed record InviteDto(
    int Id,
    string InviteeId,
    string InviteeDisplayName,
    string InviteeEmail,
    InviteStatus Status,
    string? MealChoice,
    string? DrinkChoice)
{
    public static InviteDto From(EventInvite i, AppUser? invitee) => new(
        i.Id,
        i.InviteeId,
        invitee?.DisplayName ?? string.Empty,
        invitee?.Email ?? string.Empty,
        i.Status,
        i.MealChoice,
        i.DrinkChoice);
}

public sealed class CreateEventDto
{
    public EventType? Type { get; set; }
    [MaxLength(200)] public string? Title { get; set; }
    public DateTime? StartUtc { get; set; }
    public DateTime? EndUtc { get; set; }
    public int? ParentEventId { get; set; }
}

public sealed class UpdateEventDto
{
    public EventType? Type { get; set; }
    [MaxLength(200)] public string? Title { get; set; }
    [MaxLength(2000)] public string? Description { get; set; }
    [MaxLength(300)] public string? Location { get; set; }
    public DateTime? StartUtc { get; set; }
    public DateTime? EndUtc { get; set; }
    public List<string>? MealOptions { get; set; }
    public List<string>? DrinkOptions { get; set; }
    // null = leave unchanged. 0 or negative = detach (set to root).
    // positive id = attach as child of that event.
    public int? ParentEventId { get; set; }
    public bool? InheritParentInvites { get; set; }
    public bool? CollectChildRsvps { get; set; }
    public bool? AllowGuestAlbumUploads { get; set; }
}

public sealed class AddInviteDto
{
    [Required] public string UserId { get; set; } = string.Empty;
}

public sealed class RsvpDto
{
    public InviteStatus? Status { get; set; }
    // null = leave unchanged; "" = clear; non-empty = set (must match an option).
    public string? MealChoice { get; set; }
    public string? DrinkChoice { get; set; }
}

public sealed class ImageUploadDto
{
    [Required] public IFormFile File { get; set; } = default!;
    public ImageRole Role { get; set; }
    [MaxLength(500)] public string? Description { get; set; }
}

public sealed class ImageUpdateDto
{
    public ImageRole? Role { get; set; }
    [MaxLength(500)] public string? Description { get; set; }
}
