using FamilyHub.Model;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Data;

public class AppDbContext : IdentityDbContext<AppUser>
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<DietaryPreferences> DietaryPreferences => Set<DietaryPreferences>();
    public DbSet<CalendarEvent> Events => Set<CalendarEvent>();
    public DbSet<EventInvite> Invites => Set<EventInvite>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        b.Entity<AppUser>()
            .HasOne(u => u.DietaryPreferences)
            .WithOne(d => d.User!)
            .HasForeignKey<DietaryPreferences>(d => d.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        // Persist the Allergen list as a comma-separated string. Simple and
        // round-trips cleanly without needing a separate junction table.
        b.Entity<DietaryPreferences>()
            .Property(d => d.Allergens)
            .HasConversion(
                v => string.Join(',', v.Select(a => (int)a)),
                v => string.IsNullOrWhiteSpace(v)
                    ? new List<Allergen>()
                    : v.Split(',', StringSplitOptions.RemoveEmptyEntries)
                        .Select(s => (Allergen)int.Parse(s))
                        .ToList(),
                new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<Allergen>>(
                    (a, b) => (a ?? new()).SequenceEqual(b ?? new()),
                    v => v.Aggregate(0, (h, a) => HashCode.Combine(h, a.GetHashCode())),
                    v => v.ToList()));

        b.Entity<CalendarEvent>()
            .HasOne(e => e.CreatedBy)
            .WithMany()
            .HasForeignKey(e => e.CreatedById)
            .OnDelete(DeleteBehavior.Restrict);

        b.Entity<EventInvite>()
            .HasOne(i => i.Event)
            .WithMany(e => e.Invites)
            .HasForeignKey(i => i.EventId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<EventInvite>()
            .HasOne(i => i.Invitee)
            .WithMany()
            .HasForeignKey(i => i.InviteeId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<EventInvite>()
            .HasIndex(i => new { i.EventId, i.InviteeId })
            .IsUnique();
    }
}
