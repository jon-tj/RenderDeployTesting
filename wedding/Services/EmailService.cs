using wedding.Model;

namespace wedding.Services;

public sealed class EmailService
{
    private readonly ILogger<EmailService> _logger;
    private readonly string _announcementTemplate;
    private readonly string _adminTwoFactorTemplate;
    private readonly string _inviteTemplate;

    public EmailService(ILogger<EmailService> logger, IWebHostEnvironment environment)
    {
        _logger = logger;

        var templateFolder = Path.Combine(environment.ContentRootPath, "Emails");
        _announcementTemplate = LoadTemplate(templateFolder, "announcement.html");
        _adminTwoFactorTemplate = LoadTemplate(templateFolder, "admin-2fa.html");
        _inviteTemplate = LoadTemplate(templateFolder, "invite.html");
    }

    public Task SendAnnouncementAsync(Announcement announcement, IEnumerable<User> recipients)
    {
        var recipientCount = recipients.Count();
        var htmlBody = string.Format(
            _announcementTemplate,
            announcement.Title,
            announcement.Message,
            announcement.CreatedBy,
            announcement.CreatedAt.ToString("f"));

        _logger.LogInformation(
            "[MockEmailService] Announcement '{Title}' would be emailed to {RecipientCount} users. HTML body:{NewLine}{HtmlBody}",
            announcement.Title,
            recipientCount,
            Environment.NewLine,
            htmlBody);

        return Task.CompletedTask;
    }

    public Task SendAdminTwoFactorCodeAsync(User adminUser, string code, TimeSpan validFor)
    {
        var htmlBody = string.Format(
            _adminTwoFactorTemplate,
            adminUser.DisplayName,
            code,
            Math.Ceiling(validFor.TotalMinutes));

        _logger.LogInformation(
            "[MockEmailService] Admin 2FA email for {Email} ({DisplayName}) with code {Code}. HTML body:{NewLine}{HtmlBody}",
            adminUser.Email,
            adminUser.DisplayName,
            code,
            Environment.NewLine,
            htmlBody);

        return Task.CompletedTask;
    }

    public Task SendInviteAsync(User invitedUser, string inviteLink)
    {
        var htmlBody = string.Format(
            _inviteTemplate,
            invitedUser.DisplayName,
            inviteLink);

        _logger.LogInformation(
            "[MockEmailService] Invite for {DisplayName} <{Email}> with PAT link: {InviteLink}. HTML body:{NewLine}{HtmlBody}",
            invitedUser.DisplayName,
            invitedUser.Email,
            inviteLink,
            Environment.NewLine,
            htmlBody);

        return Task.CompletedTask;
    }

    private static string LoadTemplate(string folderPath, string fileName)
    {
        var path = Path.Combine(folderPath, fileName);
        return File.ReadAllText(path);
    }
}
