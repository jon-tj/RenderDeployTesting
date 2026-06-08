using FamilyHub.Data;
using FamilyHub.Model;
using FamilyHub.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Controllers;

[ApiController, Route("api/events"), Authorize]
public class EventsController(AppDbContext db, UserManager<AppUser> users, IEmailService email) : ControllerBase
{
    string Uid => users.GetUserId(User)!;

    Task<CalendarEvent?> FindCo(int id) => db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
    async Task<(CalendarEvent? ev, ActionResult? err)> Owned(int id)
    {
        var ev = await FindCo(id);
        if (ev is null) return (null, NotFound());
        if (!EventAccess.IsOwner(ev, Uid)) return (null, Forbid());
        return (ev, null);
    }

    [HttpGet]
    public async Task<ActionResult<List<EventSummaryDto>>> List([FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var uid = Uid;
        var all = await db.Events.Include(e => e.Invites).Include(e => e.Images).Include(e => e.CoOwners).ToListAsync();
        var byId = all.ToDictionary(e => e.Id);
        return all
            .Where(e => (!from.HasValue || e.EndUtc >= from.Value) && (!to.HasValue || e.StartUtc <= to.Value))
            .Where(e => EventAccess.IsVisibleTo(e, uid, byId))
            .OrderBy(e => e.StartUtc)
            .Select(e => new EventSummaryDto(e.Id, e.Type, e.Title, e.StartUtc, e.EndUtc, e.Location,
                EventAccess.IsOwner(e, uid),
                e.Images.FirstOrDefault(i => i.Role == ImageRole.Icon)?.Id))
            .ToList();
    }

    IQueryable<CalendarEvent> DetailQuery() => db.Events
        .Include(e => e.Invites).ThenInclude(i => i.Invitee)
        .Include(e => e.CreatedBy)
        .Include(e => e.CoOwners).ThenInclude(o => o.User)
        .Include(e => e.ParentEvent)
        .Include(e => e.Children).ThenInclude(c => c.Invites).ThenInclude(i => i.Invitee)
        .Include(e => e.Children).ThenInclude(c => c.CoOwners)
        .Include(e => e.Images);

    [HttpGet("{id:int}")]
    public async Task<ActionResult<EventDetailDto>> Get(int id)
    {
        var ev = await DetailQuery().FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!await EventAccess.IsVisibleAsync(db, ev, Uid)) return Forbid();
        var groups = await db.InviteGroups.Where(g => g.EventId == ev.Id).ToListAsync();
        var hasWishlist = await db.Wishlists.AnyAsync(w => w.EventId == ev.Id);
        return EventDetailDto.From(ev, Uid, groups, hasWishlist);
    }

    [HttpGet("{id:int}/child-candidates")]
    public async Task<ActionResult<List<EventSummaryDto>>> ChildCandidates(int id, [FromQuery] string? q)
    {
        var (parent, err) = await Owned(id);
        if (err is not null) return err;
        if (parent!.ParentEventId is not null) return new List<EventSummaryDto>();
        var uid = Uid;
        var query = db.Events.Where(e => e.Id != id
            && (e.CreatedById == uid || e.CoOwners.Any(o => o.UserId == uid))
            && e.ParentEventId == null && !e.Children.Any());
        if (!string.IsNullOrWhiteSpace(q))
        {
            var needle = q.Trim();
            query = query.Where(e => EF.Functions.Like(e.Title, $"%{needle}%"));
        }
        return await query.OrderBy(e => e.StartUtc).Take(10)
            .Select(e => new EventSummaryDto(e.Id, e.Type, e.Title, e.StartUtc, e.EndUtc, e.Location, true,
                e.Images.Where(i => i.Role == ImageRole.Icon).Select(i => (int?)i.Id).FirstOrDefault()))
            .ToListAsync();
    }

    [HttpPost]
    public async Task<ActionResult<EventDetailDto>> Create([FromBody] CreateEventDto dto)
    {
        var uid = Uid;
        var user = await users.FindByIdAsync(uid);
        if (user is null) return Unauthorized();

        CalendarEvent? parent = null;
        if (dto.ParentEventId is int pid)
        {
            if (await ValidateParent(pid, uid, null) is { } perr) return perr;
            parent = await FindCo(pid);
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
            InheritParentInvites = parent is not null,
            EnableTranslations = parent?.EnableTranslations ?? false,
        };
        if (!CanCreate(user, ev.Type)) return Forbid();

        db.Events.Add(ev);
        await db.SaveChangesAsync();

        // Ripple parent ownership to the child (skipping the child's own creator).
        if (parent is not null)
        {
            var seeded = new HashSet<string> { uid };
            if (seeded.Add(parent.CreatedById))
                db.EventOwners.Add(new EventOwner { EventId = ev.Id, UserId = parent.CreatedById });
            foreach (var co in parent.CoOwners)
                if (seeded.Add(co.UserId))
                    db.EventOwners.Add(new EventOwner { EventId = ev.Id, UserId = co.UserId });
            if (db.ChangeTracker.HasChanges())
            {
                await db.SaveChangesAsync();
                await db.Entry(ev).Collection(e => e.CoOwners).Query().Include(o => o.User).LoadAsync();
            }
        }

        await db.Entry(ev).Reference(e => e.CreatedBy).LoadAsync();
        return EventDetailDto.From(ev, uid, await db.InviteGroups.Where(g => g.EventId == ev.Id).ToListAsync(),
            await db.Wishlists.AnyAsync(w => w.EventId == ev.Id));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<EventDetailDto>> Update(int id, [FromBody] UpdateEventDto dto)
    {
        var ev = await DetailQuery().FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        var uid = Uid;
        if (!EventAccess.IsOwner(ev, uid)) return Forbid();

        if (dto.Type is { } t)
        {
            var user = await users.FindByIdAsync(uid);
            if (user is null || !CanCreate(user, t)) return Forbid();
            ev.Type = t;
        }
        if (dto.Title is not null) ev.Title = dto.Title.Trim();
        if (dto.Description is not null) ev.Description = dto.Description;
        if (dto.Location is not null) ev.Location = dto.Location;
        if (dto.LocationLabel is not null) ev.LocationLabel = dto.LocationLabel.Trim();
        if (dto.DressCode is not null) ev.DressCode = dto.DressCode.Trim();
        if (dto.StartUtc is { } s) ev.StartUtc = s;
        if (dto.EndUtc is { } e2) ev.EndUtc = e2;
        if (dto.MealOptions is not null) ev.MealOptions = NormalizeOptions(dto.MealOptions);
        if (dto.DrinkOptions is not null) ev.DrinkOptions = NormalizeOptions(dto.DrinkOptions);
        if (dto.InheritParentInvites is { } a) ev.InheritParentInvites = a;
        if (dto.CollectChildRsvps is { } b) ev.CollectChildRsvps = b;
        if (dto.AlbumUploadPolicy is { } c) ev.AlbumUploadPolicy = c;
        if (dto.ShowInviteesToGuests is { } d) ev.ShowInviteesToGuests = d;
        if (dto.Visibility is { } v) ev.Visibility = v;
        if (dto.EnableTranslations is { } et) ev.EnableTranslations = et;
        if (dto.Translations is not null) ev.Translations = CleanTranslations(dto.Translations);

        if (dto.ParentEventId is { } reqParent)
        {
            var newParent = reqParent <= 0 ? (int?)null : reqParent;
            if (newParent != ev.ParentEventId)
            {
                if (newParent is null) ev.ParentEventId = null;
                else
                {
                    if (ev.Children.Any()) return BadRequest("Recursive event depth can not exceed 1.");
                    if (await ValidateParent(newParent.Value, uid, ev.Id) is { } perr) return perr;
                    ev.ParentEventId = newParent;
                }
            }
        }

        // Drop stale meal/drink picks once their option vanishes.
        foreach (var inv in ev.Invites)
        {
            if (inv.MealChoice is not null && !ev.MealOptions.Contains(inv.MealChoice)) inv.MealChoice = null;
            if (inv.DrinkChoice is not null && !ev.DrinkOptions.Contains(inv.DrinkChoice)) inv.DrinkChoice = null;
        }

        await db.SaveChangesAsync();
        return EventDetailDto.From(ev, uid, await db.InviteGroups.Where(g => g.EventId == ev.Id).ToListAsync(),
            await db.Wishlists.AnyAsync(w => w.EventId == ev.Id));
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var (ev, err) = await Owned(id);
        if (err is not null) return err;
        db.Events.Remove(ev!);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("{id:int}/invites")]
    public async Task<ActionResult<InviteDto>> AddInvite(int id, [FromBody] AddInviteDto dto)
    {
        var (_, err) = await Owned(id);
        if (err is not null) return err;
        var invitee = await users.FindByIdAsync(dto.UserId);
        if (invitee is null) return BadRequest("User not found.");
        var existing = await db.Invites.FirstOrDefaultAsync(i => i.EventId == id && i.InviteeId == dto.UserId);
        if (existing is not null) return InviteDto.From(existing, invitee);
        var invite = new EventInvite { EventId = id, InviteeId = dto.UserId, Status = InviteStatus.Pending };
        db.Invites.Add(invite);
        await db.SaveChangesAsync();
        return InviteDto.From(invite, invitee);
    }

    [HttpDelete("{id:int}/invites/{inviteId:int}")]
    public async Task<IActionResult> RemoveInvite(int id, int inviteId)
    {
        var (_, err) = await Owned(id);
        if (err is not null) return err;
        var invite = await db.Invites.FirstOrDefaultAsync(i => i.Id == inviteId && i.EventId == id);
        if (invite is null) return NotFound();
        // Cascade removal to descendant invites so rippled RSVPs disappear too.
        var descendants = await CollectDescendants(id);
        db.Invites.Remove(invite);
        if (descendants.Count > 0)
            db.Invites.RemoveRange(await db.Invites
                .Where(i => i.InviteeId == invite.InviteeId && descendants.Contains(i.EventId))
                .ToListAsync());
        await db.SaveChangesAsync();
        return NoContent();
    }

    async Task<List<int>> CollectDescendants(int rootId)
    {
        var result = new List<int>();
        var seen = new HashSet<int> { rootId };
        var frontier = new List<int> { rootId };
        while (frontier.Count > 0)
        {
            var children = await db.Events
                .Where(e => e.ParentEventId != null && frontier.Contains(e.ParentEventId.Value))
                .Select(e => e.Id).ToListAsync();
            frontier = children.Where(seen.Add).ToList();
            result.AddRange(frontier);
        }
        return result;
    }

    [HttpPost("{id:int}/invites/{inviteId:int}/send-email")]
    public async Task<IActionResult> SendInviteEmail(int id, int inviteId)
    {
        var (ev, err) = await Owned(id);
        if (err is not null) return err;
        var invite = await db.Invites.FirstOrDefaultAsync(i => i.Id == inviteId && i.EventId == id);
        if (invite is null) return NotFound();
        var invitee = await users.FindByIdAsync(invite.InviteeId);
        var inviter = await users.FindByIdAsync(Uid);
        if (invitee is null || inviter is null) return NotFound();
        await email.SendInviteAsync(invitee, await users.HasPasswordAsync(invitee), ev!, inviter, HttpContext.RequestAborted);
        invite.InviteEmailSentUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(InviteDto.From(invite, invitee));
    }

    [HttpPost("{id:int}/invites/send-pending-emails")]
    public Task<ActionResult<int>> SendPendingInviteEmails(int id) => SendBatch(id, _ => true);

    [HttpPost("{id:int}/groups/{groupId:int}/send-emails")]
    public Task<ActionResult<int>> SendGroupInviteEmails(int id, int groupId)
        => SendBatch(id, i => i.InviteGroupId == groupId, groupId);

    async Task<ActionResult<int>> SendBatch(int id, Func<EventInvite, bool> filter, int? requireGroup = null)
    {
        var ev = await db.Events
            .Include(e => e.CoOwners).ThenInclude(o => o.User)
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!EventAccess.IsOwner(ev, Uid)) return Forbid();
        if (requireGroup is int gid && !await db.InviteGroups.AnyAsync(g => g.Id == gid && g.EventId == id))
            return NotFound();
        var inviter = await users.FindByIdAsync(Uid);
        if (inviter is null) return Unauthorized();

        var pending = ev.Invites.Where(i => i.InviteEmailSentUtc is null && i.Invitee is not null && filter(i)).ToList();
        foreach (var inv in pending)
        {
            await email.SendInviteAsync(inv.Invitee!, !string.IsNullOrEmpty(inv.Invitee!.PasswordHash),
                ev, inviter, HttpContext.RequestAborted);
            inv.InviteEmailSentUtc = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
        return pending.Count;
    }

    [HttpGet("{id:int}/groups")]
    public async Task<ActionResult<List<InviteGroupDto>>> ListGroups(int id)
    {
        var (_, err) = await Owned(id);
        if (err is not null) return err;
        var groups = await db.InviteGroups.Where(g => g.EventId == id).OrderBy(g => g.Name).ToListAsync();
        return groups.Select(InviteGroupDto.From).ToList();
    }

    [HttpPost("{id:int}/groups")]
    public async Task<ActionResult<InviteGroupDto>> CreateGroup(int id, [FromBody] InviteGroupWriteDto dto)
    {
        var (_, err) = await Owned(id);
        if (err is not null) return err;
        var name = (dto.Name ?? "").Trim();
        if (name.Length == 0) return BadRequest("Name is required.");
        var grp = new InviteGroup
        {
            EventId = id,
            Name = name,
            VisibleChildEventIds = (dto.VisibleChildEventIds ?? new()).Distinct().ToList(),
        };
        db.InviteGroups.Add(grp);
        await db.SaveChangesAsync();
        return InviteGroupDto.From(grp);
    }

    [HttpPut("{id:int}/groups/{groupId:int}")]
    public async Task<ActionResult<InviteGroupDto>> UpdateGroup(int id, int groupId, [FromBody] InviteGroupWriteDto dto)
    {
        var (_, err) = await Owned(id);
        if (err is not null) return err;
        var grp = await db.InviteGroups.FirstOrDefaultAsync(g => g.Id == groupId && g.EventId == id);
        if (grp is null) return NotFound();
        if (dto.Name is not null)
        {
            var name = dto.Name.Trim();
            if (name.Length == 0) return BadRequest("Name is required.");
            grp.Name = name;
        }
        if (dto.VisibleChildEventIds is not null)
            grp.VisibleChildEventIds = dto.VisibleChildEventIds.Distinct().ToList();
        await db.SaveChangesAsync();
        return InviteGroupDto.From(grp);
    }

    [HttpDelete("{id:int}/groups/{groupId:int}")]
    public async Task<IActionResult> DeleteGroup(int id, int groupId)
    {
        var (_, err) = await Owned(id);
        if (err is not null) return err;
        var grp = await db.InviteGroups.FirstOrDefaultAsync(g => g.Id == groupId && g.EventId == id);
        if (grp is null) return NotFound();
        db.InviteGroups.Remove(grp);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id:int}/invites/{inviteId:int}/group")]
    public async Task<ActionResult<InviteDto>> SetInviteGroup(int id, int inviteId, [FromBody] SetInviteGroupDto dto)
    {
        var (_, err) = await Owned(id);
        if (err is not null) return err;
        var invite = await db.Invites.Include(i => i.Invitee).FirstOrDefaultAsync(i => i.Id == inviteId && i.EventId == id);
        if (invite is null) return NotFound();
        if (dto.GroupId is int gid)
        {
            if (!await db.InviteGroups.AnyAsync(g => g.Id == gid && g.EventId == id)) return BadRequest("Group not found.");
            invite.InviteGroupId = gid;
        }
        else invite.InviteGroupId = null;
        await db.SaveChangesAsync();
        return InviteDto.From(invite, invite.Invitee);
    }

    [HttpPost("{id:int}/co-owners")]
    public async Task<ActionResult<EventOwnerDto>> AddCoOwner(int id, [FromBody] AddCoOwnerDto dto)
    {
        var (ev, err) = await Owned(id);
        if (err is not null) return err;
        var newOwner = await users.FindByIdAsync(dto.UserId);
        if (newOwner is null) return BadRequest("User not found.");
        // Creator is implicit; promoting them is a no-op.
        if (ev!.CreatedById != newOwner.Id && !ev.CoOwners.Any(o => o.UserId == newOwner.Id))
        {
            db.EventOwners.Add(new EventOwner { EventId = ev.Id, UserId = newOwner.Id });
            await db.SaveChangesAsync();
        }
        return new EventOwnerDto(newOwner.Id, newOwner.DisplayName, newOwner.Email ?? "");
    }

    [HttpDelete("{id:int}/co-owners/{userId}")]
    public async Task<IActionResult> RemoveCoOwner(int id, string userId)
    {
        var (ev, err) = await Owned(id);
        if (err is not null) return err;
        var row = ev!.CoOwners.FirstOrDefault(o => o.UserId == userId);
        if (row is null) return NotFound();
        db.EventOwners.Remove(row);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPut("{id:int}/rsvp")]
    public async Task<ActionResult<InviteDto>> Rsvp(int id, [FromBody] RsvpDto dto)
    {
        var ev = await db.Events
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.ParentEvent)
            .Include(e => e.Children).ThenInclude(c => c.Invites)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        var uid = Uid;
        if (!await EventAccess.IsVisibleAsync(db, ev, uid)) return Forbid();

        var invite = ev.Invites.FirstOrDefault(i => i.InviteeId == uid);
        if (invite is null)
        {
            invite = new EventInvite { EventId = ev.Id, InviteeId = uid, Status = InviteStatus.Pending };
            ev.Invites.Add(invite);
            db.Invites.Add(invite);
            await db.Entry(invite).Reference(i => i.Invitee).LoadAsync();
        }

        if (dto.Status is { } st) invite.Status = st;
        if (ApplyChoice(dto.MealChoice, ev.MealOptions, v => invite.MealChoice = v) is { } mErr) return mErr;
        if (ApplyChoice(dto.DrinkChoice, ev.DrinkOptions, v => invite.DrinkChoice = v) is { } dErr) return dErr;

        // Ripple status (not choices — children have their own option lists).
        if (ev.CollectChildRsvps && dto.Status is { } status)
        {
            foreach (var child in ev.Children)
            {
                var ci = child.Invites.FirstOrDefault(i => i.InviteeId == uid);
                if (ci is null)
                {
                    ci = new EventInvite { EventId = child.Id, InviteeId = uid, Status = status };
                    child.Invites.Add(ci);
                    db.Invites.Add(ci);
                }
                else ci.Status = status;
            }
        }

        await db.SaveChangesAsync();
        if (invite.Invitee is null) await db.Entry(invite).Reference(i => i.Invitee).LoadAsync();
        return InviteDto.From(invite, invite.Invitee);
    }

    ActionResult? ApplyChoice(string? raw, List<string> options, Action<string?> set)
    {
        if (raw is null) return null;
        var choice = raw.Trim();
        if (choice.Length == 0) { set(null); return null; }
        if (!options.Contains(choice)) return BadRequest("Choice is not one of the available options.");
        set(choice);
        return null;
    }

    [HttpGet("{id:int}/images/{imageId:int}")]
    public async Task<IActionResult> GetImage(int id, int imageId)
    {
        var ev = await db.Events.Include(e => e.Invites).Include(e => e.ParentEvent).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!await EventAccess.IsVisibleAsync(db, ev, Uid)) return Forbid();
        var img = await db.Images.FirstOrDefaultAsync(i => i.Id == imageId && i.EventId == id);
        if (img is null) return NotFound();
        return File(img.Data, string.IsNullOrEmpty(img.ContentType) ? "application/octet-stream" : img.ContentType);
    }

    [HttpPost("{id:int}/images"), RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<EventImageDto>> UploadImage(int id, [FromForm] ImageUploadDto dto)
    {
        var ev = await db.Events.Include(e => e.Invites).Include(e => e.ParentEvent)
            .Include(e => e.CoOwners).Include(e => e.Images).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        var uid = Uid;
        if (!await EventAccess.IsVisibleAsync(db, ev, uid)) return Forbid();
        var isOwner = EventAccess.IsOwner(ev, uid);
        // Non-owners may only contribute to the guest album, and only when the
        // album-upload window is open (depending on the event's policy).
        if (!isOwner && (dto.Role != ImageRole.Album || !AlbumUploads.IsOpen(ev))) return Forbid();
        if (dto.File is null || dto.File.Length == 0) return BadRequest("File is required.");
        if (!dto.File.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest("File must be an image.");

        if (IsUniqueRole(dto.Role))
            foreach (var ex in ev.Images.Where(i => i.Role == dto.Role).ToList()) db.Images.Remove(ex);

        using var ms = new MemoryStream();
        await dto.File.CopyToAsync(ms);
        var img = new EventImage
        {
            EventId = ev.Id, Role = dto.Role,
            Description = (dto.Description ?? "").Trim(),
            FileName = Path.GetFileName(dto.File.FileName) ?? "",
            ContentType = dto.File.ContentType,
            Data = ms.ToArray(),
            UploadedById = uid,
            UploadedAtUtc = DateTime.UtcNow,
        };
        db.Images.Add(img);
        await db.SaveChangesAsync();
        return EventImageDto.From(img, uid, isOwner);
    }

    [HttpPut("{id:int}/images/{imageId:int}")]
    public async Task<ActionResult<EventImageDto>> UpdateImage(int id, int imageId, [FromBody] ImageUpdateDto dto)
    {
        var ev = await db.Events.Include(e => e.Images).Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        var img = ev.Images.FirstOrDefault(i => i.Id == imageId);
        if (img is null) return NotFound();
        var uid = Uid;
        var isOwner = EventAccess.IsOwner(ev, uid);
        if (!isOwner && img.UploadedById != uid) return Forbid();

        if (dto.Description is not null) img.Description = dto.Description.Trim();
        if (dto.Role is { } r && isOwner && r != img.Role)
        {
            if (IsUniqueRole(r))
                foreach (var ex in ev.Images.Where(i => i.Role == r && i.Id != img.Id).ToList()) db.Images.Remove(ex);
            img.Role = r;
        }
        await db.SaveChangesAsync();
        return EventImageDto.From(img, uid, isOwner);
    }

    [HttpDelete("{id:int}/images/{imageId:int}")]
    public async Task<IActionResult> DeleteImage(int id, int imageId)
    {
        var ev = await FindCo(id);
        if (ev is null) return NotFound();
        var img = await db.Images.FirstOrDefaultAsync(i => i.Id == imageId && i.EventId == id);
        if (img is null) return NotFound();
        var uid = Uid;
        if (!EventAccess.IsOwner(ev, uid) && img.UploadedById != uid) return Forbid();
        db.Images.Remove(img);
        await db.SaveChangesAsync();
        return NoContent();
    }

    async Task<ActionResult?> ValidateParent(int parentId, string uid, int? attachingEventId)
    {
        if (attachingEventId == parentId) return BadRequest("An event cannot be its own parent.");
        var parent = await FindCo(parentId);
        if (parent is null) return BadRequest("Parent event not found.");
        if (!EventAccess.IsOwner(parent, uid)) return Forbid();
        if (parent.ParentEventId is not null) return BadRequest("Recursive event depth can not exceed 1.");
        return null;
    }

    static List<string> NormalizeOptions(IEnumerable<string> raw) =>
        raw.Select(s => s?.Trim() ?? "").Where(s => s.Length > 0).Distinct(StringComparer.Ordinal).ToList();

    static Dictionary<string, EventTranslation> CleanTranslations(Dictionary<string, EventTranslation> raw)
    {
        var clean = new Dictionary<string, EventTranslation>();
        foreach (var kv in raw)
        {
            var lang = LanguageCodes.Normalize(kv.Key);
            if (lang == LanguageCodes.Default) continue;
            var t = kv.Value ?? new EventTranslation();
            var meals = CleanMap(t.MealOptions);
            var drinks = CleanMap(t.DrinkOptions);
            var hasText = !string.IsNullOrWhiteSpace(t.Title)
                || !string.IsNullOrWhiteSpace(t.Description)
                || !string.IsNullOrWhiteSpace(t.DressCode);
            if (!hasText && meals.Count == 0 && drinks.Count == 0) continue;
            clean[lang] = new EventTranslation
            {
                Title = (t.Title ?? "").Trim(),
                Description = t.Description ?? "",
                DressCode = (t.DressCode ?? "").Trim(),
                MealOptions = meals,
                DrinkOptions = drinks,
            };
        }
        return clean;
    }

    static Dictionary<string, string> CleanMap(IDictionary<string, string>? raw)
    {
        var clean = new Dictionary<string, string>(StringComparer.Ordinal);
        if (raw is null) return clean;
        foreach (var kv in raw)
        {
            var k = kv.Key?.Trim();
            var v = kv.Value?.Trim();
            if (!string.IsNullOrEmpty(k) && !string.IsNullOrEmpty(v)) clean[k] = v;
        }
        return clean;
    }

    static bool IsUniqueRole(ImageRole role) => role is
        ImageRole.Banner or ImageRole.Icon or ImageRole.MarginLeft
        or ImageRole.MarginRight or ImageRole.MarginBottom or ImageRole.Tile;

    static bool CanCreate(AppUser user, EventType type) => type switch
    {
        EventType.Wedding => user.CanCreateWeddingEvent,
        EventType.FamilyGathering => user.CanCreateFamilyGathering || user.CanCreateWeddingEvent,
        _ => false,
    };
}
