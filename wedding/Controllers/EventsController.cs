using FamilyHub.Data;
using FamilyHub.Model;
using FamilyHub.Services;
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
    private readonly IEmailService _email;

    public EventsController(AppDbContext db, UserManager<AppUser> users, IEmailService email)
    {
        _db = db;
        _users = users;
        _email = email;
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
            .Include(e => e.CoOwners)
            .ToListAsync();
        var byId = all.ToDictionary(e => e.Id);

        return all
            .Where(e => (!from.HasValue || e.EndUtc >= from.Value)
                     && (!to.HasValue || e.StartUtc <= to.Value))
            .Where(e => IsEffectivelyVisible(e, uid, byId, new HashSet<int>()))
            .OrderBy(e => e.StartUtc)
            .Select(e => new EventSummaryDto(
                e.Id, e.Type, e.Title, e.StartUtc, e.EndUtc, e.Location, IsOwner(e, uid),
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
            .Include(e => e.CoOwners).ThenInclude(o => o.User)
            .Include(e => e.ParentEvent)
            .Include(e => e.Children).ThenInclude(c => c.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.Children).ThenInclude(c => c.CoOwners)
            .Include(e => e.Images)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();

        if (!await IsVisibleViaInheritanceAsync(ev, uid))
            return Forbid();

        var groups = await _db.InviteGroups.Where(g => g.EventId == ev.Id).ToListAsync();

        return EventDetailDto.From(ev, uid, groups);
    }

    // Candidates the current user can attach as children of `id`: events they
    // own, not already children of anything, with no children of their own,
    // and obviously not the parent itself.
    [HttpGet("{id:int}/child-candidates")]
    public async Task<ActionResult<List<EventSummaryDto>>> ChildCandidates(int id, [FromQuery] string? q)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var parent = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (parent is null) return NotFound();
        if (!IsOwner(parent, uid)) return Forbid();
        if (parent.ParentEventId is not null) return new List<EventSummaryDto>();

        var query = _db.Events
            .Where(e => e.Id != id
                && (e.CreatedById == uid || e.CoOwners.Any(o => o.UserId == uid))
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
            parent = await _db.Events
                .Include(e => e.CoOwners)
                .FirstOrDefaultAsync(e => e.Id == dto.ParentEventId.Value);
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
            // Ripple the parent's translation toggle so newly-added schedule
            // items can be authored in every language out of the gate.
            EnableTranslations = parent?.EnableTranslations ?? false,
        };

        if (!CanCreateType(user, ev.Type))
            return Forbid();

        _db.Events.Add(ev);
        await _db.SaveChangesAsync();

        // Ripple co-ownership from the parent: every co-owner of the parent
        // (and the parent's creator, if different from the new event's creator)
        // becomes a co-owner of this child. The child's own creator stays the
        // creator and is not stored as a co-owner.
        if (parent is not null)
        {
            var seeded = new HashSet<string> { uid };
            if (parent.CreatedById != uid)
            {
                _db.EventOwners.Add(new EventOwner { EventId = ev.Id, UserId = parent.CreatedById });
                seeded.Add(parent.CreatedById);
            }
            foreach (var co in parent.CoOwners)
            {
                if (seeded.Add(co.UserId))
                {
                    _db.EventOwners.Add(new EventOwner { EventId = ev.Id, UserId = co.UserId });
                }
            }
            if (_db.ChangeTracker.HasChanges())
            {
                await _db.SaveChangesAsync();
                await _db.Entry(ev).Collection(e => e.CoOwners).Query().Include(o => o.User).LoadAsync();
            }
        }

        await _db.Entry(ev).Reference(e => e.CreatedBy).LoadAsync();
        var createGroups = await _db.InviteGroups.Where(g => g.EventId == ev.Id).ToListAsync();
        return EventDetailDto.From(ev, uid, createGroups);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<EventDetailDto>> Update(int id, [FromBody] UpdateEventDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.CreatedBy)
            .Include(e => e.CoOwners).ThenInclude(o => o.User)
            .Include(e => e.ParentEvent)
            .Include(e => e.Children).ThenInclude(c => c.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.Children).ThenInclude(c => c.CoOwners)
            .Include(e => e.Images)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();

        if (dto.Type.HasValue)
        {
            var user = await _users.FindByIdAsync(uid);
            if (user is null || !CanCreateType(user, dto.Type.Value)) return Forbid();
            ev.Type = dto.Type.Value;
        }
        if (dto.Title is not null) ev.Title = dto.Title.Trim();
        if (dto.Description is not null) ev.Description = dto.Description;
        if (dto.Location is not null) ev.Location = dto.Location;
        if (dto.LocationLabel is not null) ev.LocationLabel = dto.LocationLabel.Trim();
        if (dto.DressCode is not null) ev.DressCode = dto.DressCode.Trim();
        if (dto.StartUtc.HasValue) ev.StartUtc = dto.StartUtc.Value;
        if (dto.EndUtc.HasValue) ev.EndUtc = dto.EndUtc.Value;
        if (dto.MealOptions is not null) ev.MealOptions = NormalizeOptions(dto.MealOptions);
        if (dto.DrinkOptions is not null) ev.DrinkOptions = NormalizeOptions(dto.DrinkOptions);
        if (dto.InheritParentInvites.HasValue) ev.InheritParentInvites = dto.InheritParentInvites.Value;
        if (dto.CollectChildRsvps.HasValue) ev.CollectChildRsvps = dto.CollectChildRsvps.Value;
        if (dto.AllowGuestAlbumUploads.HasValue) ev.AllowGuestAlbumUploads = dto.AllowGuestAlbumUploads.Value;
        if (dto.ShowInviteesToGuests.HasValue) ev.ShowInviteesToGuests = dto.ShowInviteesToGuests.Value;
        if (dto.Visibility.HasValue) ev.Visibility = dto.Visibility.Value;
        if (dto.EnableTranslations.HasValue) ev.EnableTranslations = dto.EnableTranslations.Value;
        if (dto.Translations is not null)
        {
            var clean = new Dictionary<string, EventTranslation>();
            foreach (var kv in dto.Translations)
            {
                var lang = LanguageCodes.Normalize(kv.Key);
                if (lang == LanguageCodes.Default) continue; // English lives in Title/Description.
                var t = kv.Value ?? new EventTranslation();
                var meals = CleanOptionMap(t.MealOptions);
                var drinks = CleanOptionMap(t.DrinkOptions);
                var hasText = !string.IsNullOrWhiteSpace(t.Title) || !string.IsNullOrWhiteSpace(t.Description) || !string.IsNullOrWhiteSpace(t.DressCode);
                if (!hasText && meals.Count == 0 && drinks.Count == 0) continue;
                clean[lang] = new EventTranslation
                {
                    Title = (t.Title ?? string.Empty).Trim(),
                    Description = t.Description ?? string.Empty,
                    DressCode = (t.DressCode ?? string.Empty).Trim(),
                    MealOptions = meals,
                    DrinkOptions = drinks,
                };
            }
            ev.Translations = clean;
        }

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
        var updateGroups = await _db.InviteGroups.Where(g => g.EventId == ev.Id).ToListAsync();
        return EventDetailDto.From(ev, uid, updateGroups);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();

        _db.Events.Remove(ev);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:int}/invites")]
    public async Task<ActionResult<InviteDto>> AddInvite(int id, [FromBody] AddInviteDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();

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

        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();

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

    // Send (or resend) the invitation email for a single invite. Used by the
    // owner's "send" / "resend" buttons in the invites list.
    [HttpPost("{id:int}/invites/{inviteId:int}/send-email")]
    public async Task<IActionResult> SendInviteEmail(int id, int inviteId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();

        var invite = await _db.Invites.FirstOrDefaultAsync(i => i.Id == inviteId && i.EventId == id);
        if (invite is null) return NotFound();

        var invitee = await _users.FindByIdAsync(invite.InviteeId);
        if (invitee is null) return NotFound();
        var inviter = await _users.FindByIdAsync(uid);
        if (inviter is null) return Unauthorized();

        var isOnboarded = await _users.HasPasswordAsync(invitee);
        await _email.SendInviteAsync(invitee, isOnboarded, ev, inviter, HttpContext.RequestAborted);
        invite.InviteEmailSentUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(InviteDto.From(invite, invitee));
    }

    // Send the invitation email to every invite that hasn't been emailed yet.
    [HttpPost("{id:int}/invites/send-pending-emails")]
    public async Task<ActionResult<int>> SendPendingInviteEmails(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.CoOwners).ThenInclude(o => o.User)
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();

        var inviter = await _users.FindByIdAsync(uid);
        if (inviter is null) return Unauthorized();

        var pending = ev.Invites
            .Where(i => i.InviteEmailSentUtc is null && i.Invitee is not null)
            .ToList();
        foreach (var invite in pending)
        {
            var isOnboarded = !string.IsNullOrEmpty(invite.Invitee!.PasswordHash);
            await _email.SendInviteAsync(invite.Invitee, isOnboarded, ev, inviter, HttpContext.RequestAborted);
            invite.InviteEmailSentUtc = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();
        return pending.Count;
    }

    // Send invitations for everyone in a single group. Skips invites that
    // have already been emailed (use single-invite resend).
    [HttpPost("{id:int}/groups/{groupId:int}/send-emails")]
    public async Task<ActionResult<int>> SendGroupInviteEmails(int id, int groupId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.CoOwners).ThenInclude(o => o.User)
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();

        var grp = await _db.InviteGroups.FirstOrDefaultAsync(g => g.Id == groupId && g.EventId == id);
        if (grp is null) return NotFound();

        var inviter = await _users.FindByIdAsync(uid);
        if (inviter is null) return Unauthorized();

        var pending = ev.Invites
            .Where(i => i.InviteGroupId == groupId && i.InviteEmailSentUtc is null && i.Invitee is not null)
            .ToList();
        foreach (var invite in pending)
        {
            var isOnboarded = !string.IsNullOrEmpty(invite.Invitee!.PasswordHash);
            await _email.SendInviteAsync(invite.Invitee, isOnboarded, ev, inviter, HttpContext.RequestAborted);
            invite.InviteEmailSentUtc = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync();
        return pending.Count;
    }

    // ----- Invite groups -----

    [HttpGet("{id:int}/groups")]
    public async Task<ActionResult<List<InviteGroupDto>>> ListGroups(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();
        var groups = await _db.InviteGroups.Where(g => g.EventId == id).OrderBy(g => g.Name).ToListAsync();
        return groups.Select(InviteGroupDto.From).ToList();
    }

    [HttpPost("{id:int}/groups")]
    public async Task<ActionResult<InviteGroupDto>> CreateGroup(int id, [FromBody] InviteGroupWriteDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();
        var name = (dto.Name ?? string.Empty).Trim();
        if (string.IsNullOrEmpty(name)) return BadRequest("Name is required.");
        var grp = new InviteGroup
        {
            EventId = id,
            Name = name,
            VisibleChildEventIds = (dto.VisibleChildEventIds ?? new()).Distinct().ToList(),
        };
        _db.InviteGroups.Add(grp);
        await _db.SaveChangesAsync();
        return InviteGroupDto.From(grp);
    }

    [HttpPut("{id:int}/groups/{groupId:int}")]
    public async Task<ActionResult<InviteGroupDto>> UpdateGroup(int id, int groupId, [FromBody] InviteGroupWriteDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();
        var grp = await _db.InviteGroups.FirstOrDefaultAsync(g => g.Id == groupId && g.EventId == id);
        if (grp is null) return NotFound();
        if (dto.Name is not null)
        {
            var name = dto.Name.Trim();
            if (string.IsNullOrEmpty(name)) return BadRequest("Name is required.");
            grp.Name = name;
        }
        if (dto.VisibleChildEventIds is not null)
            grp.VisibleChildEventIds = dto.VisibleChildEventIds.Distinct().ToList();
        await _db.SaveChangesAsync();
        return InviteGroupDto.From(grp);
    }

    [HttpDelete("{id:int}/groups/{groupId:int}")]
    public async Task<IActionResult> DeleteGroup(int id, int groupId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();
        var grp = await _db.InviteGroups.FirstOrDefaultAsync(g => g.Id == groupId && g.EventId == id);
        if (grp is null) return NotFound();
        _db.InviteGroups.Remove(grp);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id:int}/invites/{inviteId:int}/group")]
    public async Task<ActionResult<InviteDto>> SetInviteGroup(int id, int inviteId, [FromBody] SetInviteGroupDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();
        var invite = await _db.Invites
            .Include(i => i.Invitee)
            .FirstOrDefaultAsync(i => i.Id == inviteId && i.EventId == id);
        if (invite is null) return NotFound();
        if (dto.GroupId is int gid)
        {
            var grp = await _db.InviteGroups.FirstOrDefaultAsync(g => g.Id == gid && g.EventId == id);
            if (grp is null) return BadRequest("Group not found.");
            invite.InviteGroupId = gid;
        }
        else
        {
            invite.InviteGroupId = null;
        }
        await _db.SaveChangesAsync();
        return InviteDto.From(invite, invite.Invitee);
    }

    // Add a co-owner. Any current owner (creator or existing co-owner) can
    // promote another user. The creator's row is implicit so we never store
    // them in EventOwners — adding the creator is a no-op.
    [HttpPost("{id:int}/co-owners")]
    public async Task<ActionResult<EventOwnerDto>> AddCoOwner(int id, [FromBody] AddCoOwnerDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();

        var newOwner = await _users.FindByIdAsync(dto.UserId);
        if (newOwner is null) return BadRequest("User not found.");

        if (ev.CreatedById == newOwner.Id)
            return new EventOwnerDto(newOwner.Id, newOwner.DisplayName, newOwner.Email ?? string.Empty);

        if (!ev.CoOwners.Any(o => o.UserId == newOwner.Id))
        {
            _db.EventOwners.Add(new EventOwner { EventId = ev.Id, UserId = newOwner.Id });
            await _db.SaveChangesAsync();
        }

        return new EventOwnerDto(newOwner.Id, newOwner.DisplayName, newOwner.Email ?? string.Empty);
    }

    // Remove a co-owner. The creator can't be removed this way (they are
    // not stored in the table). Any owner can remove any co-owner.
    [HttpDelete("{id:int}/co-owners/{userId}")]
    public async Task<IActionResult> RemoveCoOwner(int id, string userId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!IsOwner(ev, uid)) return Forbid();

        var row = ev.CoOwners.FirstOrDefault(o => o.UserId == userId);
        if (row is null) return NotFound();

        _db.EventOwners.Remove(row);
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
            .Include(e => e.CoOwners)
            .Include(e => e.Images)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!await IsVisibleViaInheritanceAsync(ev, uid)) return Forbid();

        var isOwner = IsOwner(ev, uid);
        if (!isOwner && (dto.Role != ImageRole.Album || !ev.AllowGuestAlbumUploads))
            return Forbid();

        if (dto.File is null || dto.File.Length == 0) return BadRequest("File is required.");
        if (!dto.File.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest("File must be an image.");

        // Banner, Icon and the three margin slots are unique — replace the existing one.
        if (IsUniqueRole(dto.Role))
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

        return EventImageDto.From(img, uid, isOwner);
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
            .Include(e => e.CoOwners)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();

        var img = ev.Images.FirstOrDefault(i => i.Id == imageId);
        if (img is null) return NotFound();

        var isOwner = IsOwner(ev, uid);
        if (!isOwner && img.UploadedById != uid) return Forbid();

        if (dto.Description is not null) img.Description = dto.Description.Trim();
        if (dto.Role.HasValue && isOwner && dto.Role.Value != img.Role)
        {
            if (IsUniqueRole(dto.Role.Value))
            {
                var existing = ev.Images.Where(i => i.Role == dto.Role.Value && i.Id != img.Id).ToList();
                foreach (var e in existing) _db.Images.Remove(e);
            }
            img.Role = dto.Role.Value;
        }

        await _db.SaveChangesAsync();
        return EventImageDto.From(img, uid, isOwner);
    }

    [HttpDelete("{id:int}/images/{imageId:int}")]
    public async Task<IActionResult> DeleteImage(int id, int imageId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();

        var img = await _db.Images.FirstOrDefaultAsync(i => i.Id == imageId && i.EventId == id);
        if (img is null) return NotFound();

        if (!IsOwner(ev, uid) && img.UploadedById != uid) return Forbid();

        _db.Images.Remove(img);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static List<string> NormalizeOptions(IEnumerable<string> raw) =>
        raw.Select(s => s?.Trim() ?? string.Empty)
           .Where(s => s.Length > 0)
           .Distinct(StringComparer.Ordinal)
           .ToList();

    private static Dictionary<string, string> CleanOptionMap(IDictionary<string, string>? raw)
    {
        var clean = new Dictionary<string, string>(StringComparer.Ordinal);
        if (raw is null) return clean;
        foreach (var kv in raw)
        {
            var key = kv.Key?.Trim();
            var value = kv.Value?.Trim();
            if (string.IsNullOrEmpty(key) || string.IsNullOrEmpty(value)) continue;
            clean[key] = value;
        }
        return clean;
    }

    private static bool IsOwner(CalendarEvent ev, string uid)
        => ev.CreatedById == uid
        || (ev.CoOwners?.Any(o => o.UserId == uid) ?? false);

    // Roles where only one image per event makes sense; uploading replaces.
    private static bool IsUniqueRole(ImageRole role)
        => role is ImageRole.Banner
            or ImageRole.Icon
            or ImageRole.MarginLeft
            or ImageRole.MarginRight
            or ImageRole.MarginBottom
            or ImageRole.Tile;

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
        if (IsOwner(ev, uid)) return true;
        // Private hides the event from everyone except the owner. Open lets
        // any authenticated user see it. Closed falls through to the
        // invite/inheritance logic below.
        if (ev.Visibility == EventVisibility.Private) return false;
        if (ev.Visibility == EventVisibility.Open) return true;
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
            // Load CoOwners on the fly for ancestors that came in without it.
            if (current.CoOwners is null || (current.CoOwners.Count == 0 && current.Id != ev.Id))
                current.CoOwners = await _db.EventOwners.Where(o => o.EventId == current.Id).ToListAsync();
            if (IsOwner(current, uid)) return true;
            // Private/Open short-circuit on the current node only — ancestor
            // visibility flags don't override descendant ones.
            if (current.Visibility == EventVisibility.Private && current.Id == ev.Id) return false;
            if (current.Visibility == EventVisibility.Open && current.Id == ev.Id) return true;
            var invites = current.Invites?.Count > 0
                ? current.Invites
                : await _db.Invites.Where(i => i.EventId == current.Id).ToListAsync();
            if (invites.Any(i => i.InviteeId == uid)) return true;
            if (!current.InheritParentInvites || current.ParentEventId is null) return false;
            current = current.ParentEvent
                ?? await _db.Events
                    .Include(e => e.Invites)
                    .Include(e => e.CoOwners)
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

        var parent = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == parentId);
        if (parent is null) return BadRequest("Parent event not found.");
        if (!IsOwner(parent, uid)) return Forbid();
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
    string LocationLabel,
    string DressCode,
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
    bool ShowInviteesToGuests,
    EventVisibility Visibility,
    bool EnableTranslations,
    Dictionary<string, EventTranslation> Translations,
    List<EventOwnerDto> CoOwners,
    List<ChildEventDto> Children,
    List<InviteDto> Invites,
    List<InviteGroupDto> Groups,
    InviteDto? MyInvite,
    List<EventImageDto> Images)
{
    public static EventDetailDto From(CalendarEvent e, string currentUserId, IReadOnlyList<InviteGroup>? groups = null)
    {
        var isOwner = e.CreatedById == currentUserId
            || (e.CoOwners?.Any(o => o.UserId == currentUserId) ?? false);
        var allInvites = e.Invites.Select(i => InviteDto.From(i, i.Invitee)).ToList();
        var mine = allInvites.FirstOrDefault(i => i.InviteeId == currentUserId);
        // Non-owners only see the invitee list when the event is configured
        // to expose it. They always see their own invite (via MyInvite).
        var invites = isOwner || e.ShowInviteesToGuests
            ? allInvites
            : new List<InviteDto>();
        // Filter child events for non-owners by their invite group's
        // whitelist. No group = no children visible (apart from when the
        // owner views as themselves, which short-circuits above).
        var groupList = (groups ?? new List<InviteGroup>()).ToList();
        var myGroup = mine?.InviteGroupId is int gid
            ? groupList.FirstOrDefault(g => g.Id == gid)
            : null;
        var visibleChildIds = isOwner
            ? (HashSet<int>?)null
            : new HashSet<int>(myGroup?.VisibleChildEventIds ?? new List<int>());
        var children = e.Children
            .Where(c => visibleChildIds is null || visibleChildIds.Contains(c.Id))
            .OrderBy(c => c.StartUtc)
            .Select(c => ChildEventDto.From(c, currentUserId))
            .ToList();
        var images = (e.Images ?? new())
            .OrderBy(i => i.Role)
            .ThenBy(i => i.UploadedAtUtc)
            .Select(i => EventImageDto.From(i, currentUserId, isOwner))
            .ToList();
        var coOwners = (e.CoOwners ?? new())
            .Select(o => new EventOwnerDto(
                o.UserId,
                o.User?.DisplayName ?? string.Empty,
                o.User?.Email ?? string.Empty))
            .ToList();
        return new(
            e.Id, e.Type, e.Title, e.Description, e.Location, e.LocationLabel, e.DressCode, e.StartUtc, e.EndUtc,
            e.CreatedById,
            e.CreatedBy?.DisplayName ?? string.Empty,
            isOwner,
            e.MealOptions.ToList(),
            e.DrinkOptions.ToList(),
            e.ParentEventId,
            e.ParentEvent?.Title,
            e.InheritParentInvites,
            e.CollectChildRsvps,
            e.AllowGuestAlbumUploads,
            e.ShowInviteesToGuests,
            e.Visibility,
            e.EnableTranslations,
            e.Translations ?? new(),
            coOwners,
            children,
            invites,
            groupList.Select(InviteGroupDto.From).ToList(),
            mine,
            images);
    }
}

public sealed record EventOwnerDto(
    string UserId,
    string DisplayName,
    string Email);

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
    public static EventImageDto From(EventImage i, string currentUserId, bool isOwner) => new(
        i.Id,
        i.Role,
        i.Description,
        i.FileName,
        i.ContentType,
        i.UploadedById,
        i.UploadedAtUtc,
        i.UploadedById == currentUserId || isOwner);
}

// A child event surfaced on the parent detail. Carries enough to render the
// per-child RSVP card on the view page without a second round-trip.
public sealed record ChildEventDto(
    int Id,
    EventType Type,
    string Title,
    string Description,
    string Location,
    string LocationLabel,
    string DressCode,
    DateTime StartUtc,
    DateTime EndUtc,
    bool IsOwner,
    List<string> MealOptions,
    List<string> DrinkOptions,
    bool EnableTranslations,
    Dictionary<string, EventTranslation> Translations,
    InviteDto? MyInvite)
{
    public static ChildEventDto From(CalendarEvent c, string currentUserId)
    {
        var mine = c.Invites?
            .Where(i => i.InviteeId == currentUserId)
            .Select(i => InviteDto.From(i, i.Invitee))
            .FirstOrDefault();
        var isOwner = c.CreatedById == currentUserId
            || (c.CoOwners?.Any(o => o.UserId == currentUserId) ?? false);
        return new(
            c.Id, c.Type, c.Title, c.Description, c.Location, c.LocationLabel, c.DressCode, c.StartUtc, c.EndUtc,
            isOwner,
            c.MealOptions.ToList(),
            c.DrinkOptions.ToList(),
            c.EnableTranslations,
            c.Translations ?? new(),
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
    string? DrinkChoice,
    bool IsOnboarded,
    DateTime? EmailSentUtc,
    int? InviteGroupId)
{
    public static InviteDto From(EventInvite i, AppUser? invitee) => new(
        i.Id,
        i.InviteeId,
        invitee?.DisplayName ?? string.Empty,
        invitee?.Email ?? string.Empty,
        i.Status,
        i.MealChoice,
        i.DrinkChoice,
        !string.IsNullOrEmpty(invitee?.PasswordHash),
        i.InviteEmailSentUtc,
        i.InviteGroupId);
}

public sealed record InviteGroupDto(
    int Id,
    int EventId,
    string Name,
    List<int> VisibleChildEventIds)
{
    public static InviteGroupDto From(InviteGroup g) => new(
        g.Id, g.EventId, g.Name, g.VisibleChildEventIds.ToList());
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
    [MaxLength(200)] public string? LocationLabel { get; set; }
    [MaxLength(200)] public string? DressCode { get; set; }
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
    public bool? ShowInviteesToGuests { get; set; }
    public EventVisibility? Visibility { get; set; }
    public bool? EnableTranslations { get; set; }
    // Map of BCP-47 language tag -> { title, description }. Passing this
    // replaces the entire dictionary. Use null to leave it unchanged.
    public Dictionary<string, EventTranslation>? Translations { get; set; }
}

public sealed class AddInviteDto
{
    [Required] public string UserId { get; set; } = string.Empty;
}

public sealed class AddCoOwnerDto
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

public sealed class InviteGroupWriteDto
{
    [MaxLength(120)] public string? Name { get; set; }
    public List<int>? VisibleChildEventIds { get; set; }
}

public sealed class SetInviteGroupDto
{
    // null clears the assignment; an int picks a specific group.
    public int? GroupId { get; set; }
}
