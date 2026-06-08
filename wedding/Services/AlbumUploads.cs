using FamilyHub.Model;

namespace FamilyHub.Services;

// Centralises the "is the album currently open for guest uploads?" check so
// the API and any export/import paths agree on the rules.
public static class AlbumUploads
{
    public static bool IsOpen(CalendarEvent ev, DateTime? nowUtc = null)
    {
        var now = nowUtc ?? DateTime.UtcNow;
        return ev.AlbumUploadPolicy switch
        {
            AlbumUploadPolicy.AlwaysOpen => true,
            AlbumUploadPolicy.OpenAfterEventStarted => now >= ev.StartUtc,
            AlbumUploadPolicy.OpenAfterEventConcluded => now >= ev.EndUtc,
            _ => false, // OwnersOnly
        };
    }
}
