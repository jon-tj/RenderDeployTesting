using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Services;

public static class EventAccess
{
    public static bool IsOwner(CalendarEvent ev, string uid)
        => ev.CreatedById == uid || (ev.CoOwners?.Any(o => o.UserId == uid) ?? false);

    public static bool IsVisibleTo(CalendarEvent ev, string uid, IReadOnlyDictionary<int, CalendarEvent> byId)
        => IsVisibleTo(ev, uid, byId, new HashSet<int>());

    private static bool IsVisibleTo(CalendarEvent ev, string uid, IReadOnlyDictionary<int, CalendarEvent> byId, HashSet<int> seen)
    {
        if (!seen.Add(ev.Id)) return false;
        if (IsOwner(ev, uid)) return true;
        if (ev.Visibility == EventVisibility.Private) return false;
        if (ev.Visibility == EventVisibility.Open) return true;
        if (ev.Invites.Any(i => i.InviteeId == uid)) return true;
        return ev.InheritParentInvites
            && ev.ParentEventId is int pid
            && byId.TryGetValue(pid, out var parent)
            && IsVisibleTo(parent, uid, byId, seen);
    }

    // Lazy variant for endpoints that only have the leaf event. Private/Open
    // only apply to the leaf; ancestors contribute invites via inheritance.
    public static async Task<bool> IsVisibleAsync(AppDbContext db, CalendarEvent ev, string uid)
    {
        var current = ev;
        var seen = new HashSet<int>();
        while (current is not null && seen.Add(current.Id))
        {
            if (current.CoOwners is null || (current.CoOwners.Count == 0 && current.Id != ev.Id))
                current.CoOwners = await db.EventOwners.Where(o => o.EventId == current.Id).ToListAsync();
            if (IsOwner(current, uid)) return true;
            if (current.Id == ev.Id)
            {
                if (current.Visibility == EventVisibility.Private) return false;
                if (current.Visibility == EventVisibility.Open) return true;
            }
            var invites = current.Invites?.Count > 0
                ? current.Invites
                : await db.Invites.Where(i => i.EventId == current.Id).ToListAsync();
            if (invites.Any(i => i.InviteeId == uid)) return true;
            if (!current.InheritParentInvites || current.ParentEventId is null) return false;
            current = current.ParentEvent
                ?? await db.Events.Include(e => e.Invites).Include(e => e.CoOwners)
                    .FirstOrDefaultAsync(e => e.Id == current.ParentEventId!.Value);
        }
        return false;
    }
}
