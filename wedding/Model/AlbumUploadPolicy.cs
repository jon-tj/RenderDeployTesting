namespace FamilyHub.Model;

// Controls when non-owners may upload Album images to an event.
//   OwnersOnly           - default; only event owners may upload.
//   AlwaysOpen           - any user who can see the event can upload.
//   OpenAfterEventStarted   - guests may upload from StartUtc onward.
//   OpenAfterEventConcluded - guests may upload from EndUtc onward.
public enum AlbumUploadPolicy
{
    OwnersOnly = 0,
    AlwaysOpen = 1,
    OpenAfterEventStarted = 2,
    OpenAfterEventConcluded = 3,
}
