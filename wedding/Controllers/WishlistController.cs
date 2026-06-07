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
    // Intentionally hard-coded — no live FX feed, the wishlist just needs a
    // stable yardstick for the cart total. Stored as price-in-target /
    // price-in-source for the source currency.
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

    // Public read: anyone (signed in or not) can browse a user's wishlist.
    [HttpGet("user/{userId}")]
    [AllowAnonymous]
    public async Task<ActionResult<WishlistViewDto>> GetForUser(string userId)
    {
        var owner = await _users.FindByIdAsync(userId);
        if (owner is null) return NotFound();
        var items = await _db.WishlistItems
            .Where(i => i.OwnerUserId == userId)
            .Include(i => i.Claims)
            .OrderBy(i => i.CreatedAtUtc)
            .ToListAsync();
        var currentUid = _users.GetUserId(User);
        return new WishlistViewDto(
            owner.Id,
            owner.DisplayName,
            items.Select(i => WishlistItemDto.From(i, currentUid)).ToList());
    }

    // The current user's own wishlist (with full claim details).
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
    public async Task<ActionResult<WishlistItemDto>> Create([FromBody] WishlistItemWriteDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(dto.Name)) return BadRequest("Name is required.");
        var item = new WishlistItem
        {
            OwnerUserId = uid,
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
        return WishlistItemDto.From(item, uid);
    }

    [HttpPut("{id:int}")]
    [Authorize]
    public async Task<ActionResult<WishlistItemDto>> Update(int id, [FromBody] WishlistItemWriteDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Claims).FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (item.OwnerUserId != uid) return Forbid();
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
        return WishlistItemDto.From(item, uid);
    }

    [HttpDelete("{id:int}")]
    [Authorize]
    public async Task<IActionResult> Delete(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (item.OwnerUserId != uid) return Forbid();
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

        var created = new List<WishlistClaim>();
        foreach (var line in dto.Items)
        {
            if (!itemsById.TryGetValue(line.ItemId, out var item)) continue;
            var alreadyClaimed = item.Claims.Sum(c => c.Quantity);
            var remaining = item.WishedQuantity - alreadyClaimed;
            var qty = Math.Min(Math.Max(1, line.Quantity), Math.Max(0, remaining));
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

    // Owners can release a stuck claim (e.g. someone changed their mind);
    // claimants can release their own.
    [HttpDelete("claim/{claimId:int}")]
    [Authorize]
    public async Task<IActionResult> ReleaseClaim(int claimId)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var claim = await _db.WishlistClaims.Include(c => c.Item).FirstOrDefaultAsync(c => c.Id == claimId);
        if (claim is null) return NotFound();
        var isOwner = claim.Item?.OwnerUserId == uid;
        var isClaimant = claim.ClaimantUserId == uid;
        if (!isOwner && !isClaimant) return Forbid();
        _db.WishlistClaims.Remove(claim);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // Conversion rates exposed so the frontend can render cart totals in the
    // user's preferred currency without baking the table into the client.
    [HttpGet("rates")]
    [AllowAnonymous]
    public ActionResult<Dictionary<string, decimal>> GetRates()
        => ToBrl.ToDictionary(kv => kv.Key.ToString(), kv => kv.Value);

    // Upload an image file for a wishlist item. Replaces any existing upload
    // but doesn't touch ImageUrl — owner can keep both and the frontend
    // prefers the uploaded blob when present.
    [HttpPost("{id:int}/image")]
    [Authorize]
    [RequestSizeLimit(10_000_000)]
    public async Task<ActionResult<WishlistItemDto>> UploadImage(int id, [FromForm] WishlistImageUploadDto dto)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Claims).FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (item.OwnerUserId != uid) return Forbid();
        if (dto.File is null || dto.File.Length == 0) return BadRequest("File is required.");
        if (!dto.File.ContentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            return BadRequest("File must be an image.");
        using var ms = new MemoryStream();
        await dto.File.CopyToAsync(ms);
        item.ImageData = ms.ToArray();
        item.ImageContentType = dto.File.ContentType;
        await _db.SaveChangesAsync();
        return WishlistItemDto.From(item, uid);
    }

    [HttpDelete("{id:int}/image")]
    [Authorize]
    public async Task<ActionResult<WishlistItemDto>> DeleteImage(int id)
    {
        var uid = _users.GetUserId(User);
        if (uid is null) return Unauthorized();
        var item = await _db.WishlistItems.Include(i => i.Claims).FirstOrDefaultAsync(i => i.Id == id);
        if (item is null) return NotFound();
        if (item.OwnerUserId != uid) return Forbid();
        item.ImageData = null;
        item.ImageContentType = string.Empty;
        await _db.SaveChangesAsync();
        return WishlistItemDto.From(item, uid);
    }

    [HttpGet("{id:int}/image")]
    [AllowAnonymous]
    public async Task<IActionResult> GetImage(int id)
    {
        var item = await _db.WishlistItems.FirstOrDefaultAsync(i => i.Id == id);
        if (item is null || item.ImageData is null || item.ImageData.Length == 0) return NotFound();
        return File(item.ImageData, string.IsNullOrEmpty(item.ImageContentType) ? "application/octet-stream" : item.ImageContentType);
    }
}

public sealed record WishlistViewDto(
    string OwnerUserId,
    string OwnerDisplayName,
    List<WishlistItemDto> Items);

public sealed record WishlistItemDto(
    int Id,
    string OwnerUserId,
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
    bool IsMine)
{
    public static WishlistItemDto From(WishlistItem i, string? currentUid)
    {
        var isMine = currentUid is not null && i.OwnerUserId == currentUid;
        var claimed = (i.Claims ?? new()).Sum(c => c.Quantity);
        // Hide other people's identities from the wishlist owner so the gift
        // can stay a surprise. Owner sees only counts, not who claimed what.
        // Claimants always see their own claims.
        var visible = (i.Claims ?? new())
            .Where(c => !isMine || c.ClaimantUserId == currentUid)
            .Select(c => ClaimDto.From(c, currentUid))
            .ToList();
        return new(
            i.Id, i.OwnerUserId, i.Name, i.Description, i.Url, i.ImageUrl,
            i.ImageData is { Length: > 0 },
            i.PriceMinor, i.Currency, i.PixKey,
            i.WishedQuantity, claimed, visible, isMine);
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
    [MaxLength(200)] public string? PixKey { get; set; }
    public int? WishedQuantity { get; set; }
}

public sealed class WishlistImageUploadDto
{
    [Required] public IFormFile File { get; set; } = default!;
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
