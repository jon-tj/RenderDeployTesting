using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Model;

public enum EventType
{
    Wedding = 0,
    FamilyGathering = 1
}

// Visibility of an event:
//   Closed  - default; only invitees (and ancestors if InheritParentInvites) see it.
//   Open    - any authenticated user can view (no invite needed).
//   Private - only the owner can view; the event is hidden from invitees too.
public enum EventVisibility
{
    Closed = 0,
    Open = 1,
    Private = 2,
}

public class CalendarEvent
{
    public int Id { get; set; }

    public EventType Type { get; set; } = EventType.FamilyGathering;

    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

    [MaxLength(200)]
    public string DressCode { get; set; } = string.Empty;

    // When true, the event owner has authored title/description overrides
    // for languages other than the default (English, stored in Title /
    // Description). When false, translations are ignored at render time.
    public bool EnableTranslations { get; set; }

    // Map of BCP-47 language tag -> overrides. The default (English) lives in
    // Title/Description; this dictionary only holds non-default languages.
    public Dictionary<string, EventTranslation> Translations { get; set; } = new();

    [MaxLength(300)]
    public string Location { get; set; } = string.Empty;

    public DateTime StartUtc { get; set; }
    public DateTime EndUtc { get; set; }

    public string CreatedById { get; set; } = string.Empty;
    public AppUser? CreatedBy { get; set; }

    // Predefined meal and drink choices an invitee can pick from when RSVPing.
    // Empty lists mean "no choices offered" — the UI then just shows the RSVP.
    public List<string> MealOptions { get; set; } = new();
    public List<string> DrinkOptions { get; set; } = new();

    // Optional parent event for grouping (e.g. a wedding with reception and
    // ceremony as children). Depth is capped at 1 by the controller.
    public int? ParentEventId { get; set; }
    public CalendarEvent? ParentEvent { get; set; }
    public List<CalendarEvent> Children { get; set; } = new();

    // When true, anyone invited to the parent chain is also considered
    // invited to this event for visibility purposes. Only meaningful when
    // ParentEventId is set; ignored otherwise.
    public bool InheritParentInvites { get; set; }

    // When true, RSVPs made on this event ripple down to every child invite
    // for the same user and the view page shows one RSVP card. When false,
    // the view hides the parent RSVP and shows a per-child RSVP form.
    // Only meaningful when the event has children.
    public bool CollectChildRsvps { get; set; } = true;

    // When true, any user who can see this event can also upload Album
    // images. Banner and Icon uploads remain owner-only regardless.
    public bool AllowGuestAlbumUploads { get; set; }

    // When true, non-owner participants can see the full invitee list. When
    // false, only the event owner sees it. Default is true to preserve the
    // historical behaviour for events created before this flag existed.
    public bool ShowInviteesToGuests { get; set; } = true;

    // Controls who can view this event. See EventVisibility.
    public EventVisibility Visibility { get; set; } = EventVisibility.Closed;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<EventInvite> Invites { get; set; } = new();

    public List<EventImage> Images { get; set; } = new();

    // Additional owners on top of the creator (CreatedById). Anyone in this
    // list has the same edit/visibility rights as the creator.
    public List<EventOwner> CoOwners { get; set; } = new();
}
