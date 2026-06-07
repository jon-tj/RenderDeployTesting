namespace FamilyHub.Model;

using System.ComponentModel.DataAnnotations;

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

    // Invitee's pick from the event's MealOptions / DrinkOptions. Stored as
    // free text rather than an FK to keep the option-list mutable without
    // having to rewrite every existing invite.
    [MaxLength(200)]
    public string? MealChoice { get; set; }

    [MaxLength(200)]
    public string? DrinkChoice { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
