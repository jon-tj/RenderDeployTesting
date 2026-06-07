using System.Collections.Concurrent;
using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Web;
using FamilyHub.Controllers;
using FamilyHub.Model;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using Resend;

namespace FamilyHub.Services;

public sealed class EmailOptions
{
    // Public URL where the SPA is hosted (no trailing slash). Used to build
    // onboarding + event links inside outgoing emails.
    public string BaseUrl { get; set; } = "https://jonandmari.uk";

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
    private readonly UserManager<AppUser> _users;
    private readonly ILogger<ResendEmailService> _log;

    public ResendEmailService(IResend resend, IOptions<EmailOptions> options, UserManager<AppUser> users, ILogger<ResendEmailService> log)
    {
        _resend = resend;
        _options = options.Value;
        _users = users;
        _log = log;
    }

    public async Task SendInviteAsync(AppUser invitee, bool isOnboarded, CalendarEvent ev, AppUser inviter, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(invitee.Email)) return;

        var lang = LanguageCodes.Normalize(invitee.PreferredLanguage);
        var baseUrl = _options.BaseUrl.TrimEnd('/');
        var eventPath = $"/event/{ev.Id}";
        var link = isOnboarded
            ? $"{baseUrl}{eventPath}"
            : $"{baseUrl}/onboarding/{Uri.EscapeDataString(invitee.Id)}?next={HttpUtility.UrlEncode(eventPath)}";

        var hosts = await ResolveHostsAsync(ev, lang);

        var values = ev.Type == EventType.Wedding
            ? BuildWeddingValues(invitee, ev, hosts, link, isOnboarded, lang)
            : BuildGenericValues(invitee, ev, hosts, link, isOnboarded, lang);

        var template = LoadTemplate(ev.Type == EventType.Wedding ? "invite-wedding.html" : "invite-generic.html");
        var html = Render(template, values);

        var subject = ev.Type == EventType.Wedding
            ? T("subject_wedding", lang, LocalizedTitle(ev, lang))
            : T("subject_generic", lang, LocalizedTitle(ev, lang));

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

    private Dictionary<string, string> BuildWeddingValues(AppUser invitee, CalendarEvent ev, string hosts, string link, bool isOnboarded, string lang)
    {
        var where = Enc(ev.Location);
        return new Dictionary<string, string>
        {
            ["lang"] = lang,
            ["link"] = link,
            ["title"] = Enc(LocalizedTitle(ev, lang)),
            ["who"] = Enc(string.IsNullOrWhiteSpace(invitee.DisplayName) ? T("dear_friend", lang) : invitee.DisplayName),
            ["hosts"] = Enc(hosts),
            ["when"] = Enc(FormatRange(ev.StartUtc, ev.EndUtc, lang)),
            ["where_block"] = string.IsNullOrEmpty(where) ? string.Empty
                : $"<div style=\"font-style:italic;color:#5a4f37;margin-top:8px;\">{where}</div>",
            ["cta"] = Enc(T(isOnboarded ? "wedding_cta_signed_in" : "wedding_cta_onboard", lang)),
            ["hint"] = Enc(T(isOnboarded ? "wedding_hint_signed_in" : "wedding_hint_onboard", lang)),
            ["with_love_comma"] = Enc(T("with_love_comma", lang)),
            ["you_are_invited"] = Enc(T("you_are_invited", lang)),
            ["save_the_date"] = Enc(T("save_the_date", lang)),
            ["dearest_prefix"] = Enc(T("dearest_prefix", lang)),
            ["wedding_invite_tail"] = Enc(T("wedding_invite_tail", lang)),
            ["with_love_heart"] = Enc(T("with_love_heart", lang)),
            ["fallback_link"] = Enc(T("fallback_link", lang)),
        };
    }

    private Dictionary<string, string> BuildGenericValues(AppUser invitee, CalendarEvent ev, string hosts, string link, bool isOnboarded, string lang)
    {
        var where = Enc(ev.Location);
        var description = Enc(LocalizedDescription(ev, lang));
        return new Dictionary<string, string>
        {
            ["lang"] = lang,
            ["link"] = link,
            ["title"] = Enc(LocalizedTitle(ev, lang)),
            ["who"] = Enc(string.IsNullOrWhiteSpace(invitee.DisplayName) ? T("there", lang) : invitee.DisplayName),
            ["hosts"] = Enc(hosts),
            ["when"] = Enc(FormatRange(ev.StartUtc, ev.EndUtc, lang)),
            ["where_row"] = string.IsNullOrEmpty(where) ? string.Empty
                : $"<tr><td style=\"color:#6b7280;padding:4px 0;\">{Enc(T("where_label", lang))}</td><td style=\"padding:4px 0;\">{where}</td></tr>",
            ["description_row"] = string.IsNullOrEmpty(description) ? string.Empty
                : $"<tr><td style=\"padding:16px 32px 0;color:#374151;line-height:1.55;white-space:pre-wrap;\">{description}</td></tr>",
            ["cta"] = Enc(T(isOnboarded ? "generic_cta_signed_in" : "generic_cta_onboard", lang)),
            ["hint"] = Enc(T(isOnboarded ? "generic_hint_signed_in" : "generic_hint_onboard", lang)),
            ["youre_invited"] = Enc(T("youre_invited", lang)),
            ["from_label"] = Enc(T("from_label", lang)),
            ["when_label"] = Enc(T("when_label", lang)),
            ["hi_prefix"] = Enc(T("hi_prefix", lang)),
            ["youve_been_invited_tail"] = Enc(T("youve_been_invited_tail", lang)),
            ["trouble_link"] = Enc(T("trouble_link", lang)),
        };
    }

    private async Task<string> ResolveHostsAsync(CalendarEvent ev, string lang)
    {
        var names = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        async Task AddAsync(string? userId, AppUser? loaded)
        {
            if (string.IsNullOrEmpty(userId) || !seen.Add(userId)) return;
            var user = loaded ?? await _users.FindByIdAsync(userId);
            var name = user?.DisplayName;
            if (!string.IsNullOrWhiteSpace(name)) names.Add(name);
        }

        await AddAsync(ev.CreatedById, null);
        foreach (var co in ev.CoOwners)
            await AddAsync(co.UserId, co.User);

        if (names.Count == 0) return T("your_hosts", lang);
        if (names.Count == 1) return names[0];
        var and = T("and_word", lang);
        var head = string.Join(", ", names.Take(names.Count - 1));
        return $"{head} {and} {names[^1]}";
    }

    private static string LocalizedTitle(CalendarEvent ev, string lang)
    {
        var fallback = string.IsNullOrWhiteSpace(ev.Title) ? T("default_title", lang) : ev.Title;
        if (!ev.EnableTranslations || lang == LanguageCodes.Default) return fallback;
        if (ev.Translations.TryGetValue(lang, out var t) && !string.IsNullOrWhiteSpace(t.Title)) return t.Title;
        return fallback;
    }

    private static string LocalizedDescription(CalendarEvent ev, string lang)
    {
        if (!ev.EnableTranslations || lang == LanguageCodes.Default) return ev.Description;
        if (ev.Translations.TryGetValue(lang, out var t) && !string.IsNullOrWhiteSpace(t.Description)) return t.Description;
        return ev.Description;
    }

    private static string Enc(string? s) => WebUtility.HtmlEncode(s ?? string.Empty);

    private static CultureInfo CultureFor(string lang) => lang switch
    {
        "nb" => CultureInfo.GetCultureInfo("nb-NO"),
        "pt-BR" => CultureInfo.GetCultureInfo("pt-BR"),
        _ => CultureInfo.GetCultureInfo("en-GB"),
    };

    private static string FormatRange(DateTime startUtc, DateTime endUtc, string lang)
    {
        var culture = CultureFor(lang);
        var start = startUtc.ToLocalTime();
        var end = endUtc.ToLocalTime();
        if (start.Date == end.Date)
            return $"{start.ToString("dddd, d MMMM yyyy", culture)} \u00b7 {start:HH:mm}\u2013{end:HH:mm}";
        return $"{start.ToString("dddd, d MMMM yyyy HH:mm", culture)} \u2013 {end.ToString("dddd, d MMMM yyyy HH:mm", culture)}";
    }

    // ---- template + lang file loading ----

    private static readonly Regex PlaceholderRegex = new(@"\{\{(\w+)\}\}", RegexOptions.Compiled);
    private static readonly ConcurrentDictionary<string, string> TemplateCache = new();
    private static readonly ConcurrentDictionary<string, IReadOnlyDictionary<string, string>> StringsCache = new();

    private static string EmailsDir => Path.Combine(AppContext.BaseDirectory, "Emails");

    private static string LoadTemplate(string fileName) =>
        TemplateCache.GetOrAdd(fileName, n => File.ReadAllText(Path.Combine(EmailsDir, n)));

    private static IReadOnlyDictionary<string, string> LoadStrings(string lang) =>
        StringsCache.GetOrAdd(lang, l =>
        {
            var path = Path.Combine(EmailsDir, $"strings.{l}.json");
            if (!File.Exists(path)) return new Dictionary<string, string>();
            var json = File.ReadAllText(path);
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new();
        });

    private static string T(string key, string lang, params string[] args)
    {
        if (!LoadStrings(lang).TryGetValue(key, out var raw) &&
            !LoadStrings(LanguageCodes.Default).TryGetValue(key, out raw))
            raw = key;
        return args.Length == 0 ? raw : Regex.Replace(raw, @"\{(\d+)\}", m =>
        {
            var i = int.Parse(m.Groups[1].Value);
            return i < args.Length ? args[i] : string.Empty;
        });
    }

    private static string Render(string template, IReadOnlyDictionary<string, string> values) =>
        PlaceholderRegex.Replace(template, m => values.TryGetValue(m.Groups[1].Value, out var v) ? v : string.Empty);
}
