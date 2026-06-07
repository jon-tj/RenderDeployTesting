namespace FamilyHub.Model;

public enum InviteStatus
{
    Pending = 0,
    Accepted = 1,
    Declined = 2,
    Maybe = 3
}

public class EventInvite
{
    public int Id { get; set; }

    public int EventId { get; set; }
    public CalendarEvent? Event { get; set; }

    public string InviteeId { get; set; } = string.Empty;
    public AppUser? Invitee { get; set; }

    public InviteStatus Status { get; set; } = InviteStatus.Pending;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
