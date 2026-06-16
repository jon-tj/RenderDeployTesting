using System.Text.Json;
using FamilyHub.Model;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace FamilyHub.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityDbContext<AppUser>(options)
{
    public DbSet<DietaryPreferences> DietaryPreferences => Set<DietaryPreferences>();
    public DbSet<CalendarEvent> Events => Set<CalendarEvent>();
    public DbSet<EventInvite> Invites => Set<EventInvite>();
    public DbSet<EventImage> Images => Set<EventImage>();
    public DbSet<EventOwner> EventOwners => Set<EventOwner>();
    public DbSet<InviteGroup> InviteGroups => Set<InviteGroup>();
    public DbSet<Wishlist> Wishlists => Set<Wishlist>();
    public DbSet<WishlistItem> WishlistItems => Set<WishlistItem>();
    public DbSet<WishlistClaim> WishlistClaims => Set<WishlistClaim>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<TeamMember> TeamMembers => Set<TeamMember>();
    public DbSet<TeamScore> TeamScores => Set<TeamScore>();

    // List<T> persisted as a `sep`-joined string. Used for option lists, allergens, ids.
    static (ValueConverter<List<T>, string>, ValueComparer<List<T>>) ListConverter<T>(char sep, Func<T, string> toStr, Func<string, T> fromStr) =>
        (new(v => string.Join(sep, v.Select(toStr)),
             v => string.IsNullOrEmpty(v) ? new() : v.Split(sep, StringSplitOptions.RemoveEmptyEntries).Select(fromStr).ToList()),
         new(
            (a, b) => (a ?? new()).SequenceEqual(b ?? new()),
            v => v.Aggregate(0, (h, x) => HashCode.Combine(h, x!.GetHashCode())),
            v => v.ToList()));

    static (ValueConverter<T, string>, ValueComparer<T>) JsonConverter<T>() where T : class, new() =>
        (new(v => JsonSerializer.Serialize(v, (JsonSerializerOptions?)null),
             v => string.IsNullOrEmpty(v) ? new() : JsonSerializer.Deserialize<T>(v, (JsonSerializerOptions?)null) ?? new()),
         new(
            (a, b) => JsonSerializer.Serialize(a, (JsonSerializerOptions?)null) == JsonSerializer.Serialize(b, (JsonSerializerOptions?)null),
            v => v == null ? 0 : JsonSerializer.Serialize(v, (JsonSerializerOptions?)null).GetHashCode(),
            v => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(v, (JsonSerializerOptions?)null), (JsonSerializerOptions?)null) ?? new()));

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);

        var (allergenConv, allergenCmp) = ListConverter<Allergen>(',', a => ((int)a).ToString(), s => (Allergen)int.Parse(s));
        var (strListConv, strListCmp) = ListConverter<string>('\n', s => s, s => s);
        var (intListConv, intListCmp) = ListConverter<int>(',', i => i.ToString(), int.Parse);
        var (trConv, trCmp) = JsonConverter<Dictionary<string, EventTranslation>>();

        b.Entity<AppUser>().HasOne(u => u.DietaryPreferences).WithOne(d => d.User!)
            .HasForeignKey<DietaryPreferences>(d => d.UserId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<DietaryPreferences>().Property(d => d.Allergens).HasConversion(allergenConv, allergenCmp);

        b.Entity<CalendarEvent>().HasOne(e => e.CreatedBy).WithMany()
            .HasForeignKey(e => e.CreatedById).OnDelete(DeleteBehavior.Restrict);
        b.Entity<CalendarEvent>().HasOne(e => e.ParentEvent).WithMany(e => e.Children)
            .HasForeignKey(e => e.ParentEventId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<CalendarEvent>().Property(e => e.MealOptions).HasConversion(strListConv, strListCmp);
        b.Entity<CalendarEvent>().Property(e => e.DrinkOptions).HasConversion(strListConv, strListCmp);
        b.Entity<CalendarEvent>().Property(e => e.Translations).HasConversion(trConv, trCmp);

        b.Entity<EventInvite>().HasOne(i => i.Event).WithMany(e => e.Invites)
            .HasForeignKey(i => i.EventId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<EventInvite>().HasOne(i => i.Invitee).WithMany()
            .HasForeignKey(i => i.InviteeId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<EventInvite>().HasIndex(i => new { i.EventId, i.InviteeId }).IsUnique();
        b.Entity<EventInvite>().HasOne(i => i.InviteGroup).WithMany(g => g.Invites)
            .HasForeignKey(i => i.InviteGroupId).OnDelete(DeleteBehavior.SetNull);

        b.Entity<EventImage>().HasOne(i => i.Event).WithMany(e => e.Images)
            .HasForeignKey(i => i.EventId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<EventImage>().HasOne(i => i.UploadedBy).WithMany()
            .HasForeignKey(i => i.UploadedById).OnDelete(DeleteBehavior.Restrict);

        b.Entity<EventOwner>().HasKey(o => new { o.EventId, o.UserId });
        b.Entity<EventOwner>().HasOne(o => o.Event).WithMany(e => e.CoOwners)
            .HasForeignKey(o => o.EventId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<EventOwner>().HasOne(o => o.User).WithMany()
            .HasForeignKey(o => o.UserId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<InviteGroup>().HasOne(g => g.Event).WithMany()
            .HasForeignKey(g => g.EventId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<InviteGroup>().Property(g => g.VisibleChildEventIds).HasConversion(intListConv, intListCmp);

        b.Entity<Wishlist>().HasOne(w => w.Event).WithMany()
            .HasForeignKey(w => w.EventId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Wishlist>().HasOne(w => w.Owner).WithMany()
            .HasForeignKey(w => w.OwnerUserId).OnDelete(DeleteBehavior.Cascade);
        // At most one wishlist per event and per user.
        b.Entity<Wishlist>().HasIndex(w => w.EventId).IsUnique().HasFilter("\"EventId\" IS NOT NULL");
        b.Entity<Wishlist>().HasIndex(w => w.OwnerUserId).IsUnique().HasFilter("\"OwnerUserId\" IS NOT NULL");

        b.Entity<WishlistItem>().HasOne(i => i.Wishlist).WithMany(w => w.Items)
            .HasForeignKey(i => i.WishlistId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<WishlistClaim>().HasOne(c => c.Item).WithMany(i => i.Claims)
            .HasForeignKey(c => c.ItemId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<WishlistClaim>().HasOne(c => c.Claimant).WithMany()
            .HasForeignKey(c => c.ClaimantUserId).OnDelete(DeleteBehavior.SetNull);

        b.Entity<TeamMember>().HasKey(m => new { m.TeamId, m.UserId });
        b.Entity<TeamMember>().HasOne(m => m.Team).WithMany(t => t.Members)
            .HasForeignKey(m => m.TeamId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<TeamMember>().HasOne(m => m.User).WithMany()
            .HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<TeamScore>().HasOne(s => s.Team).WithMany()
            .HasForeignKey(s => s.TeamId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<TeamScore>().HasIndex(s => s.GameId);
        b.Entity<TeamScore>().HasIndex(s => new { s.GameId, s.GameConfigsId });
    }
}
