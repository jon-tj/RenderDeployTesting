using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Controllers;

[ApiController]
[Route("api/me")]
[Authorize]
public class MeController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;

    public MeController(AppDbContext db, UserManager<AppUser> users)
    {
        _db = db;
        _users = users;
    }

    [HttpGet]
    public async Task<ActionResult<MeDto>> Get()
    {
        var id = _users.GetUserId(User);
        if (id is null) return Unauthorized();

        var user = await _db.Users
            .Include(u => u.DietaryPreferences)
            .FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return Unauthorized();

        return MeDto.From(user);
    }

    [HttpPut]
    public async Task<ActionResult<MeDto>> Update([FromBody] UpdateMeDto dto)
    {
        var id = _users.GetUserId(User);
        if (id is null) return Unauthorized();

        var user = await _db.Users
            .Include(u => u.DietaryPreferences)
            .FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return Unauthorized();

        if (dto.DisplayName is not null)
            user.DisplayName = dto.DisplayName.Trim();

        if (dto.Dietary is not null)
        {
            user.DietaryPreferences ??= new DietaryPreferences { UserId = user.Id };
            user.DietaryPreferences.Preference = dto.Dietary.Preference;
            user.DietaryPreferences.Allergens = dto.Dietary.Allergens?.Distinct().ToList() ?? new();
            user.DietaryPreferences.CustomAllergens = dto.Dietary.CustomAllergens ?? string.Empty;
            user.DietaryPreferences.Notes = dto.Dietary.Notes ?? string.Empty;
        }

        await _db.SaveChangesAsync();
        return MeDto.From(user);
    }
}

public sealed record MeDto(
    string Id,
    string Email,
    string DisplayName,
    PermissionsDto Permissions,
    DietaryDto Dietary)
{
    public static MeDto From(AppUser u) => new(
        u.Id,
        u.Email ?? string.Empty,
        u.DisplayName,
        new PermissionsDto(u.CanCreateWeddingEvent, u.CanCreateFamilyGathering),
        DietaryDto.From(u.DietaryPreferences ?? new DietaryPreferences()));
}

public sealed record PermissionsDto(bool CanCreateWeddingEvent, bool CanCreateFamilyGathering);

public sealed record DietaryDto(
    DietaryPreference Preference,
    List<Allergen> Allergens,
    string CustomAllergens,
    string Notes)
{
    public static DietaryDto From(DietaryPreferences d) =>
        new(d.Preference, d.Allergens ?? new(), d.CustomAllergens ?? string.Empty, d.Notes ?? string.Empty);
}

public sealed class UpdateMeDto
{
    [MaxLength(120)]
    public string? DisplayName { get; set; }
    public DietaryDto? Dietary { get; set; }
}
