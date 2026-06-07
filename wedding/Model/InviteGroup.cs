namespace FamilyHub.Model;

using System.ComponentModel.DataAnnotations;

// A named bucket of invitees attached to a parent event (typically a
// wedding). Each invite belongs to at most one group per event; the group
// controls (a) which child events the invitee can see and (b) when the
// invitation email is sent and when the parent event becomes visible.
public class InviteGroup
{
    public int Id { get; set; }

    public int EventId { get; set; }
    public CalendarEvent? Event { get; set; }

    [MaxLength(120)]
    public string Name { get; set; } = string.Empty;

    // When the group "goes public". Until this time:
    //   - members do not see the event in their listing,
    //   - the scheduled-invite worker holds off on sending their email.
    // Null means "always public" (visible immediately; email sent on demand).
    public DateTime? GoPublicAtUtc { get; set; }

    // Whitelist of child event IDs the group is allowed to see. Empty list
    // means the group sees no children (still sees the parent after going
    // public). Owners always see every child regardless.
    public List<int> VisibleChildEventIds { get; set; } = new();

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<EventInvite> Invites { get; set; } = new();
}
