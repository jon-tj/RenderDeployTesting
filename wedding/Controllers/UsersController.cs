using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Controllers;

[ApiController]
[Route("api/users")]
[Authorize]
public class UsersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly UserManager<AppUser> _users;

    public UsersController(AppDbContext db, UserManager<AppUser> users)
    {
        _db = db;
        _users = users;
    }

    // Lightweight search for invite pickers. Matches against display name and
    // email; intentionally narrow result count so an autocomplete stays snappy.
    [HttpGet("search")]
    public async Task<ActionResult<List<UserSummaryDto>>> Search([FromQuery] string q)
    {
        q = (q ?? string.Empty).Trim();
        if (q.Length < 2) return new List<UserSummaryDto>();

        var matches = await _db.Users
            .Where(u => EF.Functions.Like(u.DisplayName, $"%{q}%")
                     || EF.Functions.Like(u.Email!, $"%{q}%"))
            .OrderBy(u => u.DisplayName)
            .Take(15)
            .Select(u => new UserSummaryDto(u.Id, u.DisplayName, u.Email ?? string.Empty))
            .ToListAsync();

        return matches;
    }

    // Creates a placeholder account for an invitee who hasn't signed up yet.
    // The user has no password and must register through the normal flow with
    // the same email to claim the account. Returns existing user if email
    // already matches.
    [HttpPost("invite-stub")]
    public async Task<ActionResult<UserSummaryDto>> CreateInviteStub([FromBody] CreateInviteStubDto dto)
    {
        var email = (dto.Email ?? string.Empty).Trim().ToLowerInvariant();
        if (!new EmailAddressAttribute().IsValid(email))
            return BadRequest("Invalid email.");

        var existing = await _users.FindByEmailAsync(email);
        if (existing is not null)
            return new UserSummaryDto(existing.Id, existing.DisplayName, existing.Email ?? string.Empty);

        var user = new AppUser
        {
            UserName = email,
            Email = email,
            DisplayName = string.IsNullOrWhiteSpace(dto.DisplayName) ? email : dto.DisplayName.Trim(),
            DietaryPreferences = new DietaryPreferences()
        };

        var result = await _users.CreateAsync(user);
        if (!result.Succeeded)
            return BadRequest(string.Join("; ", result.Errors.Select(e => e.Description)));

        return new UserSummaryDto(user.Id, user.DisplayName, user.Email ?? string.Empty);
    }

    // Public lookup used by the onboarding page. Returns the email + display
    // name so the form can prefill, and whether the account already has a
    // password (i.e. has been onboarded). Intentionally permissive: anyone who
    // knows the GUID can read these two non-sensitive fields.
    [AllowAnonymous]
    [HttpGet("{id}/onboarding-status")]
    public async Task<ActionResult<OnboardingStatusDto>> OnboardingStatus(string id)
    {
        var user = await _users.FindByIdAsync(id);
        if (user is null) return NotFound();

        var hasPassword = await _users.HasPasswordAsync(user);
        return new OnboardingStatusDto(
            user.Id,
            user.Email ?? string.Empty,
            user.DisplayName,
            hasPassword);
    }

    // Claim an invite-stub account: set the password and (optionally) the
    // display name. Refuses once a password is set, so a real user can never
    // be hijacked by re-running this with the same GUID.
    [AllowAnonymous]
    [HttpPost("{id}/onboard")]
    public async Task<ActionResult> Onboard(string id, [FromBody] OnboardDto dto)
    {
        var user = await _users.FindByIdAsync(id);
        if (user is null) return NotFound();

        if (await _users.HasPasswordAsync(user))
            return Conflict("This account has already been set up.");

        if (!string.IsNullOrWhiteSpace(dto.DisplayName))
            user.DisplayName = dto.DisplayName.Trim();
        user.EmailConfirmed = true;
        var updateResult = await _users.UpdateAsync(user);
        if (!updateResult.Succeeded)
            return BadRequest(string.Join("; ", updateResult.Errors.Select(e => e.Description)));

        var addPw = await _users.AddPasswordAsync(user, dto.Password);
        if (!addPw.Succeeded)
            return BadRequest(string.Join("; ", addPw.Errors.Select(e => e.Description)));

        return NoContent();
    }
}

public sealed record UserSummaryDto(string Id, string DisplayName, string Email);

public sealed record OnboardingStatusDto(string Id, string Email, string DisplayName, bool IsOnboarded);

public sealed class CreateInviteStubDto
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(120)]
    public string? DisplayName { get; set; }
}

public sealed class OnboardDto
{
    [Required, MinLength(8), MaxLength(256)]
    public string Password { get; set; } = string.Empty;

    [MaxLength(120)]
    public string? DisplayName { get; set; }
}
