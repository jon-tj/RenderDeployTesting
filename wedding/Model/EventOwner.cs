namespace FamilyHub.Model;

// Join table giving an event multiple owners. The creator is implicitly an
// owner via CalendarEvent.CreatedById and is never stored here, so removing
// every co-owner still leaves the creator in charge.
public class EventOwner
{
    public int EventId { get; set; }
    public CalendarEvent? Event { get; set; }

    public string UserId { get; set; } = string.Empty;
    public AppUser? User { get; set; }

    public DateTime AddedAtUtc { get; set; } = DateTime.UtcNow;
}
