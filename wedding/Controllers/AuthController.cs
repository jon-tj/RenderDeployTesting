using Microsoft.AspNetCore.Mvc;
using wedding.Data;
using wedding.Model;
using wedding.Services;

namespace wedding.Controllers;

[ApiController]
[Route("api")]
public sealed class AuthController : ControllerBase
{
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(
        [FromBody] LoginRequest request,
        [FromServices] JsonDatabase database,
        [FromServices] EmailService emailService,
        [FromServices] AdminTwoFactorService twoFactorService,
        [FromServices] ILogger<AuthController> logger)
    {
        var normalizedPat = request.Pat?.Trim() ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(normalizedPat) && database.PatLoginEnabled)
        {
            var patUser = database.Users.FirstOrDefault(u =>
                !string.IsNullOrWhiteSpace(u.Pat)
                && string.Equals(u.Pat, normalizedPat, StringComparison.Ordinal));

            if (patUser is not null && !patUser.Admin)
            {
                if (string.IsNullOrWhiteSpace(patUser.Email))
                {
                    var pendingName = string.IsNullOrWhiteSpace(patUser.FullName)
                        ? request.Name?.Trim()
                        : patUser.FullName;

                    return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, true, pendingName));
                }

                return Ok(BuildAuthorizedLoginResponse(patUser, database));
            }
        }

        if (string.IsNullOrWhiteSpace(request.Name) || string.IsNullOrWhiteSpace(request.Email))
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, request.Name?.Trim()));
        }

        var normalizedRequestName = request.Name.Trim();
        if (normalizedRequestName.Length < 3)
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, normalizedRequestName));
        }

        var requestNameSubwords = normalizedRequestName
            .Replace("-", " ", StringComparison.Ordinal)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var user = database.Users.FirstOrDefault(u =>
            NameMatchesSubwords(requestNameSubwords, u.FullName));

        if (user is null)
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, normalizedRequestName));
        }

        var normalizedRequestEmail = request.Email.Trim();

        if (user.Admin)
        {
            if (string.IsNullOrWhiteSpace(user.Email)
                || !string.Equals(user.Email.Trim(), normalizedRequestEmail, StringComparison.OrdinalIgnoreCase))
            {
                return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, normalizedRequestName));
            }

            var validFor = TimeSpan.FromMinutes(10);
            var code = twoFactorService.IssueCode(user.FullName, user.Email, validFor);
            logger.LogWarning("ADMIN 2FA CODE for {Email}: {Code} (valid {Minutes} min)", user.Email, code, validFor.TotalMinutes);
            await emailService.SendAdminTwoFactorCodeAsync(user, code, validFor);

            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, true, false, null));
        }

        if (string.IsNullOrWhiteSpace(user.Email))
        {
            user.Email = normalizedRequestEmail;
            database.Commit();
        }
        else if (!string.Equals(user.Email.Trim(), normalizedRequestEmail, StringComparison.OrdinalIgnoreCase))
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, normalizedRequestName));
        }

        return Ok(BuildAuthorizedLoginResponse(user, database));
    }

    [HttpPost("login/register-email")]
    public async Task<ActionResult<LoginResponse>> RegisterEmail(
        [FromBody] RegisterEmailRequest request,
        [FromServices] JsonDatabase database,
        [FromServices] EmailService emailService,
        [FromServices] IConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(request.Pat)
            || string.IsNullOrWhiteSpace(request.Name)
            || string.IsNullOrWhiteSpace(request.Email))
        {
            return BadRequest(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, null));
        }

        var normalizedPat = request.Pat.Trim();
        var normalizedName = request.Name.Trim();
        var normalizedEmail = request.Email.Trim();

        var user = database.Users.FirstOrDefault(u =>
            !string.IsNullOrWhiteSpace(u.Pat)
            && string.Equals(u.Pat, normalizedPat, StringComparison.Ordinal));

        if (user is null)
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, normalizedName));
        }

        var requestNameSubwords = normalizedName
            .Replace("-", " ", StringComparison.Ordinal)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        if (!NameMatchesSubwords(requestNameSubwords, user.FullName))
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, normalizedName));
        }

        if (!string.IsNullOrWhiteSpace(user.Email)
            && !string.Equals(user.Email.Trim(), normalizedEmail, StringComparison.OrdinalIgnoreCase))
        {
            return Conflict(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, user.FullName));
        }

        if (string.IsNullOrWhiteSpace(user.Email))
        {
            user.Email = normalizedEmail;
            database.Commit();
        }

        var patLoginLink = BuildInviteLink(request.InviteBaseUrl, user.FullName, user.Pat, user.Locale, configuration);
        await emailService.SendInviteAsync(user, patLoginLink);

        return Ok(BuildAuthorizedLoginResponse(user, database));
    }

    [HttpPost("login/verify2fa")]
    public ActionResult<LoginResponse> VerifyTwoFactor(
        [FromBody] AdminTwoFactorVerifyRequest request,
        [FromServices] JsonDatabase database,
        [FromServices] AdminTwoFactorService twoFactorService)
    {
        if (string.IsNullOrWhiteSpace(request.Name)
            || string.IsNullOrWhiteSpace(request.Email)
            || string.IsNullOrWhiteSpace(request.Code))
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, null));
        }

        var normalizedRequestName = request.Name.Trim();
        var normalizedRequestEmail = request.Email.Trim();

        if (normalizedRequestName.Length < 3)
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, null));
        }

        var requestNameSubwords = normalizedRequestName
            .Replace("-", " ", StringComparison.Ordinal)
            .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var user = database.Users.FirstOrDefault(u =>
            NameMatchesSubwords(requestNameSubwords, u.FullName));

        if (user is null || !user.Admin)
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, null));
        }

        if (!string.Equals(user.Email.Trim(), normalizedRequestEmail, StringComparison.OrdinalIgnoreCase))
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, null));
        }

        if (!twoFactorService.VerifyCode(user.FullName, user.Email, request.Code))
        {
            return Ok(new LoginResponse(false, null, null, null, database.CurrentVersion, false, false, null));
        }

        return Ok(BuildAuthorizedLoginResponse(user, database));
    }

    [HttpPost("admin/invites")]
    public ActionResult<InviteRowResponse> CreateInvite(
        [FromBody] CreateInviteRequest request,
        [FromServices] JsonDatabase database,
        [FromServices] AdminTwoFactorService twoFactorService)
    {
        var admin = ResolveAdmin(database, request.AdminFullName);
        if (admin is null)
        {
            return Forbid();
        }

        var invitedUser = new User
        {
            FullName = request.FullName?.Trim() ?? string.Empty,
            DisplayName = string.IsNullOrWhiteSpace(request.DisplayName)
                ? string.Empty
                : request.DisplayName.Trim(),
            Email = request.Email?.Trim() ?? string.Empty,
            Locale = NormalizeLocale(request.Locale),
            Pat = twoFactorService.GeneratePersonalAccessToken(),
            AddedToCalendar = false,
            LastVersionSeen = -1,
            LastAnnouncementSeen = -1,
            Admin = false
        };

        database.Users.Add(invitedUser);
        database.Commit();

        return Ok(ToInviteRow(invitedUser));
    }

    [HttpGet("admin/invites")]
    public ActionResult<InviteListResponse> ListInvites(
        [FromQuery] string adminFullName,
        [FromServices] JsonDatabase database)
    {
        var admin = ResolveAdmin(database, adminFullName);
        if (admin is null)
        {
            return Forbid();
        }

        var invites = database.Users
            .Select(ToInviteRow)
            .ToList();

        return Ok(new InviteListResponse(invites, database.PatLoginEnabled));
    }

    [HttpPut("admin/invites/{pat}")]
    public ActionResult<InviteRowResponse> UpdateInvite(
        string pat,
        [FromBody] UpdateInviteRequest request,
        [FromServices] JsonDatabase database)
    {
        var admin = ResolveAdmin(database, request.AdminFullName);
        if (admin is null)
        {
            return Forbid();
        }

        var user = database.Users.FirstOrDefault(u => string.Equals(u.Pat, pat, StringComparison.Ordinal));
        if (user is null)
        {
            return NotFound();
        }

        user.FullName = request.FullName?.Trim() ?? string.Empty;
        user.DisplayName = string.IsNullOrWhiteSpace(request.DisplayName)
            ? string.Empty
            : request.DisplayName.Trim();
        user.Email = request.Email?.Trim() ?? string.Empty;
        user.Locale = NormalizeLocale(request.Locale);

        database.Commit();
        return Ok(ToInviteRow(user));
    }

    [HttpDelete("admin/invites/{pat}")]
    public ActionResult DeleteInvite(
        string pat,
        [FromQuery] string adminFullName,
        [FromServices] JsonDatabase database)
    {
        var admin = ResolveAdmin(database, adminFullName);
        if (admin is null)
        {
            return Forbid();
        }

        var user = database.Users.FirstOrDefault(u => !u.Admin && string.Equals(u.Pat, pat, StringComparison.Ordinal));
        if (user is null)
        {
            return NotFound();
        }

        database.Users.Remove(user);
        database.Commit();
        return NoContent();
    }

    [HttpPost("admin/invites/go-live")]
    public async Task<ActionResult<GoLiveResponse>> GoLive(
        [FromBody] GoLiveRequest request,
        [FromServices] JsonDatabase database,
        [FromServices] EmailService emailService,
        [FromServices] IConfiguration configuration)
    {
        var admin = ResolveAdmin(database, request.AdminFullName);
        if (admin is null)
        {
            return Forbid();
        }

        database.PatLoginEnabled = true;
        database.Commit();

        var emailsSent = 0;
        var skipped = 0;
        foreach (var user in database.Users.Where(u => !u.Admin))
        {
            if (string.IsNullOrWhiteSpace(user.Email) || string.IsNullOrWhiteSpace(user.Pat))
            {
                skipped++;
                continue;
            }

            var inviteLink = BuildInviteLink(request.InviteBaseUrl, user.FullName, user.Pat, user.Locale, configuration);
            await emailService.SendInviteAsync(user, inviteLink);
            emailsSent++;
        }

        return Ok(new GoLiveResponse(true, emailsSent, skipped));
    }

    [HttpPost("admin/invites/resend-uninitialized")]
    public async Task<ActionResult<GoLiveResponse>> ResendUninitialized(
        [FromBody] GoLiveRequest request,
        [FromServices] JsonDatabase database,
        [FromServices] EmailService emailService,
        [FromServices] IConfiguration configuration)
    {
        var admin = ResolveAdmin(database, request.AdminFullName);
        if (admin is null)
        {
            return Forbid();
        }

        var emailsSent = 0;
        var skipped = 0;
        foreach (var user in database.Users.Where(u => !u.Admin && u.LastVersionSeen < 0))
        {
            if (string.IsNullOrWhiteSpace(user.Email) || string.IsNullOrWhiteSpace(user.Pat))
            {
                skipped++;
                continue;
            }

            var inviteLink = BuildInviteLink(request.InviteBaseUrl, user.FullName, user.Pat, user.Locale, configuration);
            await emailService.SendInviteAsync(user, inviteLink);
            emailsSent++;
        }

        return Ok(new GoLiveResponse(database.PatLoginEnabled, emailsSent, skipped));
    }

    private static User? ResolveAdmin(JsonDatabase database, string? adminFullName)
    {
        if (string.IsNullOrWhiteSpace(adminFullName))
        {
            return null;
        }

        var admin = database.Users.FirstOrDefault(u =>
            string.Equals(u.FullName, adminFullName.Trim(), StringComparison.OrdinalIgnoreCase));

        return admin is { Admin: true } ? admin : null;
    }

    private static InviteRowResponse ToInviteRow(User user)
    {
        return new InviteRowResponse(
            user.Pat,
            user.FullName,
            user.DisplayName,
            user.Email,
            user.Admin,
            user.LastAnnouncementSeen,
            user.LastVersionSeen,
            user.Locale ?? string.Empty);
    }

    private static LoginResponse BuildAuthorizedLoginResponse(User user, JsonDatabase database)
    {
        var hasChanges = false;
        var responseLastAnnouncementSeen = user.LastAnnouncementSeen;

        if (user.LastVersionSeen != database.CurrentVersion)
        {
            user.LastVersionSeen = database.CurrentVersion;
            hasChanges = true;
        }

        var latestAnnouncementId = database.Announcements.Count == 0
            ? -1
            : database.Announcements.Max(a => a.Id);

        if (user.LastAnnouncementSeen != latestAnnouncementId)
        {
            user.LastAnnouncementSeen = latestAnnouncementId;
            hasChanges = true;
        }

        if (hasChanges)
        {
            database.Commit();
        }

        var userResponse = new UserResponse(
            user.FullName,
            user.DisplayName,
            user.Email,
            user.Admin,
            user.AddedToCalendar,
            user.LastVersionSeen,
            responseLastAnnouncementSeen,
            new List<string>(user.Allergies),
            user.EventChoices.ToDictionary(
                kv => kv.Key,
                kv => new EventChoiceResponse(kv.Value.Meal, kv.Value.Drink),
                StringComparer.OrdinalIgnoreCase));

        var peopleResponse = user.Admin
            ? database.Users
                .Select(u => new PeopleResponse(u.FullName, u.LastAnnouncementSeen))
                .ToList()
            : null;

        return new LoginResponse(
            true,
            userResponse,
            ToEventResponses(database.Events, database.Users),
            ToAnnouncementResponses(database.Announcements),
            database.CurrentVersion,
            false,
            false,
            null,
            peopleResponse);
    }

    private static bool NameMatchesSubwords(string[] requestSubwords, string userFullName)
    {
        if (requestSubwords.Length == 0 || string.IsNullOrWhiteSpace(userFullName))
        {
            return false;
        }

        var normalizedFullName = userFullName.Replace("-", " ", StringComparison.Ordinal);

        return requestSubwords.All(subword =>
            normalizedFullName.Contains(subword, StringComparison.OrdinalIgnoreCase));
    }

    private static string BuildInviteLink(string? _, string fullName, string pat, IConfiguration configuration)
    {
        return BuildInviteLink(_, fullName, pat, locale: null, configuration);
    }

    private static string BuildInviteLink(string? _, string fullName, string pat, string? locale, IConfiguration configuration)
    {
        // Always build invite links off WEBSITE_URL so they keep working even if
        // the call originated from localhost / a staging frontend. The first
        // parameter (frontend-supplied base URL) is intentionally ignored.
        var baseUrl = (configuration["WEBSITE_URL"] ?? "https://jonandmari.uk").TrimEnd('/');

        var encodedName = string.Join("+",
            fullName
                .Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(Uri.EscapeDataString));

        var queryParts = new List<string>
        {
            $"name={encodedName}",
            $"pat={Uri.EscapeDataString(pat)}"
        };

        var normalizedLocale = NormalizeLocale(locale);
        if (!string.IsNullOrEmpty(normalizedLocale))
        {
            queryParts.Add($"lang={Uri.EscapeDataString(normalizedLocale)}");
        }

        return $"{baseUrl}?{string.Join("&", queryParts)}";
    }

    // Keep the set of accepted locales in sync with weddingWeb/src/app/services/i18n.service.ts.
    private static readonly HashSet<string> SupportedLocales = new(StringComparer.OrdinalIgnoreCase)
    {
        "en", "nb", "pt-BR"
    };

    private static string NormalizeLocale(string? locale)
    {
        if (string.IsNullOrWhiteSpace(locale))
        {
            return string.Empty;
        }
        var trimmed = locale.Trim();
        var match = SupportedLocales.FirstOrDefault(l => string.Equals(l, trimmed, StringComparison.OrdinalIgnoreCase));
        return match ?? string.Empty;
    }

    private static List<AuthEventResponse> ToEventResponses(List<WeddingEvent> weddingEvents, List<User> users)
    {
        return weddingEvents
            .Select(weddingEvent => new AuthEventResponse(
                weddingEvent.Place,
                weddingEvent.VenueName,
                weddingEvent.MapQuery,
                weddingEvent.Time,
                weddingEvent.DressCode,
                weddingEvent.Currency,
                EventsController.ResolveMealOptions(weddingEvent),
                EventsController.BuildRsvpMap(users, weddingEvent.Place)))
            .ToList();
    }

    private static List<AuthAnnouncementResponse> ToAnnouncementResponses(List<Announcement> announcements)
    {
        return announcements
            .OrderByDescending(a => a.Id)
            .Select(a => new AuthAnnouncementResponse(a.Id, a.Title, a.Message, a.CreatedAt, a.CreatedBy))
            .ToList();
    }
}

public sealed record LoginRequest(string? Name, string? Email, string? Pat = null);
public sealed record RegisterEmailRequest(string Pat, string Name, string Email, string? InviteBaseUrl);
public sealed record AdminTwoFactorVerifyRequest(string Name, string Email, string Code);
public sealed record CreateInviteRequest(string AdminFullName, string? FullName, string? DisplayName, string? Email, string? Locale);
public sealed record UpdateInviteRequest(string AdminFullName, string? FullName, string? DisplayName, string? Email, string? Locale);
public sealed record GoLiveRequest(string AdminFullName, string? InviteBaseUrl);

public sealed record LoginResponse(
    bool Authorized,
    UserResponse? User,
    List<AuthEventResponse>? Events,
    List<AuthAnnouncementResponse>? Announcements,
    int CurrentVersion,
    bool RequiresTwoFactor,
    bool RequiresEmailRegistration,
    string? PendingName,
    List<PeopleResponse>? People = null);

public sealed record UserResponse(
    string FullName,
    string DisplayName,
    string Email,
    bool Admin,
    bool AddedToCalendar,
    int LastVersionSeen,
    int LastAnnouncementSeen,
    List<string> Allergies,
    Dictionary<string, EventChoiceResponse> EventChoices);

public sealed record EventChoiceResponse(string Meal, string Drink);

public sealed record AuthEventResponse(
    string Place,
    string VenueName,
    string MapQuery,
    DateTimeOffset Time,
    string DressCode,
    string Currency,
    List<MealOption> MealOptions,
    Dictionary<string, string> Rsvp);
public sealed record AuthAnnouncementResponse(int Id, string Title, string Message, DateTimeOffset CreatedAt, string CreatedBy);
public sealed record InviteRowResponse(string Pat, string FullName, string DisplayName, string Email, bool Admin, int LastAnnouncementSeen, int LastVersionSeen, string Locale);
public sealed record InviteListResponse(List<InviteRowResponse> Invites, bool PatLoginEnabled);
public sealed record GoLiveResponse(bool PatLoginEnabled, int EmailsSent, int SkippedWithoutEmail);
public sealed record PeopleResponse(string FullName, int LastAnnouncementSeen);
