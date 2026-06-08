using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Controllers;

[ApiController]
[Route("api/wishlist")]
public class WishlistController : ControllerBase
{
    // Fixed conversion rates chosen by the owners: 1 BRL = 2 NOK = 20 USD.
    private static readonly Dictionary<WishlistCurrency, decimal> ToBrl = new()
    {
        [WishlistCurrency.BRL] = 1m,
        [WishlistCurrency.NOK] = 0.5m,    // 2 NOK == 1 BRL
        [WishlistCurrency.USD] = 0.05m,   // 20 USD == 1 BRL
    };

    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;

    public WishlistController(AppDbContext db, UserManager<AppUser> users)
    {
        _db = db;
        _users = users;
    }

    // ----- Read -----

    // Canonical wishlist URL: by id, no owner in the path.
    [HttpGet("{id:int}")]
    [AllowAnonymous]
    public async Task<ActionResult<WishlistViewDto>> Get(int id)
    {
        var wishlist = await _db.Wishlists
            .Include(w => w.Items).ThenInclude(i => i.Claims)
            .FirstOrDefaultAsync(w => w.Id == id);
        if (wishlist is null) return NotFound();
        var owner = await LoadOwnerAsync(wishlist.EventId, wishlist.OwnerUserId);
        if (owner is null) return NotFound();
        return BuildView(wishlist, owner);
    }

    // Resolver: "I have an event, give me its wishlist". Creates the
    // wishlist if it doesn't exist yet so callers always get a real id back.
    [HttpGet("for-event/{eventId:int}")]
    [AllowAnonymous]
    public async Task<ActionResult<WishlistViewDto>> GetForEvent(int eventId)
    {
        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == eventId);
        if (ev is null) return NotFound();
        var wishlist = await GetOrCreateForEventAsync(eventId);
        return BuildView(wishlist, ev);
    }

    // Resolver: same idea for a user's personal wishlist.
    [HttpGet("for-user/{userId}")]
    [AllowAnonymous]
    public async Task<ActionResult<WishlistViewDto>> GetForUser(string userId)
    {
        var owner = await _users.FindByIdAsync(userId);
        if (owner is null) return NotFound();
        var wishlist = await GetOrCreateForUserAsync(userId);
        return BuildView(wishlist, owner);
    }

    [HttpGet("mine")]
    [Authorize]
    public async Task<ActionResult<WishlistViewDto>> GetMine()
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        return await GetForUser(uid);
    }

    [HttpGet("rates")]
    [AllowAnonymous]
    public ActionResult<Dictionary<string, decimal>> GetRates()
        => ToBrl.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value);

    // ----- Items -----

    [HttpPost("{wishlistId:int}/items")]
    [Authorize]
    public async Task<ActionResult<WishlistItemDto>> CreateItem(int wishlistId, [FromBody] WishlistItemWriteDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest("Name is required.");

        var wishlist = await _db.Wishlists.FirstOrDefaultAsync(w => w.Id == wishlistId);
        if (wishlist is null) return NotFound();
        var owner = await LoadOwnerAsync(wishlist.EventId, wishlist.OwnerUserId);
        if (owner is null || !CanEdit(owner, uid)) return Forbid();

        var item = new WishlistItem
        {
            WishlistId = wishlist.Id,
            Name = dto.Name.Trim(),
            Description = (dto.Description ?? string.Empty).Trim(),
            Url = (dto.Url ?? string.Empty).Trim(),
            ImageUrl = (dto.ImageUrl ?? string.Empty).Trim(),
            PriceMinor = Math.Max(0, dto.PriceMinor ?? 0),
            Currency = dto.Currency ?? WishlistCurrency.BRL,
            WishedQuantity = Math.Max(1, dto.WishedQuantity ?? 1),
        };
        _db.WishlistItems.Add(item);
        await _db.SaveChangesAsync();
        return WishlistItemDto.From(item, canEdit: true, uid);
    }

    [HttpPut("items/{id:int}")]
    [Authorize]
    public async Task<ActionResult<WishlistItemDto>> UpdateItem(int id, [FromBody] WishlistItemWriteDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Claims).Include(i => i.Wishlist).FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (!await CanEditItemAsync(item, uid)) return Forbid();
        if (dto.Name is not null)
        {
            var n = dto.Name.Trim();
            if (string.IsNullOrEmpty(n)) return BadRequest("Name is required.");
            item.Name = n;
        }
        if (dto.Description is not null) item.Description = dto.Description.Trim();
        if (dto.Url is not null) item.Url = dto.Url.Trim();
        if (dto.ImageUrl is not null) item.ImageUrl = dto.ImageUrl.Trim();
        if (dto.PriceMinor.HasValue) item.PriceMinor = Math.Max(0, dto.PriceMinor.Value);
        if (dto.Currency.HasValue) item.Currency = dto.Currency.Value;
        if (dto.WishedQuantity.HasValue) item.WishedQuantity = Math.Max(1, dto.WishedQuantity.Value);
        await _db.SaveChangesAsync();
        return WishlistItemDto.From(item, canEdit: true, uid);
    }

    [HttpDelete("items/{id:int}")]
    [Authorize]
    public async Task<IActionResult> DeleteItem(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Wishlist).FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (!await CanEditItemAsync(item, uid)) return Forbid();
        _db.WishlistItems.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("items/{id:int}/image")]
    [Authorize]
    [RequestSizeLimit(10_000_000)]
    public async Task<ActionResult<WishlistItemDto>> UploadImage(int id, [FromForm] WishlistImageUploadDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Claims).Include(i => i.Wishlist).FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (!await CanEditItemAsync(item, uid)) return Forbid();
        if (dto.File is null || dto.File.Length == 0) return BadRequest("File is required.");
        if (!dto.File.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest("File must be an image.");
        using var ms = new MemoryStream();
        await dto.File.CopyToAsync(ms);
        item.ImageData = ms.ToArray();
        item.ImageContentType = dto.File.ContentType;
        await _db.SaveChangesAsync();
        return WishlistItemDto.From(item, canEdit: true, uid);
    }

    [HttpDelete("items/{id:int}/image")]
    [Authorize]
    public async Task<ActionResult<WishlistItemDto>> DeleteImage(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Claims).Include(i => i.Wishlist).FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (!await CanEditItemAsync(item, uid)) return Forbid();
        item.ImageData = null;
        item.ImageContentType = string.Empty;
        await _db.SaveChangesAsync();
        return WishlistItemDto.From(item, canEdit: true, uid);
    }

    [HttpGet("items/{id:int}/image")]
    [AllowAnonymous]
    public async Task<IActionResult> GetImage(int id)
    {
        var item = await _db.WishlistItems.FirstOrDefaultAsync(i => i.Id == id);
        if (item is null || item.ImageData is null || item.ImageData.Length == 0) return NotFound();
        return File(item.ImageData, string.IsNullOrEmpty(item.ImageContentType) ? "application/octet-stream" : item.ImageContentType);
    }

    // ----- Options -----

    [HttpPut("{id:int}/options")]
    [Authorize]
    public async Task<ActionResult<WishlistViewDto>> UpdateOptions(int id, [FromBody] WishlistOptionsDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var wishlist = await _db.Wishlists
            .Include(w => w.Items).ThenInclude(i => i.Claims)
            .FirstOrDefaultAsync(w => w.Id == id);
        if (wishlist is null) return NotFound();
        var owner = await LoadOwnerAsync(wishlist.EventId, wishlist.OwnerUserId);
        if (owner is null || !CanEdit(owner, uid)) return Forbid();

        if (dto.PixKey is not null) wishlist.PixKey = dto.PixKey.Trim();
        if (dto.ClaimMode is WishlistClaimMode cm) wishlist.ClaimMode = cm;
        await _db.SaveChangesAsync();
        return BuildView(wishlist, owner);
    }

    // ----- Claims -----

    // Cart-style claim. Anonymous claimants pass a label so the owner can
    // attribute the gift.
    [HttpPost("claim")]
    [AllowAnonymous]
    public async Task<ActionResult<List<ClaimDto>>> Claim([FromBody] ClaimCartDto dto)
    {
        if (dto.Items is null || dto.Items.Count == 0) return BadRequest("Cart is empty.");
        var uid = _users.GetUserId(User);
        var label = (dto.ClaimantLabel ?? string.Empty).Trim();
        if (uid is null && string.IsNullOrEmpty(label))
            return BadRequest("Anonymous claims need a name.");

        var ids = dto.Items.Select(i => i.ItemId).Distinct().ToList();
        var items = await _db.WishlistItems
            .Where(i => ids.Contains(i.Id))
            .Include(i => i.Claims)
            .Include(i => i.Wishlist)
            .ToListAsync();
        var itemsById = items.ToDictionary(i => i.Id);

        if (items.Any(i => i.Wishlist?.ClaimMode == WishlistClaimMode.Disabled))
            return BadRequest("Claiming is disabled for this wishlist.");

        var created = new List<WishlistClaim>();
        foreach (var line in dto.Items)
        {
            if (!itemsById.TryGetValue(line.ItemId, out var item)) continue;
            var mode = item.Wishlist?.ClaimMode ?? WishlistClaimMode.LimitedQuantities;
            var requested = Math.Max(1, line.Quantity);
            int qty;
            if (mode == WishlistClaimMode.LimitedQuantities)
            {
                var alreadyClaimed = item.Claims.Sum(c => c.Quantity);
                var remaining = item.WishedQuantity - alreadyClaimed;
                qty = Math.Min(requested, Math.Max(0, remaining));
            }
            else
            {
                qty = requested;
            }
            if (qty <= 0) continue;
            var claim = new WishlistClaim
            {
                ItemId = item.Id,
                ClaimantUserId = uid,
                ClaimantLabel = label,
                Quantity = qty,
            };
            _db.WishlistClaims.Add(claim);
            created.Add(claim);
        }
        await _db.SaveChangesAsync();
        return created.Select(c => ClaimDto.From(c, uid)).ToList();
    }

    [HttpDelete("claim/{claimId:int}")]
    [Authorize]
    public async Task<IActionResult> ReleaseClaim(int claimId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var claim = await _db.WishlistClaims.Include(c => c.Item).FirstOrDefaultAsync(c => c.Id == claimId);
        if (claim is null) return NotFound();
        var isClaimant = claim.ClaimantUserId == uid;
        var canEdit = claim.Item is not null && await CanEditItemAsync(claim.Item, uid);
        if (!canEdit && !isClaimant) return Forbid();
        _db.WishlistClaims.Remove(claim);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("claim/{claimId:int}/complete")]
    [Authorize]
    public async Task<IActionResult> CompleteClaim(int claimId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var claim = await _db.WishlistClaims.Include(c => c.Item).FirstOrDefaultAsync(c => c.Id == claimId);
        if (claim is null || claim.Item is null) return NotFound();
        if (!await CanEditItemAsync(claim.Item, uid)) return Forbid();

        claim.Item.WishedQuantity = Math.Max(0, claim.Item.WishedQuantity - claim.Quantity);
        _db.WishlistClaims.Remove(claim);
        if (claim.Item.WishedQuantity == 0)
            _db.WishlistItems.Remove(claim.Item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ----- Helpers -----

    private WishlistViewDto BuildView(Wishlist wishlist, IAssetOwner owner)
    {
        var currentUid = _users.GetUserId(User);
        var canEdit = currentUid is not null && CanEdit(owner, currentUid);
        var display = owner switch
        {
            CalendarEvent ev => ev.Title,
            AppUser u => u.DisplayName,
            _ => string.Empty,
        };
        var items = (wishlist.Items ?? new())
            .OrderBy(i => i.CreatedAtUtc)
            .Select(i => WishlistItemDto.From(i, canEdit, currentUid))
            .ToList();
        return new WishlistViewDto(
            wishlist.Id,
            wishlist.EventId,
            wishlist.OwnerUserId,
            display,
            canEdit,
            wishlist.PixKey ?? string.Empty,
            wishlist.ClaimMode,
            items);
    }

    private async Task<IAssetOwner?> LoadOwnerAsync(int? eventId, string? userId)
    {
        if (eventId is int eid)
            return await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == eid);
        if (!string.IsNullOrEmpty(userId))
            return await _users.FindByIdAsync(userId);
        return null;
    }

    private async Task<Wishlist> GetOrCreateForEventAsync(int eventId)
    {
        var existing = await _db.Wishlists
            .Include(w => w.Items).ThenInclude(i => i.Claims)
            .FirstOrDefaultAsync(w => w.EventId == eventId);
        if (existing is not null) return existing;
        var fresh = new Wishlist { EventId = eventId };
        _db.Wishlists.Add(fresh);
        await _db.SaveChangesAsync();
        return fresh;
    }

    private async Task<Wishlist> GetOrCreateForUserAsync(string userId)
    {
        var existing = await _db.Wishlists
            .Include(w => w.Items).ThenInclude(i => i.Claims)
            .FirstOrDefaultAsync(w => w.OwnerUserId == userId);
        if (existing is not null) return existing;
        var fresh = new Wishlist { OwnerUserId = userId };
        _db.Wishlists.Add(fresh);
        await _db.SaveChangesAsync();
        return fresh;
    }

    private async Task<bool> CanEditItemAsync(WishlistItem item, string uid)
    {
        var wishlist = item.Wishlist
            ?? await _db.Wishlists.FirstOrDefaultAsync(w => w.Id == item.WishlistId);
        if (wishlist is null) return false;
        var owner = await LoadOwnerAsync(wishlist.EventId, wishlist.OwnerUserId);
        return owner is not null && CanEdit(owner, uid);
    }

    private static bool CanEdit(IAssetOwner owner, string uid)
        => owner.EditorUserIds.Contains(uid);
}

public sealed record WishlistViewDto(
    int Id,
    int? EventId,
    string? OwnerUserId,
    string OwnerDisplayName,
    bool CanEdit,
    string PixKey,
    WishlistClaimMode ClaimMode,
    List<WishlistItemDto> Items);

public sealed record WishlistItemDto(
    int Id,
    int WishlistId,
    string Name,
    string Description,
    string Url,
    string ImageUrl,
    bool HasUploadedImage,
    long PriceMinor,
    WishlistCurrency Currency,
    int WishedQuantity,
    int ClaimedQuantity,
    List<ClaimDto> Claims,
    bool CanEdit)
{
    public static WishlistItemDto From(WishlistItem i, bool canEdit, string? currentUid)
    {
        var claimed = (i.Claims ?? new()).Sum(c => c.Quantity);
        var visible = (i.Claims ?? new())
            .Where(c => !canEdit || c.ClaimantUserId == currentUid)
            .Select(c => ClaimDto.From(c, currentUid))
            .ToList();
        return new(
            i.Id, i.WishlistId, i.Name, i.Description, i.Url, i.ImageUrl,
            i.ImageData is { Length: > 0 },
            i.PriceMinor, i.Currency,
            i.WishedQuantity, claimed, visible, canEdit);
    }
}

public sealed record ClaimDto(
    int Id,
    int ItemId,
    string? ClaimantUserId,
    string ClaimantLabel,
    int Quantity,
    DateTime CreatedAtUtc,
    bool IsMine)
{
    public static ClaimDto From(WishlistClaim c, string? currentUid) => new(
        c.Id, c.ItemId, c.ClaimantUserId, c.ClaimantLabel, c.Quantity, c.CreatedAtUtc,
        currentUid is not null && c.ClaimantUserId == currentUid);
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

public sealed class WishlistImageUploadDto
{
    [Required] public IFormFile File { get; set; } = default!;
}

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
