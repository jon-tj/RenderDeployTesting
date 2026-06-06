using Resend;
using wedding.Model;

namespace wedding.Services;

public sealed class EmailService
{
    private const string DefaultWebsiteUrl = "https://jonandmari.uk";

    private readonly ILogger<EmailService> _logger;
    private readonly IResend _resend;
    private readonly bool _resendConfigured;
    private readonly string _fromAddress;
    private readonly string _announcementTemplate;
    private readonly string _adminTwoFactorTemplate;
    private readonly string _inviteTemplate;

    public EmailService(
        ILogger<EmailService> logger,
        IWebHostEnvironment environment,
        IConfiguration configuration,
        IResend resend)
    {
        _logger = logger;
        _resend = resend;

        _resendConfigured = !string.IsNullOrWhiteSpace(configuration["RESEND_API_KEY"]);
        _fromAddress = configuration["EMAIL_FROM"] ?? "Majori Wedding <onboarding@resend.dev>";
        var websiteUrl = configuration["WEBSITE_URL"] ?? DefaultWebsiteUrl;

        if (!_resendConfigured)
        {
            _logger.LogWarning("RESEND_API_KEY not set — EmailService will log instead of sending.");
        }

        var templateFolder = Path.Combine(environment.ContentRootPath, "Emails");
        _announcementTemplate = LoadTemplate(templateFolder, "announcement.html", websiteUrl);
        _adminTwoFactorTemplate = LoadTemplate(templateFolder, "admin-2fa.html", websiteUrl);
        _inviteTemplate = LoadTemplate(templateFolder, "invite.html", websiteUrl);
    }

    public Task SendAnnouncementAsync(Announcement announcement, IEnumerable<User> recipients)
    {
        var htmlBody = string.Format(
            _announcementTemplate,
            announcement.Title,
            announcement.Message,
            announcement.CreatedBy,
            announcement.CreatedAt.ToString("f"));

        var addresses = recipients
            .Where(u => !string.IsNullOrWhiteSpace(u.Email))
            .Select(u => u.Email!)
            .ToArray();

        return SendAsync(addresses, $"Majori Wedding — {announcement.Title}", htmlBody);
    }

    public Task SendAdminTwoFactorCodeAsync(User adminUser, string code, TimeSpan validFor)
    {
        var htmlBody = string.Format(
            _adminTwoFactorTemplate,
            adminUser.DisplayName,
            code,
            Math.Ceiling(validFor.TotalMinutes));

        return SendAsync(new[] { adminUser.Email ?? string.Empty }, "Majori Wedding — admin 2FA code", htmlBody);
    }

    public Task SendInviteAsync(User invitedUser, string inviteLink)
    {
        var htmlBody = string.Format(
            _inviteTemplate,
            invitedUser.DisplayName,
            inviteLink);

        return SendAsync(new[] { invitedUser.Email ?? string.Empty }, "You're invited — Majori Wedding", htmlBody);
    }

    private async Task SendAsync(string[] to, string subject, string htmlBody)
    {
        to = to.Where(addr => !string.IsNullOrWhiteSpace(addr)).ToArray();
        if (to.Length == 0)
        {
            _logger.LogInformation("Skipping email '{Subject}' — no valid recipients.", subject);
            return;
        }

        if (!_resendConfigured)
        {
            _logger.LogInformation(
                "[MockEmail] To={Recipients} Subject={Subject}{NewLine}{Body}",
                string.Join(", ", to),
                subject,
                Environment.NewLine,
                htmlBody);
            return;
        }

        var message = new EmailMessage
        {
            From = _fromAddress,
            Subject = subject,
            HtmlBody = htmlBody,
        };
        foreach (var addr in to)
        {
            message.To.Add(addr);
        }

        try
        {
            var result = await _resend.EmailSendAsync(message);
            _logger.LogInformation(
                "Resend: sent '{Subject}' to {Recipients} (id={Id}).",
                subject,
                string.Join(", ", to),
                result?.Content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Resend send failed for '{Subject}'.", subject);
        }
    }

    private static string LoadTemplate(string folderPath, string fileName, string websiteUrl)
    {
        var path = Path.Combine(folderPath, fileName);
        var raw = File.ReadAllText(path);
        // {{WEBSITE_URL}} is replaced once at load time so it doesn't collide with
        // the numeric {0}, {1}... placeholders used by string.Format at send time.
        var host = new Uri(websiteUrl).Host;
        return raw
            .Replace("{{WEBSITE_URL}}", websiteUrl)
            .Replace("{{WEBSITE_HOST}}", host);
    }
}

