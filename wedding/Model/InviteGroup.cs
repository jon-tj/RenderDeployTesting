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

    // Whitelist of child event IDs the group is allowed to see. Empty list
    // means the group sees no children (still sees the parent). Owners
    // always see every child regardless.
    public List<int> VisibleChildEventIds { get; set; } = new();

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<EventInvite> Invites { get; set; } = new();
}
