using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Model;

public enum EventType
{
    Wedding = 0,
    FamilyGathering = 1
}

public class CalendarEvent
{
    public int Id { get; set; }

    public EventType Type { get; set; } = EventType.FamilyGathering;

    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    [MaxLength(2000)]
    public string Description { get; set; } = string.Empty;

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

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public List<EventInvite> Invites { get; set; } = new();
}
