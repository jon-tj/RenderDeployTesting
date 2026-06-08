using System.ComponentModel.DataAnnotations;
using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Controllers;

[ApiController, Route("api/wishlist")]
public class WishlistController(AppDbContext db, UserManager<AppUser> users) : ControllerBase
{
    // Fixed conversion rates: 1 BRL = 2 NOK = 20 USD.
    private static readonly Dictionary<WishlistCurrency, decimal> ToBrl = new()
    {
        [WishlistCurrency.BRL] = 1m,
        [WishlistCurrency.NOK] = 0.5m,
        [WishlistCurrency.USD] = 0.05m,
    };

    string? Uid => users.GetUserId(User);

    IQueryable<Wishlist> WishlistWithItems() => db.Wishlists
        .Include(w => w.Items).ThenInclude(i => i.Claims);

    Task<Wishlist?> Load(int id) => WishlistWithItems().FirstOrDefaultAsync(w => w.Id == id);

    async Task<IAssetOwner?> LoadOwner(Wishlist w)
    {
        if (w.EventId is int eid)
            return await db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == eid);
        return string.IsNullOrEmpty(w.OwnerUserId) ? null : await users.FindByIdAsync(w.OwnerUserId);
    }

    static bool CanEdit(IAssetOwner owner, string uid) => owner.EditorUserIds.Contains(uid);

    // Loads the item plus the auth info needed by every item endpoint.
    async Task<(WishlistItem? item, IAssetOwner? owner, ActionResult? err)> LoadItemForEdit(int id)
    {
        var item = await db.WishlistItems.Include(i => i.Claims).Include(i => i.Wishlist)
            .FirstOrDefaultAsync(i => i.Id == id);
        var uid = Uid;
        if (uid is null) return (null, null, Unauthorized());
        if (item is null || item.Wishlist is null) return (null, null, NotFound());
        var owner = await LoadOwner(item.Wishlist);
        if (owner is null || !CanEdit(owner, uid)) return (null, null, Forbid());
        return (item, owner, null);
    }

    [HttpGet("{id:int}"), AllowAnonymous]
    public async Task<ActionResult<WishlistViewDto>> Get(int id)
    {
        var w = await Load(id);
        if (w is null) return NotFound();
        var owner = await LoadOwner(w);
        return owner is null ? NotFound() : BuildView(w, owner);
    }

    [HttpGet("for-event/{eventId:int}"), AllowAnonymous]
    public async Task<ActionResult<WishlistViewDto>> GetForEvent(int eventId)
    {
        var ev = await db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == eventId);
        if (ev is null) return NotFound();
        var w = await WishlistWithItems().FirstOrDefaultAsync(x => x.EventId == eventId)
            ?? await Create(new Wishlist { EventId = eventId });
        return BuildView(w, ev);
    }

    [HttpGet("for-user/{userId}"), AllowAnonymous]
    public async Task<ActionResult<WishlistViewDto>> GetForUser(string userId)
    {
        var owner = await users.FindByIdAsync(userId);
        if (owner is null) return NotFound();
        var w = await WishlistWithItems().FirstOrDefaultAsync(x => x.OwnerUserId == userId)
            ?? await Create(new Wishlist { OwnerUserId = userId });
        return BuildView(w, owner);
    }

    [HttpGet("mine"), Authorize]
    public Task<ActionResult<WishlistViewDto>> GetMine() => GetForUser(Uid!);

    async Task<Wishlist> Create(Wishlist fresh)
    {
        db.Wishlists.Add(fresh);
        await db.SaveChangesAsync();
        return fresh;
    }

    [HttpGet("rates"), AllowAnonymous]
    public ActionResult<Dictionary<string, decimal>> GetRates() =>
        ToBrl.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value);

    [HttpPost("{wishlistId:int}/items"), Authorize]
    public async Task<ActionResult<WishlistItemDto>> CreateItem(int wishlistId, [FromBody] WishlistItemWriteDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest("Name is required.");
        var w = await db.Wishlists.FirstOrDefaultAsync(x => x.Id == wishlistId);
        if (w is null) return NotFound();
        var owner = await LoadOwner(w);
        var uid = Uid;
        if (uid is null) return Unauthorized();
        if (owner is null || !CanEdit(owner, uid)) return Forbid();

        var item = new WishlistItem
        {
            WishlistId = w.Id,
            Name = dto.Name.Trim(),
            Description = (dto.Description ?? "").Trim(),
            Url = (dto.Url ?? "").Trim(),
            ImageUrl = (dto.ImageUrl ?? "").Trim(),
            PriceMinor = Math.Max(0, dto.PriceMinor ?? 0),
            Currency = dto.Currency ?? WishlistCurrency.BRL,
            WishedQuantity = Math.Max(1, dto.WishedQuantity ?? 1),
        };
        db.WishlistItems.Add(item);
        await db.SaveChangesAsync();
        return WishlistItemDto.From(item, true, uid);
    }

    [HttpPut("items/{id:int}"), Authorize]
    public async Task<ActionResult<WishlistItemDto>> UpdateItem(int id, [FromBody] WishlistItemWriteDto dto)
    {
        var (item, _, err) = await LoadItemForEdit(id);
        if (err is not null) return err;
        if (dto.Name is not null)
        {
            var n = dto.Name.Trim();
            if (n.Length == 0) return BadRequest("Name is required.");
            item!.Name = n;
        }
        if (dto.Description is not null) item!.Description = dto.Description.Trim();
        if (dto.Url is not null) item!.Url = dto.Url.Trim();
        if (dto.ImageUrl is not null) item!.ImageUrl = dto.ImageUrl.Trim();
        if (dto.PriceMinor is { } p) item!.PriceMinor = Math.Max(0, p);
        if (dto.Currency is { } c) item!.Currency = c;
        if (dto.WishedQuantity is { } q) item!.WishedQuantity = Math.Max(1, q);
        await db.SaveChangesAsync();
        return WishlistItemDto.From(item!, true, Uid);
    }

    [HttpDelete("items/{id:int}"), Authorize]
    public async Task<IActionResult> DeleteItem(int id)
    {
        var (item, _, err) = await LoadItemForEdit(id);
        if (err is not null) return err;
        db.WishlistItems.Remove(item!);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("items/{id:int}/image"), Authorize, RequestSizeLimit(10_000_000)]
    public async Task<ActionResult<WishlistItemDto>> UploadImage(int id, [FromForm] WishlistImageUploadDto dto)
    {
        var (item, _, err) = await LoadItemForEdit(id);
        if (err is not null) return err;
        if (dto.File is null || dto.File.Length == 0) return BadRequest("File is required.");
        if (!dto.File.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest("File must be an image.");
        using var ms = new MemoryStream();
        await dto.File.CopyToAsync(ms);
        item!.ImageData = ms.ToArray();
        item.ImageContentType = dto.File.ContentType;
        await db.SaveChangesAsync();
        return WishlistItemDto.From(item, true, Uid);
    }

    [HttpDelete("items/{id:int}/image"), Authorize]
    public async Task<ActionResult<WishlistItemDto>> DeleteImage(int id)
    {
        var (item, _, err) = await LoadItemForEdit(id);
        if (err is not null) return err;
        item!.ImageData = null;
        item.ImageContentType = "";
        await db.SaveChangesAsync();
        return WishlistItemDto.From(item, true, Uid);
    }

    [HttpGet("items/{id:int}/image"), AllowAnonymous]
    public async Task<IActionResult> GetImage(int id)
    {
        var item = await db.WishlistItems.FirstOrDefaultAsync(i => i.Id == id);
        if (item?.ImageData is not { Length: > 0 } data) return NotFound();
        return File(data, string.IsNullOrEmpty(item.ImageContentType) ? "application/octet-stream" : item.ImageContentType);
    }

    [HttpPut("{id:int}/options"), Authorize]
    public async Task<ActionResult<WishlistViewDto>> UpdateOptions(int id, [FromBody] WishlistOptionsDto dto)
    {
        var w = await Load(id);
        if (w is null) return NotFound();
        var owner = await LoadOwner(w);
        var uid = Uid;
        if (uid is null) return Unauthorized();
        if (owner is null || !CanEdit(owner, uid)) return Forbid();
        if (dto.PixKey is not null) w.PixKey = dto.PixKey.Trim();
        if (dto.ClaimMode is { } cm) w.ClaimMode = cm;
        await db.SaveChangesAsync();
        return BuildView(w, owner);
    }

    [HttpPost("claim"), AllowAnonymous]
    public async Task<ActionResult<List<ClaimDto>>> Claim([FromBody] ClaimCartDto dto)
    {
        if (dto.Items is null || dto.Items.Count == 0) return BadRequest("Cart is empty.");
        var uid = Uid;
        var label = (dto.ClaimantLabel ?? "").Trim();

        var ids = dto.Items.Select(i => i.ItemId).Distinct().ToList();
        var items = await db.WishlistItems.Where(i => ids.Contains(i.Id))
            .Include(i => i.Claims).Include(i => i.Wishlist).ToListAsync();
        if (items.Any(i => i.Wishlist?.ClaimMode == WishlistClaimMode.Disabled))
            return BadRequest("Claiming is disabled for this wishlist.");
        var itemsById = items.ToDictionary(i => i.Id);

        var created = new List<WishlistClaim>();
        foreach (var line in dto.Items)
        {
            if (!itemsById.TryGetValue(line.ItemId, out var item)) continue;
            var requested = Math.Max(1, line.Quantity);
            var qty = item.Wishlist?.ClaimMode == WishlistClaimMode.LimitedQuantities
                ? Math.Min(requested, Math.Max(0, item.WishedQuantity - item.Claims.Sum(c => c.Quantity)))
                : requested;
            if (qty <= 0) continue;
            var claim = new WishlistClaim
            {
                ItemId = item.Id,
                ClaimantUserId = uid,
                ClaimantLabel = label,
                Quantity = qty,
            };
            db.WishlistClaims.Add(claim);
            created.Add(claim);
        }
        await db.SaveChangesAsync();
        return created.Select(c => ClaimDto.From(c, uid)).ToList();
    }

    [HttpDelete("claim/{claimId:int}"), Authorize]
    public async Task<IActionResult> ReleaseClaim(int claimId)
    {
        var (claim, canEdit, err) = await LoadClaimForOwnerOrClaimant(claimId);
        if (err is not null) return err;
        db.WishlistClaims.Remove(claim!);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("claim/{claimId:int}/complete"), Authorize]
    public async Task<IActionResult> CompleteClaim(int claimId)
    {
        var (claim, canEdit, err) = await LoadClaimForOwnerOrClaimant(claimId);
        if (err is not null) return err;
        if (!canEdit) return Forbid();
        claim!.Item!.WishedQuantity = Math.Max(0, claim.Item.WishedQuantity - claim.Quantity);
        db.WishlistClaims.Remove(claim);
        if (claim.Item.WishedQuantity == 0) db.WishlistItems.Remove(claim.Item);
        await db.SaveChangesAsync();
        return NoContent();
    }

    async Task<(WishlistClaim? claim, bool canEdit, ActionResult? err)> LoadClaimForOwnerOrClaimant(int claimId)
    {
        var uid = Uid;
        if (uid is null) return (null, false, Unauthorized());
        var claim = await db.WishlistClaims.Include(c => c.Item).ThenInclude(i => i!.Wishlist)
            .FirstOrDefaultAsync(c => c.Id == claimId);
        if (claim?.Item is null) return (null, false, NotFound());
        var owner = claim.Item.Wishlist is null ? null : await LoadOwner(claim.Item.Wishlist);
        var canEdit = owner is not null && CanEdit(owner, uid);
        if (!canEdit && claim.ClaimantUserId != uid) return (null, false, Forbid());
        return (claim, canEdit, null);
    }

    WishlistViewDto BuildView(Wishlist w, IAssetOwner owner)
    {
        var uid = Uid;
        var canEdit = uid is not null && CanEdit(owner, uid);
        var display = owner switch
        {
            CalendarEvent ev => ev.Title,
            AppUser u => u.DisplayName,
            _ => "",
        };
        var items = (w.Items ?? new()).OrderBy(i => i.CreatedAtUtc)
            .Select(i => WishlistItemDto.From(i, canEdit, uid)).ToList();
        return new(w.Id, w.EventId, w.OwnerUserId, display, canEdit,
            w.PixKey ?? "", w.ClaimMode, items);
    }
}

public sealed record WishlistViewDto(int Id, int? EventId, string? OwnerUserId, string OwnerDisplayName,
    bool CanEdit, string PixKey, WishlistClaimMode ClaimMode, List<WishlistItemDto> Items);

public sealed record WishlistItemDto(int Id, int WishlistId, string Name, string Description,
    string Url, string ImageUrl, bool HasUploadedImage, long PriceMinor, WishlistCurrency Currency,
    int WishedQuantity, int ClaimedQuantity, List<ClaimDto> Claims, bool CanEdit)
{
    public static WishlistItemDto From(WishlistItem i, bool canEdit, string? uid)
    {
        var claims = i.Claims ?? new();
        var visible = claims.Where(c => !canEdit || c.ClaimantUserId == uid)
            .Select(c => ClaimDto.From(c, uid)).ToList();
        return new(i.Id, i.WishlistId, i.Name, i.Description, i.Url, i.ImageUrl,
            i.ImageData is { Length: > 0 }, i.PriceMinor, i.Currency,
            i.WishedQuantity, claims.Sum(c => c.Quantity), visible, canEdit);
    }
}

public sealed record ClaimDto(int Id, int ItemId, string? ClaimantUserId, string ClaimantLabel,
    int Quantity, DateTime CreatedAtUtc, bool IsMine)
{
    public static ClaimDto From(WishlistClaim c, string? uid) => new(
        c.Id, c.ItemId, c.ClaimantUserId, c.ClaimantLabel, c.Quantity, c.CreatedAtUtc,
        uid is not null && c.ClaimantUserId == uid);
}

public sealed class WishlistItemWriteDto
{
    [MaxLength(200)] public string? Name { get; set; }
    [MaxLength(2000)] public string? Description { get; set; }
    [MaxLength(500)] public string? Url { get; set; }
    [MaxLength(500)] public string? ImageUrl { get; set; }
    public long? PriceMinor { get; set; }
    public WishlistCurrency? Currency { get; set; }
    public int? WishedQuantity { get; set; }
}

public sealed class WishlistImageUploadDto { [Required] public IFormFile File { get; set; } = default!; }

public sealed class WishlistOptionsDto
{
    [MaxLength(200)] public string? PixKey { get; set; }
    public WishlistClaimMode? ClaimMode { get; set; }
}

public sealed class ClaimCartDto
{
    [MaxLength(120)] public string? ClaimantLabel { get; set; }
    public List<ClaimCartLineDto>? Items { get; set; }
}

public sealed class ClaimCartLineDto
{
    public int ItemId { get; set; }
    public int Quantity { get; set; } = 1;
}
