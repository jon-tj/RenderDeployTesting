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
    public DbSet<EventImage> Images => Set<EventImage>();
    public DbSet<EventOwner> EventOwners => Set<EventOwner>();
    public DbSet<InviteGroup> InviteGroups => Set<InviteGroup>();
    public DbSet<WishlistItem> WishlistItems => Set<WishlistItem>();
    public DbSet<WishlistClaim> WishlistClaims => Set<WishlistClaim>();

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

        b.Entity<CalendarEvent>()
            .HasOne(e => e.ParentEvent)
            .WithMany(e => e.Children)
            .HasForeignKey(e => e.ParentEventId)
            .OnDelete(DeleteBehavior.Cascade);

        // Persist the option lists as newline-separated strings. Newline is
        // safe because option labels are single-line, and it avoids needing
        // a separate child table for what's effectively a config blob.
        var stringListConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<List<string>, string>(
            v => string.Join('\n', v),
            v => string.IsNullOrEmpty(v)
                ? new List<string>()
                : v.Split('\n', StringSplitOptions.RemoveEmptyEntries).ToList());

        var stringListComparer = new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<string>>(
            (a, b) => (a ?? new()).SequenceEqual(b ?? new()),
            v => v.Aggregate(0, (h, s) => HashCode.Combine(h, s.GetHashCode())),
            v => v.ToList());

        b.Entity<CalendarEvent>()
            .Property(e => e.MealOptions)
            .HasConversion(stringListConverter, stringListComparer);

        b.Entity<CalendarEvent>()
            .Property(e => e.DrinkOptions)
            .HasConversion(stringListConverter, stringListComparer);

        // Translations live as a JSON blob — tiny payload, no separate join
        // table, and aligns with how MealOptions/DrinkOptions are stored.
        var translationsConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<Dictionary<string, EventTranslation>, string>(
            v => System.Text.Json.JsonSerializer.Serialize(v ?? new(), (System.Text.Json.JsonSerializerOptions?)null),
            v => string.IsNullOrEmpty(v)
                ? new Dictionary<string, EventTranslation>()
                : System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, EventTranslation>>(v, (System.Text.Json.JsonSerializerOptions?)null) ?? new());

        var translationsComparer = new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<Dictionary<string, EventTranslation>>(
            (a, b) => System.Text.Json.JsonSerializer.Serialize(a, (System.Text.Json.JsonSerializerOptions?)null) == System.Text.Json.JsonSerializer.Serialize(b, (System.Text.Json.JsonSerializerOptions?)null),
            v => v == null ? 0 : System.Text.Json.JsonSerializer.Serialize(v, (System.Text.Json.JsonSerializerOptions?)null).GetHashCode(),
            v => System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, EventTranslation>>(System.Text.Json.JsonSerializer.Serialize(v, (System.Text.Json.JsonSerializerOptions?)null), (System.Text.Json.JsonSerializerOptions?)null) ?? new());

        b.Entity<CalendarEvent>()
            .Property(e => e.Translations)
            .HasConversion(translationsConverter, translationsComparer);

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

        b.Entity<EventImage>()
            .HasOne(i => i.Event)
            .WithMany(e => e.Images)
            .HasForeignKey(i => i.EventId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<EventImage>()
            .HasOne(i => i.UploadedBy)
            .WithMany()
            .HasForeignKey(i => i.UploadedById)
            .OnDelete(DeleteBehavior.Restrict);

        b.Entity<EventOwner>()
            .HasKey(o => new { o.EventId, o.UserId });

        b.Entity<EventOwner>()
            .HasOne(o => o.Event)
            .WithMany(e => e.CoOwners)
            .HasForeignKey(o => o.EventId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<EventOwner>()
            .HasOne(o => o.User)
            .WithMany()
            .HasForeignKey(o => o.UserId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<InviteGroup>()
            .HasOne(g => g.Event)
            .WithMany()
            .HasForeignKey(g => g.EventId)
            .OnDelete(DeleteBehavior.Cascade);

        var intListConverter = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<List<int>, string>(
            v => string.Join(',', v),
            v => string.IsNullOrEmpty(v)
                ? new List<int>()
                : v.Split(',', StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToList());
        var intListComparer = new Microsoft.EntityFrameworkCore.ChangeTracking.ValueComparer<List<int>>(
            (a, b) => (a ?? new()).SequenceEqual(b ?? new()),
            v => v.Aggregate(0, (h, i) => HashCode.Combine(h, i)),
            v => v.ToList());
        b.Entity<InviteGroup>()
            .Property(g => g.VisibleChildEventIds)
            .HasConversion(intListConverter, intListComparer);

        b.Entity<EventInvite>()
            .HasOne(i => i.InviteGroup)
            .WithMany(g => g.Invites)
            .HasForeignKey(i => i.InviteGroupId)
            .OnDelete(DeleteBehavior.SetNull);

        b.Entity<WishlistItem>()
            .HasOne(w => w.Event)
            .WithMany()
            .HasForeignKey(w => w.EventId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<WishlistClaim>()
            .HasOne(c => c.Item)
            .WithMany(i => i.Claims)
            .HasForeignKey(c => c.ItemId)
            .OnDelete(DeleteBehavior.Cascade);

        b.Entity<WishlistClaim>()
            .HasOne(c => c.Claimant)
            .WithMany()
            .HasForeignKey(c => c.ClaimantUserId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
