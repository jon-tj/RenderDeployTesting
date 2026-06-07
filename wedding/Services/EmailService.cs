using System.Net;
using System.Web;
using FamilyHub.Model;
using Microsoft.Extensions.Options;
using Resend;

namespace FamilyHub.Services;

public sealed class EmailOptions
{
    // Public URL where the SPA is hosted (no trailing slash). Used to build
    // onboarding + event links inside outgoing emails.
    public string BaseUrl { get; set; } = "http://localhost:4200";

    // From address shown to recipients (must be a verified Resend sender).
    public string From { get; set; } = "FamilyHub <onboarding@resend.dev>";
}

public interface IEmailService
{
    Task SendInviteAsync(AppUser invitee, bool isOnboarded, CalendarEvent ev, AppUser inviter, CancellationToken ct = default);
}

public sealed class ResendEmailService : IEmailService
{
    private readonly IResend _resend;
    private readonly EmailOptions _options;
    private readonly ILogger<ResendEmailService> _log;

    public ResendEmailService(IResend resend, IOptions<EmailOptions> options, ILogger<ResendEmailService> log)
    {
        _resend = resend;
        _options = options.Value;
        _log = log;
    }

    public async Task SendInviteAsync(AppUser invitee, bool isOnboarded, CalendarEvent ev, AppUser inviter, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(invitee.Email)) return;

        var baseUrl = _options.BaseUrl.TrimEnd('/');
        var eventPath = $"/event/{ev.Id}";
        var link = isOnboarded
            ? $"{baseUrl}{eventPath}"
            : $"{baseUrl}/onboarding/{Uri.EscapeDataString(invitee.Id)}?next={HttpUtility.UrlEncode(eventPath)}";

        var html = ev.Type == EventType.Wedding
            ? RenderWeddingInvite(invitee, ev, inviter, link, isOnboarded)
            : RenderGenericInvite(invitee, ev, inviter, link, isOnboarded);

        var subject = ev.Type == EventType.Wedding
            ? $"You're invited — {SafeTitle(ev)}"
            : $"Invitation: {SafeTitle(ev)}";

        var message = new EmailMessage
        {
            From = _options.From,
            Subject = subject,
            HtmlBody = html,
        };
        message.To.Add(invitee.Email!);

        try
        {
            await _resend.EmailSendAsync(message, ct);
        }
        catch (Exception ex)
        {
            // Never fail the invite-add request because email delivery hiccuped.
            _log.LogError(ex, "Failed to send invite email to {Email} for event {EventId}", invitee.Email, ev.Id);
        }
    }

    private static string SafeTitle(CalendarEvent ev) =>
        string.IsNullOrWhiteSpace(ev.Title) ? "Our event" : ev.Title;

    private static string Enc(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);

    private static string FormatRange(DateTime startUtc, DateTime endUtc)
    {
        var start = startUtc.ToLocalTime();
        var end = endUtc.ToLocalTime();
        if (start.Date == end.Date)
            return $"{start:dddd, d MMMM yyyy} · {start:HH:mm}–{end:HH:mm}";
        return $"{start:dddd, d MMMM yyyy HH:mm} – {end:dddd, d MMMM yyyy HH:mm}";
    }

    private static string RenderWeddingInvite(AppUser invitee, CalendarEvent ev, AppUser inviter, string link, bool isOnboarded)
    {
        var title = Enc(SafeTitle(ev));
        var who = Enc(string.IsNullOrWhiteSpace(invitee.DisplayName) ? "Dear friend" : invitee.DisplayName);
        var hosts = Enc(string.IsNullOrWhiteSpace(inviter.DisplayName) ? "Your hosts" : inviter.DisplayName);
        var when = Enc(FormatRange(ev.StartUtc, ev.EndUtc));
        var where = Enc(ev.Location);
        var cta = isOnboarded ? "View the invitation" : "Open your invitation";
        var hint = isOnboarded
            ? "Sign in with your account to RSVP."
            : "We've set up an account for you — follow the link to finish signing in and RSVP.";

        return $@"<!doctype html>
<html lang=""en""><head><meta charset=""utf-8"" /><meta name=""viewport"" content=""width=device-width,initial-scale=1"" />
<title>{title}</title></head>
<body style=""margin:0;padding:0;background:#f3ead6;font-family:Georgia,'Cormorant Garamond',serif;color:#3a3327;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#f3ead6;padding:32px 16px;"">
    <tr><td align=""center"">
      <table role=""presentation"" width=""560"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px;width:100%;background:#fbf6ec;border:1px solid #ead9b3;border-radius:6px;overflow:hidden;"">
        <tr><td style=""padding:36px 36px 8px;text-align:center;"">
          <div style=""font-family:'Brush Script MT','Apple Chancery',cursive;font-size:1.6rem;color:#8a6f3a;letter-spacing:.02em;"">with love,</div>
          <div style=""font-size:.72rem;letter-spacing:.32em;text-transform:uppercase;color:#a08755;margin-top:8px;"">you are invited</div>
          <h1 style=""font-family:'Brush Script MT','Apple Chancery',cursive;font-weight:400;font-size:2.6rem;color:#3a3327;margin:14px 0 6px;line-height:1.05;"">{title}</h1>
          <div style=""font-style:italic;color:#7a6a4a;letter-spacing:.16em;text-transform:lowercase;font-size:.78rem;"">save the date</div>
        </td></tr>
        <tr><td style=""padding:0 36px;"">
          <hr style=""border:none;border-top:1px solid #ead9b3;margin:24px 0;"" />
        </td></tr>
        <tr><td style=""padding:0 36px;text-align:center;line-height:1.7;font-size:1rem;color:#4a402d;"">
          <p style=""margin:0 0 12px;"">Dearest {who},</p>
          <p style=""margin:0 0 12px;"">{hosts} would be honoured to have you join them on their special day.</p>
        </td></tr>
        <tr><td style=""padding:24px 36px 8px;text-align:center;"">
          <div style=""font-family:'Brush Script MT','Apple Chancery',cursive;font-size:1.6rem;color:#8a6f3a;line-height:1;"">{when}</div>
          {(string.IsNullOrEmpty(where) ? "" : $@"<div style=""font-style:italic;color:#5a4f37;margin-top:8px;"">{where}</div>")}
        </td></tr>
        <tr><td style=""padding:32px 36px;text-align:center;"">
          <a href=""{link}"" style=""display:inline-block;background:#3a3327;color:#fbf6ec;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:.78rem;letter-spacing:.18em;text-transform:uppercase;"">{cta}</a>
          <p style=""margin:18px 0 0;font-size:.85rem;color:#7a6a4a;"">{hint}</p>
        </td></tr>
        <tr><td style=""padding:0 36px 36px;text-align:center;"">
          <hr style=""border:none;border-top:1px solid #ead9b3;margin:0 0 16px;"" />
          <div style=""font-family:'Brush Script MT','Apple Chancery',cursive;font-size:1.4rem;color:#8a6f3a;"">with love ♥</div>
        </td></tr>
      </table>
      <div style=""max-width:560px;margin:14px auto 0;font-size:.72rem;color:#a08755;text-align:center;"">
        If the button doesn't work, copy this link: <span style=""word-break:break-all;"">{Enc(link)}</span>
      </div>
    </td></tr>
  </table>
</body></html>";
    }

    private static string RenderGenericInvite(AppUser invitee, CalendarEvent ev, AppUser inviter, string link, bool isOnboarded)
    {
        var title = Enc(SafeTitle(ev));
        var who = Enc(string.IsNullOrWhiteSpace(invitee.DisplayName) ? "there" : invitee.DisplayName);
        var hosts = Enc(string.IsNullOrWhiteSpace(inviter.DisplayName) ? "A FamilyHub member" : inviter.DisplayName);
        var when = Enc(FormatRange(ev.StartUtc, ev.EndUtc));
        var where = Enc(ev.Location);
        var description = Enc(ev.Description);
        var cta = isOnboarded ? "View event" : "Set up your account";
        var hint = isOnboarded
            ? "Sign in with your existing FamilyHub account to RSVP."
            : "We've prepared an account for you — follow the link to set a password and RSVP.";

        return $@"<!doctype html>
<html lang=""en""><head><meta charset=""utf-8"" /><meta name=""viewport"" content=""width=device-width,initial-scale=1"" />
<title>{title}</title></head>
<body style=""margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;"">
  <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#f4f4f5;padding:32px 16px;"">
    <tr><td align=""center"">
      <table role=""presentation"" width=""560"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"">
        <tr><td style=""padding:28px 32px 8px;"">
          <div style=""font-size:.78rem;letter-spacing:.18em;text-transform:uppercase;color:#6b7280;"">You're invited</div>
          <h1 style=""font-size:1.5rem;margin:8px 0 4px;color:#111827;"">{title}</h1>
          <div style=""color:#6b7280;font-size:.95rem;"">from {hosts}</div>
        </td></tr>
        <tr><td style=""padding:16px 32px 0;"">
          <table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""font-size:.95rem;"">
            <tr><td style=""color:#6b7280;width:80px;padding:4px 0;"">When</td><td style=""padding:4px 0;"">{when}</td></tr>
            {(string.IsNullOrEmpty(where) ? "" : $@"<tr><td style=""color:#6b7280;padding:4px 0;"">Where</td><td style=""padding:4px 0;"">{where}</td></tr>")}
          </table>
        </td></tr>
        {(string.IsNullOrEmpty(description) ? "" : $@"<tr><td style=""padding:16px 32px 0;color:#374151;line-height:1.55;white-space:pre-wrap;"">{description}</td></tr>")}
        <tr><td style=""padding:24px 32px 28px;"">
          <p style=""margin:0 0 14px;color:#374151;"">Hi {who}, you've been invited to this event.</p>
          <a href=""{link}"" style=""display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:6px;font-weight:600;font-size:.95rem;"">{cta}</a>
          <p style=""margin:14px 0 0;font-size:.85rem;color:#6b7280;"">{hint}</p>
        </td></tr>
      </table>
      <div style=""max-width:560px;margin:14px auto 0;font-size:.75rem;color:#9ca3af;text-align:center;"">
        Trouble with the button? Copy this link: <span style=""word-break:break-all;"">{Enc(link)}</span>
      </div>
    </td></tr>
  </table>
</body></html>";
    }
}
