using System.ComponentModel.DataAnnotations;
using FamilyHub.Model;

namespace FamilyHub.Controllers;

public sealed record EventSummaryDto(
    int Id, EventType Type, string Title, DateTime StartUtc, DateTime EndUtc,
    string Location, bool IsOwner, int? IconImageId);

public sealed record EventOwnerDto(string UserId, string DisplayName, string Email);

public sealed record EventImageDto(
    int Id, ImageRole Role, string Description, string FileName, string ContentType,
    string UploadedById, DateTime UploadedAtUtc, bool CanEdit)
{
    public static EventImageDto From(EventImage i, string uid, bool isOwner) => new(
        i.Id, i.Role, i.Description, i.FileName, i.ContentType,
        i.UploadedById, i.UploadedAtUtc, i.UploadedById == uid || isOwner);
}

public sealed record InviteDto(
    int Id, string InviteeId, string InviteeDisplayName, string InviteeEmail,
    InviteStatus Status, string? MealChoice, string? DrinkChoice,
    bool IsOnboarded, DateTime? EmailSentUtc, int? InviteGroupId)
{
    public static InviteDto From(EventInvite i, AppUser? u) => new(
        i.Id, i.InviteeId, u?.DisplayName ?? "", u?.Email ?? "",
        i.Status, i.MealChoice, i.DrinkChoice,
        !string.IsNullOrEmpty(u?.PasswordHash), i.InviteEmailSentUtc, i.InviteGroupId);
}

public sealed record InviteGroupDto(int Id, int EventId, string Name, List<int> VisibleChildEventIds)
{
    public static InviteGroupDto From(InviteGroup g) => new(g.Id, g.EventId, g.Name, g.VisibleChildEventIds.ToList());
}

public sealed record ChildEventDto(
    int Id, EventType Type, string Title, string Description, string Location,
    string LocationLabel, string DressCode, DateTime StartUtc, DateTime EndUtc, bool IsOwner,
    List<string> MealOptions, List<string> DrinkOptions, bool EnableTranslations,
    Dictionary<string, EventTranslation> Translations, InviteDto? MyInvite)
{
    public static ChildEventDto From(CalendarEvent c, string uid)
    {
        var mine = c.Invites?.Where(i => i.InviteeId == uid).Select(i => InviteDto.From(i, i.Invitee)).FirstOrDefault();
        var isOwner = c.CreatedById == uid || (c.CoOwners?.Any(o => o.UserId == uid) ?? false);
        return new(c.Id, c.Type, c.Title, c.Description, c.Location, c.LocationLabel, c.DressCode,
            c.StartUtc, c.EndUtc, isOwner, c.MealOptions.ToList(), c.DrinkOptions.ToList(),
            c.EnableTranslations, c.Translations ?? new(), mine);
    }
}

public sealed record EventDetailDto(
    int Id, EventType Type, string Title, string Description, string Location, string LocationLabel,
    string DressCode, DateTime StartUtc, DateTime EndUtc, string CreatedById, string CreatedByDisplayName,
    bool IsOwner, List<string> MealOptions, List<string> DrinkOptions,
    int? ParentEventId, string? ParentEventTitle, bool InheritParentInvites, bool CollectChildRsvps,
    bool AllowGuestAlbumUploads, bool ShowInviteesToGuests, EventVisibility Visibility,
    bool EnableTranslations, Dictionary<string, EventTranslation> Translations,
    List<EventOwnerDto> CoOwners, List<ChildEventDto> Children, List<InviteDto> Invites,
    List<InviteGroupDto> Groups, InviteDto? MyInvite, List<EventImageDto> Images)
{
    public static EventDetailDto From(CalendarEvent e, string uid, IReadOnlyList<InviteGroup>? groups = null)
    {
        var isOwner = e.CreatedById == uid || (e.CoOwners?.Any(o => o.UserId == uid) ?? false);
        var allInvites = e.Invites.Select(i => InviteDto.From(i, i.Invitee)).ToList();
        var mine = allInvites.FirstOrDefault(i => i.InviteeId == uid);
        var invites = isOwner || e.ShowInviteesToGuests ? allInvites : new();
        var groupList = (groups ?? new List<InviteGroup>()).ToList();
        // Non-owners only see children whose ids appear in their group's whitelist.
        var visibleChildIds = isOwner ? null : new HashSet<int>(
            (mine?.InviteGroupId is int gid ? groupList.FirstOrDefault(g => g.Id == gid) : null)
                ?.VisibleChildEventIds ?? new());
        var children = e.Children
            .Where(c => visibleChildIds is null || visibleChildIds.Contains(c.Id))
            .OrderBy(c => c.StartUtc)
            .Select(c => ChildEventDto.From(c, uid)).ToList();
        var images = (e.Images ?? new()).OrderBy(i => i.Role).ThenBy(i => i.UploadedAtUtc)
            .Select(i => EventImageDto.From(i, uid, isOwner)).ToList();
        var coOwners = (e.CoOwners ?? new())
            .Select(o => new EventOwnerDto(o.UserId, o.User?.DisplayName ?? "", o.User?.Email ?? "")).ToList();
        return new(e.Id, e.Type, e.Title, e.Description, e.Location, e.LocationLabel, e.DressCode,
            e.StartUtc, e.EndUtc, e.CreatedById, e.CreatedBy?.DisplayName ?? "", isOwner,
            e.MealOptions.ToList(), e.DrinkOptions.ToList(),
            e.ParentEventId, e.ParentEvent?.Title, e.InheritParentInvites, e.CollectChildRsvps,
            e.AllowGuestAlbumUploads, e.ShowInviteesToGuests, e.Visibility,
            e.EnableTranslations, e.Translations ?? new(),
            coOwners, children, invites, groupList.Select(InviteGroupDto.From).ToList(), mine, images);
    }
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
    // null = unchanged, <=0 = detach, >0 = attach to that event.
    public int? ParentEventId { get; set; }
    public bool? InheritParentInvites { get; set; }
    public bool? CollectChildRsvps { get; set; }
    public bool? AllowGuestAlbumUploads { get; set; }
    public bool? ShowInviteesToGuests { get; set; }
    public EventVisibility? Visibility { get; set; }
    public bool? EnableTranslations { get; set; }
    public Dictionary<string, EventTranslation>? Translations { get; set; }
}

public sealed class AddInviteDto { [Required] public string UserId { get; set; } = ""; }
public sealed class AddCoOwnerDto { [Required] public string UserId { get; set; } = ""; }
public sealed class RsvpDto
{
    public InviteStatus? Status { get; set; }
    // null = unchanged; "" = clear; non-empty = set (must match an option).
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
public sealed class SetInviteGroupDto { public int? GroupId { get; set; } }
