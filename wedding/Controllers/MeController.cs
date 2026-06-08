using System.ComponentModel.DataAnnotations;
using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Controllers;

[ApiController, Route("api/me"), Authorize]
public class MeController(AppDbContext db, UserManager<AppUser> users) : ControllerBase
{
    async Task<AppUser?> CurrentAsync()
    {
        var id = users.GetUserId(User);
        return id is null ? null : await db.Users.Include(u => u.DietaryPreferences).FirstOrDefaultAsync(u => u.Id == id);
    }

    [HttpGet]
    public async Task<ActionResult<MeDto>> Get()
        => await CurrentAsync() is { } u ? MeDto.From(u) : Unauthorized();

    [HttpPut]
    public async Task<ActionResult<MeDto>> Update([FromBody] UpdateMeDto dto)
    {
        var user = await CurrentAsync();
        if (user is null) return Unauthorized();
        if (dto.DisplayName is not null) user.DisplayName = dto.DisplayName.Trim();
        if (dto.PreferredLanguage is not null) user.PreferredLanguage = LanguageCodes.Normalize(dto.PreferredLanguage);
        if (dto.Dietary is not null) ApplyDietary(user, dto.Dietary);
        await db.SaveChangesAsync();
        return MeDto.From(user);
    }

    internal static void ApplyDietary(AppUser user, DietaryDto d)
    {
        user.DietaryPreferences ??= new DietaryPreferences { UserId = user.Id };
        user.DietaryPreferences.Preference = d.Preference;
        user.DietaryPreferences.Allergens = d.Allergens?.Distinct().ToList() ?? new();
        user.DietaryPreferences.CustomAllergens = d.CustomAllergens ?? "";
        user.DietaryPreferences.Notes = d.Notes ?? "";
    }
}

public sealed record MeDto(string Id, string Email, string DisplayName, string PreferredLanguage,
    PermissionsDto Permissions, DietaryDto Dietary)
{
    public static MeDto From(AppUser u) => new(
        u.Id, u.Email ?? "", u.DisplayName, LanguageCodes.Normalize(u.PreferredLanguage),
        new(u.CanCreateWeddingEvent, u.CanCreateFamilyGathering),
        DietaryDto.From(u.DietaryPreferences ?? new DietaryPreferences()));
}

public sealed record PermissionsDto(bool CanCreateWeddingEvent, bool CanCreateFamilyGathering);

public sealed record DietaryDto(DietaryPreference Preference, List<Allergen> Allergens, string CustomAllergens, string Notes)
{
    public static DietaryDto From(DietaryPreferences d) =>
        new(d.Preference, d.Allergens ?? new(), d.CustomAllergens ?? "", d.Notes ?? "");
}

public sealed class UpdateMeDto
{
    [MaxLength(120)] public string? DisplayName { get; set; }
    [MaxLength(10)] public string? PreferredLanguage { get; set; }
    public DietaryDto? Dietary { get; set; }
}
