using System.ComponentModel.DataAnnotations;
using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Controllers;

[ApiController, Route("api/users"), Authorize]
public class UsersController(AppDbContext db, UserManager<AppUser> users) : ControllerBase
{
    static UserSummaryDto Summary(AppUser u) => new(u.Id, u.DisplayName, u.Email ?? "");
    static ActionResult Errors(IdentityResult r) => new BadRequestObjectResult(string.Join("; ", r.Errors.Select(e => e.Description)));

    [HttpGet("search")]
    public async Task<ActionResult<List<UserSummaryDto>>> Search([FromQuery] string q)
    {
        q = (q ?? "").Trim();
        if (q.Length < 2) return new List<UserSummaryDto>();
        return await db.Users
            .Where(u => EF.Functions.Like(u.DisplayName, $"%{q}%") || EF.Functions.Like(u.Email!, $"%{q}%"))
            .OrderBy(u => u.DisplayName).Take(15)
            .Select(u => new UserSummaryDto(u.Id, u.DisplayName, u.Email ?? ""))
            .ToListAsync();
    }

    // Placeholder account for an invitee. They claim it via the normal
    // registration flow with the same email.
    [HttpPost("invite-stub")]
    public async Task<ActionResult<UserSummaryDto>> CreateInviteStub([FromBody] CreateInviteStubDto dto)
    {
        var email = (dto.Email ?? "").Trim().ToLowerInvariant();
        if (!new EmailAddressAttribute().IsValid(email)) return BadRequest("Invalid email.");
        if (await users.FindByEmailAsync(email) is { } existing) return Summary(existing);

        var user = new AppUser
        {
            UserName = email, Email = email,
            DisplayName = string.IsNullOrWhiteSpace(dto.DisplayName) ? email : dto.DisplayName.Trim(),
            PreferredLanguage = LanguageCodes.Normalize(dto.Language),
            DietaryPreferences = new DietaryPreferences(),
        };
        var r = await users.CreateAsync(user);
        return r.Succeeded ? Summary(user) : Errors(r);
    }

    [AllowAnonymous, HttpGet("{id}/onboarding-status")]
    public async Task<ActionResult<OnboardingStatusDto>> OnboardingStatus(string id)
    {
        var user = await users.FindByIdAsync(id);
        if (user is null) return NotFound();
        return new OnboardingStatusDto(user.Id, user.Email ?? "", user.DisplayName, await users.HasPasswordAsync(user));
    }

    // Claim an invite-stub account. Refuses once the account has a password
    // so a real user can't be hijacked by replaying this with their id.
    [AllowAnonymous, HttpPost("{id}/onboard")]
    public async Task<ActionResult> Onboard(string id, [FromBody] OnboardDto dto)
    {
        var user = await db.Users.Include(u => u.DietaryPreferences).FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return NotFound();
        if (await users.HasPasswordAsync(user)) return Conflict("This account has already been set up.");

        if (!string.IsNullOrWhiteSpace(dto.DisplayName)) user.DisplayName = dto.DisplayName.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Language)) user.PreferredLanguage = LanguageCodes.Normalize(dto.Language);
        if (dto.Dietary is not null) MeController.ApplyDietary(user, dto.Dietary);
        user.EmailConfirmed = true;

        var update = await users.UpdateAsync(user);
        if (!update.Succeeded) return Errors(update);
        var pw = await users.AddPasswordAsync(user, dto.Password);
        return pw.Succeeded ? NoContent() : Errors(pw);
    }
}

public sealed record UserSummaryDto(string Id, string DisplayName, string Email);
public sealed record OnboardingStatusDto(string Id, string Email, string DisplayName, bool IsOnboarded);

public sealed class CreateInviteStubDto
{
    [Required, EmailAddress, MaxLength(256)] public string Email { get; set; } = "";
    [MaxLength(120)] public string? DisplayName { get; set; }
    [MaxLength(10)] public string? Language { get; set; }
}

public sealed class OnboardDto
{
    [Required, MinLength(8), MaxLength(256)] public string Password { get; set; } = "";
    [MaxLength(120)] public string? DisplayName { get; set; }
    [MaxLength(10)] public string? Language { get; set; }
    public DietaryDto? Dietary { get; set; }
}
