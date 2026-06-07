namespace FamilyHub.Model;

// An entity that can own assets (currently wishlist items). Implementations
// expose the set of user IDs that are allowed to edit assets attached to
// this owner. The owner is responsible for ensuring any dependent
// relationships (e.g. CalendarEvent.CoOwners) are loaded before the
// property is accessed; callers that need permissioning should use
// `.Include(...)` accordingly.
public interface IAssetOwner
{
    IReadOnlyCollection<string> EditorUserIds { get; }
}
