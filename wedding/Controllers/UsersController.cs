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
}

public sealed record UserSummaryDto(string Id, string DisplayName, string Email);

public sealed class CreateInviteStubDto
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(120)]
    public string? DisplayName { get; set; }
}
