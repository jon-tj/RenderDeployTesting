using System.IO.Compression;
using System.ComponentModel.DataAnnotations;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using FamilyHub.Data;
using FamilyHub.Model;
using FamilyHub.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Controllers;

// Export an event (and everything attached to it — children, images, invites,
// invite groups, wishlist) as a ZIP. The ZIP contains a single `event.json`
// describing the data and one `images/...` file per stored image. Importing
// the same ZIP recreates the event under the current user; user-linked data
// (invites, co-owners, wishlist claims) is best-effort: rows whose referenced
// user no longer exists are skipped.
[ApiController, Route("api/events"), Authorize]
public class EventBackupController(AppDbContext db, UserManager<AppUser> users) : ControllerBase
{
    const int BackupVersion = 1;

    static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new UtcDateTimeConverter() },
    };

    string Uid => users.GetUserId(User)!;

    [HttpGet("{id:int}/export")]
    public async Task<IActionResult> Export(int id)
    {
        var ev = await db.Events
            .Include(e => e.CreatedBy)
            .Include(e => e.CoOwners).ThenInclude(o => o.User)
            .Include(e => e.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.Images)
            .Include(e => e.Children).ThenInclude(c => c.CoOwners).ThenInclude(o => o.User)
            .Include(e => e.Children).ThenInclude(c => c.Invites).ThenInclude(i => i.Invitee)
            .Include(e => e.Children).ThenInclude(c => c.Images)
            .FirstOrDefaultAsync(e => e.Id == id);
        if (ev is null) return NotFound();
        if (!EventAccess.IsOwner(ev, Uid)) return Forbid();

        var groups = await db.InviteGroups.Where(g => g.EventId == ev.Id).ToListAsync();
        var wishlist = await db.Wishlists
            .Include(w => w.Items).ThenInclude(i => i.Claims).ThenInclude(c => c.Claimant)
            .FirstOrDefaultAsync(w => w.EventId == ev.Id);

        var backup = new EventBackup
        {
            Version = BackupVersion,
            ExportedAtUtc = DateTime.UtcNow,
            OriginalId = ev.Id,
            Event = EventNode.From(ev),
            Children = ev.Children.OrderBy(c => c.StartUtc).Select(EventNode.From).ToList(),
            Groups = groups.Select(g => new GroupNode(g.Id, g.Name, g.VisibleChildEventIds.ToList())).ToList(),
            Wishlist = wishlist is null ? null : WishlistNode.From(wishlist),
        };

        using var ms = new MemoryStream();
        using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, leaveOpen: true))
        {
            await using (var entry = zip.CreateEntry("event.json", CompressionLevel.Optimal).Open())
            {
                await JsonSerializer.SerializeAsync(entry, backup, Json);
            }
            // Image blobs: every image (parent + children + wishlist items).
            var allImages = ev.Images.Concat(ev.Children.SelectMany(c => c.Images));
            foreach (var img in allImages)
            {
                var path = ImagePath(img);
                await using var stream = zip.CreateEntry(path, CompressionLevel.NoCompression).Open();
                await stream.WriteAsync(img.Data);
            }
            if (wishlist is not null)
            {
                foreach (var item in wishlist.Items)
                {
                    if (item.ImageData is not { Length: > 0 }) continue;
                    var path = WishlistImagePath(item);
                    await using var stream = zip.CreateEntry(path, CompressionLevel.NoCompression).Open();
                    await stream.WriteAsync(item.ImageData);
                }
            }
        }
        ms.Position = 0;
        var safeTitle = SafeName(ev.Title);
        var fileName = $"{safeTitle}-{ev.Id}-{DateTime.UtcNow:yyyyMMdd-HHmmss}.zip";
        return File(ms.ToArray(), "application/zip", fileName);
    }

    [HttpPost("import"), RequestSizeLimit(200 * 1024 * 1024)]
    public async Task<ActionResult<int>> Import(IFormFile file, [FromQuery] bool force = false)
    {
        if (file is null || file.Length == 0) return BadRequest("Missing file.");
        var uid = Uid;
        var user = await users.FindByIdAsync(uid);
        if (user is null) return Unauthorized();

        await using var stream = file.OpenReadStream();
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);

        var manifestEntry = zip.GetEntry("event.json") ?? throw new InvalidDataException();
        EventBackup? backup;
        await using (var ms = manifestEntry.Open())
            backup = await JsonSerializer.DeserializeAsync<EventBackup>(ms, Json);
        if (backup is null || backup.Event is null) return BadRequest("Invalid backup.");
        if (backup.Version > BackupVersion) return BadRequest($"Backup version {backup.Version} is newer than supported ({BackupVersion}).");

        if (!CanCreate(user, backup.Event.Type)) return Forbid();

        // Duplicate check: same owner (current user) already has an event
        // with matching title and start. Caller can override with ?force=true.
        if (!force)
        {
            var title = backup.Event.Title ?? "";
            var startUtc = backup.Event.StartUtc;
            var dup = await db.Events
                .Where(e => e.CreatedById == uid && e.ParentEventId == null
                    && e.Title == title && e.StartUtc == startUtc)
                .Select(e => new { e.Id, e.Title, e.StartUtc })
                .FirstOrDefaultAsync();
            if (dup is not null)
            {
                return Conflict(new
                {
                    duplicate = true,
                    existingId = dup.Id,
                    title = dup.Title,
                    startUtc = dup.StartUtc,
                });
            }
        }

        // Per-import cache so each email is resolved (and possibly created)
        // exactly once across invites, co-owners, and wishlist claims.
        var userCache = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);

        // Phase 1: create the parent event (no FKs to children yet).
        var parent = backup.Event.ToEntity(uid);
        db.Events.Add(parent);
        await db.SaveChangesAsync();

        // CoOwners (skip the creator themselves).
        foreach (var co in backup.Event.CoOwners)
        {
            var resolved = await ResolveOrCreateUser(userCache, co.Email, co.DisplayName);
            if (resolved is null || resolved == uid) continue;
            db.EventOwners.Add(new EventOwner { EventId = parent.Id, UserId = resolved });
        }

        // Invites for the parent.
        await AttachInvites(parent, backup.Event.Invites, userCache);

        // Images on the parent.
        AttachImages(parent, backup.Event.Images, zip, uid);

        // Phase 2: children — track original->new id mapping for group whitelists.
        var childIdMap = new Dictionary<int, int>();
        foreach (var childNode in backup.Children)
        {
            var child = childNode.ToEntity(uid);
            child.ParentEventId = parent.Id;
            db.Events.Add(child);
            await db.SaveChangesAsync();
            childIdMap[childNode.Id] = child.Id;
            foreach (var co in childNode.CoOwners)
            {
                var resolved = await ResolveOrCreateUser(userCache, co.Email, co.DisplayName);
                if (resolved is null || resolved == uid) continue;
                db.EventOwners.Add(new EventOwner { EventId = child.Id, UserId = resolved });
            }
            await AttachInvites(child, childNode.Invites, userCache);
            AttachImages(child, childNode.Images, zip, uid);
        }
        await db.SaveChangesAsync();

        // Invite groups: remap visible-child ids.
        foreach (var g in backup.Groups)
        {
            var visible = g.VisibleChildEventIds
                .Select(oid => childIdMap.TryGetValue(oid, out var nid) ? (int?)nid : null)
                .Where(nid => nid.HasValue).Select(nid => nid!.Value).ToList();
            db.InviteGroups.Add(new InviteGroup { EventId = parent.Id, Name = g.Name, VisibleChildEventIds = visible });
        }
        await db.SaveChangesAsync();

        // Wishlist (and items + anonymous claims).
        if (backup.Wishlist is { } w)
        {
            var wishlist = new Wishlist
            {
                EventId = parent.Id,
                ClaimMode = w.ClaimMode,
                PixKey = w.PixKey,
            };
            db.Wishlists.Add(wishlist);
            await db.SaveChangesAsync();
            foreach (var itemNode in w.Items)
            {
                var item = new WishlistItem
                {
                    WishlistId = wishlist.Id,
                    Name = itemNode.Name,
                    Description = itemNode.Description,
                    Url = itemNode.Url,
                    ImageUrl = itemNode.ImageUrl,
                    PriceMinor = itemNode.PriceMinor,
                    Currency = itemNode.Currency,
                    WishedQuantity = itemNode.WishedQuantity,
                };
                if (!string.IsNullOrEmpty(itemNode.ImageFile))
                {
                    var entry = zip.GetEntry(itemNode.ImageFile);
                    if (entry is not null)
                    {
                        await using var es = entry.Open();
                        using var copy = new MemoryStream();
                        await es.CopyToAsync(copy);
                        item.ImageData = copy.ToArray();
                        item.ImageContentType = itemNode.ImageContentType;
                    }
                }
                db.WishlistItems.Add(item);
                await db.SaveChangesAsync();
                foreach (var claim in itemNode.Claims)
                {
                    var claimantId = await ResolveOrCreateUser(userCache, claim.ClaimantEmail, claim.ClaimantLabel);
                    db.WishlistClaims.Add(new WishlistClaim
                    {
                        ItemId = item.Id,
                        ClaimantUserId = claimantId,
                        ClaimantLabel = claim.ClaimantLabel,
                        Quantity = claim.Quantity,
                    });
                }
            }
            await db.SaveChangesAsync();
        }

        return Ok(parent.Id);
    }

    // Resolves a backup-referenced user by email. If the email matches an
    // existing account, returns its id (and the cached display name is
    // discarded). Otherwise creates an invite-stub account — same shape as
    // POST /api/users/invite-stub — so future logins by that email reclaim
    // the invites. Returns null when the email is missing/invalid or the
    // stub creation fails.
    async Task<string?> ResolveOrCreateUser(Dictionary<string, string?> cache, string? email, string? displayName)
    {
        var key = (email ?? "").Trim().ToLowerInvariant();
        if (key.Length == 0 || !new EmailAddressAttribute().IsValid(key)) return null;
        if (cache.TryGetValue(key, out var cached)) return cached;

        var existing = await users.FindByEmailAsync(key);
        if (existing is not null)
        {
            cache[key] = existing.Id;
            return existing.Id;
        }

        var stub = new AppUser
        {
            UserName = key,
            Email = key,
            DisplayName = string.IsNullOrWhiteSpace(displayName) ? key : displayName.Trim(),
            DietaryPreferences = new DietaryPreferences(),
        };
        var r = await users.CreateAsync(stub);
        var id = r.Succeeded ? stub.Id : null;
        cache[key] = id;
        return id;
    }

    async Task AttachInvites(CalendarEvent ev, List<InviteNode> invites, Dictionary<string, string?> userCache)
    {
        foreach (var inv in invites)
        {
            var resolved = await ResolveOrCreateUser(userCache, inv.InviteeEmail, inv.InviteeDisplayName);
            if (resolved is null) continue;
            db.Invites.Add(new EventInvite
            {
                EventId = ev.Id,
                InviteeId = resolved,
                Status = inv.Status,
                MealChoice = inv.MealChoice,
                DrinkChoice = inv.DrinkChoice,
            });
        }
    }

    void AttachImages(CalendarEvent ev, List<ImageNode> images, ZipArchive zip, string uid)
    {
        foreach (var node in images)
        {
            if (string.IsNullOrEmpty(node.File)) continue;
            var entry = zip.GetEntry(node.File);
            if (entry is null) continue;
            using var ms = new MemoryStream();
            using (var s = entry.Open()) s.CopyTo(ms);
            db.Images.Add(new EventImage
            {
                EventId = ev.Id,
                Role = node.Role,
                Description = node.Description,
                FileName = node.FileName,
                ContentType = node.ContentType,
                Data = ms.ToArray(),
                UploadedById = uid,
                UploadedAtUtc = node.UploadedAtUtc,
            });
        }
    }

    static bool CanCreate(AppUser user, EventType type) => type switch
    {
        EventType.Wedding => user.CanCreateWeddingEvent,
        EventType.FamilyGathering => user.CanCreateFamilyGathering || user.CanCreateWeddingEvent,
        _ => false,
    };

    static string ImagePath(EventImage img)
    {
        var safe = SafeName(string.IsNullOrEmpty(img.FileName) ? $"image-{img.Id}" : img.FileName);
        return $"images/{img.EventId}-{img.Id}-{safe}";
    }

    static string WishlistImagePath(WishlistItem item) => $"wishlist/{item.Id}.bin";

    static string SafeName(string raw)
    {
        var sb = new StringBuilder(raw.Length);
        foreach (var ch in raw)
            sb.Append(char.IsLetterOrDigit(ch) || ch is '.' or '-' or '_' ? ch : '_');
        var s = sb.ToString();
        if (s.Length > 80) s = s[..80];
        return string.IsNullOrEmpty(s) ? "x" : s;
    }
}

// ---- Backup DTOs ----------------------------------------------------------

// PostgreSQL timestamptz columns require DateTimeKind.Utc; System.Text.Json
// deserializes DateTime as Kind=Unspecified by default.
sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        var v = reader.GetDateTime();
        return v.Kind switch
        {
            DateTimeKind.Utc => v,
            DateTimeKind.Local => v.ToUniversalTime(),
            _ => DateTime.SpecifyKind(v, DateTimeKind.Utc),
        };
    }

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        => writer.WriteStringValue(value.Kind == DateTimeKind.Utc ? value : value.ToUniversalTime());
}

public sealed class EventBackup
{
    public int Version { get; set; }
    public DateTime ExportedAtUtc { get; set; }
    public int OriginalId { get; set; }
    public EventNode Event { get; set; } = new();
    public List<EventNode> Children { get; set; } = new();
    public List<GroupNode> Groups { get; set; } = new();
    public WishlistNode? Wishlist { get; set; }
}

public sealed class EventNode
{
    public int Id { get; set; }
    public EventType Type { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public string DressCode { get; set; } = "";
    public string Location { get; set; } = "";
    public string LocationLabel { get; set; } = "";
    public DateTime StartUtc { get; set; }
    public DateTime EndUtc { get; set; }
    public List<string> MealOptions { get; set; } = new();
    public List<string> DrinkOptions { get; set; } = new();
    public bool InheritParentInvites { get; set; }
    public bool CollectChildRsvps { get; set; } = true;
    public AlbumUploadPolicy AlbumUploadPolicy { get; set; } = AlbumUploadPolicy.OwnersOnly;
    public bool ShowInviteesToGuests { get; set; } = true;
    public EventVisibility Visibility { get; set; }
    public bool EnableTranslations { get; set; }
    public Dictionary<string, EventTranslation> Translations { get; set; } = new();
    public List<UserRef> CoOwners { get; set; } = new();
    public List<InviteNode> Invites { get; set; } = new();
    public List<ImageNode> Images { get; set; } = new();

    public static EventNode From(CalendarEvent e) => new()
    {
        Id = e.Id, Type = e.Type, Title = e.Title, Description = e.Description, DressCode = e.DressCode,
        Location = e.Location, LocationLabel = e.LocationLabel, StartUtc = e.StartUtc, EndUtc = e.EndUtc,
        MealOptions = e.MealOptions.ToList(), DrinkOptions = e.DrinkOptions.ToList(),
        InheritParentInvites = e.InheritParentInvites, CollectChildRsvps = e.CollectChildRsvps,
        AlbumUploadPolicy = e.AlbumUploadPolicy, ShowInviteesToGuests = e.ShowInviteesToGuests,
        Visibility = e.Visibility, EnableTranslations = e.EnableTranslations,
        Translations = e.Translations ?? new(),
        CoOwners = (e.CoOwners ?? new()).Select(c => new UserRef(c.UserId, c.User?.Email ?? "", c.User?.DisplayName ?? "")).ToList(),
        Invites = (e.Invites ?? new()).Select(InviteNode.From).ToList(),
        Images = (e.Images ?? new()).Select(ImageNode.From).ToList(),
    };

    public CalendarEvent ToEntity(string creatorId) => new()
    {
        Type = Type, Title = Title, Description = Description, DressCode = DressCode,
        Location = Location, LocationLabel = LocationLabel, StartUtc = StartUtc, EndUtc = EndUtc,
        MealOptions = MealOptions.ToList(), DrinkOptions = DrinkOptions.ToList(),
        InheritParentInvites = InheritParentInvites, CollectChildRsvps = CollectChildRsvps,
        AlbumUploadPolicy = AlbumUploadPolicy, ShowInviteesToGuests = ShowInviteesToGuests,
        Visibility = Visibility, EnableTranslations = EnableTranslations,
        Translations = Translations ?? new(),
        CreatedById = creatorId,
        CreatedAtUtc = DateTime.UtcNow,
    };
}

public sealed record UserRef(string UserId, string Email, string DisplayName);

public sealed class InviteNode
{
    public string InviteeId { get; set; } = "";
    public string InviteeEmail { get; set; } = "";
    public string InviteeDisplayName { get; set; } = "";
    public InviteStatus Status { get; set; }
    public string? MealChoice { get; set; }
    public string? DrinkChoice { get; set; }

    public static InviteNode From(EventInvite i) => new()
    {
        InviteeId = i.InviteeId,
        InviteeEmail = i.Invitee?.Email ?? "",
        InviteeDisplayName = i.Invitee?.DisplayName ?? "",
        Status = i.Status, MealChoice = i.MealChoice, DrinkChoice = i.DrinkChoice,
    };
}

public sealed class ImageNode
{
    public int Id { get; set; }
    public ImageRole Role { get; set; }
    public string Description { get; set; } = "";
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public DateTime UploadedAtUtc { get; set; }
    public string File { get; set; } = "";

    public static ImageNode From(EventImage i)
    {
        var safe = string.IsNullOrEmpty(i.FileName) ? $"image-{i.Id}" : i.FileName;
        var sb = new StringBuilder(safe.Length);
        foreach (var ch in safe) sb.Append(char.IsLetterOrDigit(ch) || ch is '.' or '-' or '_' ? ch : '_');
        return new()
        {
            Id = i.Id, Role = i.Role, Description = i.Description, FileName = i.FileName,
            ContentType = i.ContentType, UploadedAtUtc = i.UploadedAtUtc,
            File = $"images/{i.EventId}-{i.Id}-{sb}",
        };
    }
}

public sealed class GroupNode
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public List<int> VisibleChildEventIds { get; set; } = new();
    public GroupNode() { }
    public GroupNode(int id, string name, List<int> visible) { Id = id; Name = name; VisibleChildEventIds = visible; }
}

public sealed class WishlistNode
{
    public WishlistClaimMode ClaimMode { get; set; }
    public string PixKey { get; set; } = "";
    public List<WishlistItemNode> Items { get; set; } = new();

    public static WishlistNode From(Wishlist w) => new()
    {
        ClaimMode = w.ClaimMode, PixKey = w.PixKey,
        Items = w.Items.Select(WishlistItemNode.From).ToList(),
    };
}

public sealed class WishlistItemNode
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Url { get; set; } = "";
    public string ImageUrl { get; set; } = "";
    public string ImageContentType { get; set; } = "";
    public string ImageFile { get; set; } = "";
    public long PriceMinor { get; set; }
    public WishlistCurrency Currency { get; set; }
    public int WishedQuantity { get; set; }
    public List<WishlistClaimNode> Claims { get; set; } = new();

    public static WishlistItemNode From(WishlistItem i) => new()
    {
        Id = i.Id, Name = i.Name, Description = i.Description, Url = i.Url, ImageUrl = i.ImageUrl,
        ImageContentType = i.ImageContentType,
        ImageFile = i.ImageData is { Length: > 0 } ? $"wishlist/{i.Id}.bin" : "",
        PriceMinor = i.PriceMinor, Currency = i.Currency, WishedQuantity = i.WishedQuantity,
        Claims = i.Claims.Select(WishlistClaimNode.From).ToList(),
    };
}

public sealed class WishlistClaimNode
{
    public string? ClaimantUserId { get; set; }
    public string? ClaimantEmail { get; set; }
    public string ClaimantLabel { get; set; } = "";
    public int Quantity { get; set; }

    public static WishlistClaimNode From(WishlistClaim c) => new()
    {
        ClaimantUserId = c.ClaimantUserId,
        ClaimantEmail = c.Claimant?.Email,
        ClaimantLabel = c.ClaimantLabel,
        Quantity = c.Quantity,
    };
}
