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

    // Public read: anyone (signed in or not) can browse an event's wishlist.
    [HttpGet("event/{eventId:int}")]
    [AllowAnonymous]
    public async Task<ActionResult<WishlistViewDto>> GetForEvent(int eventId)
    {
        var ev = await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == eventId);
        if (ev is null) return NotFound();
        return await BuildViewAsync(ev, w => w.EventId == eventId, ownerDisplay: ev.Title, ownerEventId: ev.Id, ownerUserId: null);
    }

    // Public read: anyone can browse a user's personal wishlist.
    [HttpGet("user/{userId}")]
    [AllowAnonymous]
    public async Task<ActionResult<WishlistViewDto>> GetForUser(string userId)
    {
        var owner = await _users.FindByIdAsync(userId);
        if (owner is null) return NotFound();
        return await BuildViewAsync(owner, w => w.OwnerUserId == userId, ownerDisplay: owner.DisplayName, ownerEventId: null, ownerUserId: owner.Id);
    }

    // The current user's own wishlist.
    [HttpGet("mine")]
    [Authorize]
    public async Task<ActionResult<WishlistViewDto>> GetMine()
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        return await GetForUser(uid);
    }

    [HttpPost]
    [Authorize]
    public async Task<ActionResult<WishlistItemDto>> Create([FromBody] WishlistItemCreateDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest("Name is required.");

        var owner = await LoadOwnerAsync(dto.EventId, dto.OwnerUserId);
        if (owner is null) return BadRequest("Owner not found (provide eventId or ownerUserId).");
        if (!CanEdit(owner, uid)) return Forbid();

        var item = new WishlistItem
        {
            EventId = dto.EventId,
            OwnerUserId = string.IsNullOrEmpty(dto.OwnerUserId) ? null : dto.OwnerUserId,
            Name = dto.Name.Trim(),
            Description = (dto.Description ?? string.Empty).Trim(),
            Url = (dto.Url ?? string.Empty).Trim(),
            ImageUrl = (dto.ImageUrl ?? string.Empty).Trim(),
            PriceMinor = Math.Max(0, dto.PriceMinor ?? 0),
            Currency = dto.Currency ?? WishlistCurrency.BRL,
            PixKey = (dto.PixKey ?? string.Empty).Trim(),
            WishedQuantity = Math.Max(1, dto.WishedQuantity ?? 1),
        };
        _db.WishlistItems.Add(item);
        await _db.SaveChangesAsync();
        return WishlistItemDto.From(item, canEdit: true, uid);
    }

    [HttpPut("{id:int}")]
    [Authorize]
    public async Task<ActionResult<WishlistItemDto>> Update(int id, [FromBody] WishlistItemWriteDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Claims).FirstOrDefaultAsync(i => i.Id == id);
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
        if (dto.PixKey is not null) item.PixKey = dto.PixKey.Trim();
        if (dto.WishedQuantity.HasValue) item.WishedQuantity = Math.Max(1, dto.WishedQuantity.Value);
        await _db.SaveChangesAsync();
        return WishlistItemDto.From(item, canEdit: true, uid);
    }

    [HttpDelete("{id:int}")]
    [Authorize]
    public async Task<IActionResult> Delete(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (!await CanEditItemAsync(item, uid)) return Forbid();
        _db.WishlistItems.Remove(item);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Claim items in one shot — cart-style. Anonymous claimants pass a label
    // so the owner can attribute the gift.
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
            .ToListAsync();
        var itemsById = items.ToDictionary(i => i.Id);

        // Look up each owner's claim mode once so we can both reject Disabled
        // wishlists and skip the remaining-quantity cap in Unlimited mode.
        var modeByItem = new Dictionary<int, WishlistClaimMode>();
        foreach (var item in items)
        {
            var owner = await LoadOwnerAsync(item.EventId, item.OwnerUserId);
            var mode = owner switch
            {
                CalendarEvent ev => ev.WishlistClaimMode,
                AppUser u => u.WishlistClaimMode,
                _ => WishlistClaimMode.LimitedQuantities,
            };
            if (mode == WishlistClaimMode.Disabled) return BadRequest("Claiming is disabled for this wishlist.");
            modeByItem[item.Id] = mode;
        }

        var created = new List<WishlistClaim>();
        foreach (var line in dto.Items)
        {
            if (!itemsById.TryGetValue(line.ItemId, out var item)) continue;
            var mode = modeByItem[item.Id];
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

    // Asset owners can release a stuck claim; claimants can release their own.
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

    [HttpGet("rates")]
    [AllowAnonymous]
    public ActionResult<Dictionary<string, decimal>> GetRates()
        => ToBrl.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value);

    [HttpPost("{id:int}/image")]
    [Authorize]
    [RequestSizeLimit(10_000_000)]
    public async Task<ActionResult<WishlistItemDto>> UploadImage(int id, [FromForm] WishlistImageUploadDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Claims).FirstOrDefaultAsync(i => i.Id == id);
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

    [HttpDelete("{id:int}/image")]
    [Authorize]
    public async Task<ActionResult<WishlistItemDto>> DeleteImage(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Claims).FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (!await CanEditItemAsync(item, uid)) return Forbid();
        item.ImageData = null;
        item.ImageContentType = string.Empty;
        await _db.SaveChangesAsync();
        return WishlistItemDto.From(item, canEdit: true, uid);
    }

    [HttpGet("{id:int}/image")]
    [AllowAnonymous]
    public async Task<IActionResult> GetImage(int id)
    {
        var item = await _db.WishlistItems.FirstOrDefaultAsync(i => i.Id == id);
        if (item is null || item.ImageData is null || item.ImageData.Length == 0) return NotFound();
        return File(item.ImageData, string.IsNullOrEmpty(item.ImageContentType) ? "application/octet-stream" : item.ImageContentType);
    }

    // Wishlist-level owner options (Pix key, quantities/claiming toggles).
    // Stored on the owner (event or user) because they apply to the
    // wishlist as a whole.
    [HttpPut("options")]
    [Authorize]
    public async Task<ActionResult<WishlistViewDto>> UpdateOptions([FromBody] WishlistOptionsDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var owner = await LoadOwnerAsync(dto.EventId, dto.OwnerUserId);
        if (owner is null) return BadRequest("Owner not found.");
        if (!CanEdit(owner, uid)) return Forbid();

        var pix = (dto.PixKey ?? string.Empty).Trim();
        if (owner is CalendarEvent ev)
        {
            ev.WishlistPixKey = pix;
            if (dto.ClaimMode is WishlistClaimMode cm) ev.WishlistClaimMode = cm;
        }
        else if (owner is AppUser u)
        {
            u.WishlistPixKey = pix;
            if (dto.ClaimMode is WishlistClaimMode cm) u.WishlistClaimMode = cm;
        }
        await _db.SaveChangesAsync();

        if (dto.EventId is int eid)
            return await BuildViewAsync(owner, w => w.EventId == eid, ((CalendarEvent)owner).Title, eid, null);
        return await BuildViewAsync(owner, w => w.OwnerUserId == ((AppUser)owner).Id, ((AppUser)owner).DisplayName, null, ((AppUser)owner).Id);
    }

    // Owner marks a claim as fulfilled: deduct the claim's quantity from the
    // wished total and remove the claim. The item disappears from the active
    // list once wishedQuantity hits zero.
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

    private async Task<WishlistViewDto> BuildViewAsync(
        IAssetOwner owner,
        System.Linq.Expressions.Expression<Func<WishlistItem, bool>> filter,
        string ownerDisplay,
        int? ownerEventId,
        string? ownerUserId)
    {
        var items = await _db.WishlistItems
            .Where(filter)
            .Include(i => i.Claims)
            .OrderBy(i => i.CreatedAtUtc)
            .ToListAsync();
        var currentUid = _users.GetUserId(User);
        var canEdit = currentUid is not null && CanEdit(owner, currentUid);
        var pixKey = owner switch
        {
            CalendarEvent ev => ev.WishlistPixKey,
            AppUser u => u.WishlistPixKey,
            _ => string.Empty,
        };
        var claimMode = owner switch
        {
            CalendarEvent ev => ev.WishlistClaimMode,
            AppUser u => u.WishlistClaimMode,
            _ => WishlistClaimMode.LimitedQuantities,
        };
        return new WishlistViewDto(
            ownerEventId,
            ownerUserId,
            ownerDisplay,
            canEdit,
            pixKey ?? string.Empty,
            claimMode,
            items.Select(i => WishlistItemDto.From(i, canEdit, currentUid)).ToList());
    }

    private async Task<IAssetOwner?> LoadOwnerAsync(int? eventId, string? userId)
    {
        if (eventId is int eid)
            return await _db.Events.Include(e => e.CoOwners).FirstOrDefaultAsync(e => e.Id == eid);
        if (!string.IsNullOrEmpty(userId))
            return await _users.FindByIdAsync(userId);
        return null;
    }

    private async Task<bool> CanEditItemAsync(WishlistItem item, string uid)
    {
        var owner = await LoadOwnerAsync(item.EventId, item.OwnerUserId);
        return owner is not null && CanEdit(owner, uid);
    }

    private static bool CanEdit(IAssetOwner owner, string uid)
        => owner.EditorUserIds.Contains(uid);
}

public sealed record WishlistViewDto(
    int? EventId,
    string? OwnerUserId,
    string OwnerDisplayName,
    bool CanEdit,
    string PixKey,
    WishlistClaimMode ClaimMode,
    List<WishlistItemDto> Items);

public sealed record WishlistItemDto(
    int Id,
    int? EventId,
    string? OwnerUserId,
    string Name,
    string Description,
    string Url,
    string ImageUrl,
    bool HasUploadedImage,
    long PriceMinor,
    WishlistCurrency Currency,
    string PixKey,
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
            i.Id, i.EventId, i.OwnerUserId, i.Name, i.Description, i.Url, i.ImageUrl,
            i.ImageData is { Length: > 0 },
            i.PriceMinor, i.Currency, i.PixKey,
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

public sealed class WishlistItemCreateDto
{
    public int? EventId { get; set; }
    public string? OwnerUserId { get; set; }
    [MaxLength(200)] public string? Name { get; set; }
    [MaxLength(2000)] public string? Description { get; set; }
    [MaxLength(500)] public string? Url { get; set; }
    [MaxLength(500)] public string? ImageUrl { get; set; }
    public long? PriceMinor { get; set; }
    public WishlistCurrency? Currency { get; set; }
    [MaxLength(200)] public string? PixKey { get; set; }
    public int? WishedQuantity { get; set; }
}

public sealed class WishlistItemWriteDto
{
    [MaxLength(200)] public string? Name { get; set; }
    [MaxLength(2000)] public string? Description { get; set; }
    [MaxLength(500)] public string? Url { get; set; }
    [MaxLength(500)] public string? ImageUrl { get; set; }
    public long? PriceMinor { get; set; }
    public WishlistCurrency? Currency { get; set; }
    [MaxLength(200)] public string? PixKey { get; set; }
    public int? WishedQuantity { get; set; }
}

public sealed class WishlistImageUploadDto
{
    [Required] public IFormFile File { get; set; } = default!;
}

public sealed class WishlistOptionsDto
{
    public int? EventId { get; set; }
    public string? OwnerUserId { get; set; }
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
