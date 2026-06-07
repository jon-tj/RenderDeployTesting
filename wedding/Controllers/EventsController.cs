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

    // Events visible to the current user: created by them OR they're invited.
    [HttpGet]
    public async Task<ActionResult<List<EventSummaryDto>>> List(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var q = _db.Events
            .Include(e => e.Invites)
            .Where(e => e.CreatedById == uid || e.Invites.Any(i => i.InviteeId == uid));

        if (from.HasValue) q = q.Where(e => e.EndUtc >= from.Value);
        if (to.HasValue) q = q.Where(e => e.StartUtc <= to.Value);

        return await q
            .OrderBy(e => e.StartUtc)
            .Select(e => new EventSummaryDto(
                e.Id, e.Type, e.Title, e.StartUtc, e.EndUtc, e.Location, e.CreatedById == uid))
            .ToListAsync();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<EventDetailDto>> Get(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();

        var ev = await _db.Events
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.CreatedBy)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();

        if (ev.CreatedById != uid && !ev.Invites.Any(i => i.InviteeId == uid))
            return Forbid();

        return EventDetailDto.From(ev, uid);
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

        var start = dto.StartUtc ?? DateTime.UtcNow.Date.AddHours(12);
        var ev = new CalendarEvent
        {
            Type = dto.Type ?? EventType.FamilyGathering,
            Title = string.IsNullOrWhiteSpace(dto.Title) ? "Untitled event" : dto.Title.Trim(),
            StartUtc = start,
            EndUtc = dto.EndUtc ?? start.AddHours(1),
            CreatedById = uid,
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

        _db.Invites.Remove(invite);
        await _db.SaveChangesAsync();
        return NoContent();
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
    bool IsOwner);

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
    List<InviteDto> Invites)
{
    public static EventDetailDto From(CalendarEvent e, string currentUserId) => new(
        e.Id, e.Type, e.Title, e.Description, e.Location, e.StartUtc, e.EndUtc,
        e.CreatedById,
        e.CreatedBy?.DisplayName ?? string.Empty,
        e.CreatedById == currentUserId,
        e.Invites.Select(i => InviteDto.From(i, i.Invitee)).ToList());
}

public sealed record InviteDto(
    int Id,
    string InviteeId,
    string InviteeDisplayName,
    string InviteeEmail,
    InviteStatus Status)
{
    public static InviteDto From(EventInvite i, AppUser? invitee) => new(
        i.Id,
        i.InviteeId,
        invitee?.DisplayName ?? string.Empty,
        invitee?.Email ?? string.Empty,
        i.Status);
}

public sealed class CreateEventDto
{
    public EventType? Type { get; set; }
    [MaxLength(200)] public string? Title { get; set; }
    public DateTime? StartUtc { get; set; }
    public DateTime? EndUtc { get; set; }
}

public sealed class UpdateEventDto
{
    public EventType? Type { get; set; }
    [MaxLength(200)] public string? Title { get; set; }
    [MaxLength(2000)] public string? Description { get; set; }
    [MaxLength(300)] public string? Location { get; set; }
    public DateTime? StartUtc { get; set; }
    public DateTime? EndUtc { get; set; }
}

public sealed class AddInviteDto
{
    [Required] public string UserId { get; set; } = string.Empty;
}
