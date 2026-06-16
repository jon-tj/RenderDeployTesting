using FamilyHub.Data;
using FamilyHub.Model;
using FamilyHub.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Resend;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Postgres takes precedence when DATABASE_URL (Render-style URI) or a
// ConnectionStrings:Postgres value is supplied; otherwise fall back to a
// local SQLite file. Lets the same image run on Render with persistent
// storage and locally without extra setup.
var pgConn = ResolvePostgresConnectionString(builder.Configuration);
if (!string.IsNullOrWhiteSpace(pgConn))
{
    builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(pgConn));
}
else
{
    var dbPath = builder.Configuration["FAMILYHUB_DB_PATH"]
        ?? Path.Combine(AppContext.BaseDirectory, "Data", "familyhub.db");
    Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);
    builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite($"Data Source={dbPath}"));
}

builder.Services
    .AddIdentityApiEndpoints<AppUser>(o =>
    {
        o.Password.RequiredLength = 8;
        o.Password.RequireNonAlphanumeric = false;
        o.Password.RequireUppercase = false;
        o.User.RequireUniqueEmail = true;
        o.SignIn.RequireConfirmedAccount = false;
    })
    .AddEntityFrameworkStores<AppDbContext>();

// Browsers can't attach Authorization headers to the WebSocket upgrade, so
// SignalR clients pass the bearer token via ?access_token=. Surface it to
// the Identity bearer handler so /hubs/* requests authenticate.
builder.Services.Configure<Microsoft.AspNetCore.Authentication.BearerToken.BearerTokenOptions>(
    IdentityConstants.BearerScheme, o =>
    {
        var existing = o.Events.OnMessageReceived;
        o.Events.OnMessageReceived = async ctx =>
        {
            if (existing is not null) await existing(ctx);
            if (string.IsNullOrEmpty(ctx.Token) &&
                ctx.Request.Path.StartsWithSegments("/hubs") &&
                ctx.Request.Query.TryGetValue("access_token", out var t))
            {
                ctx.Token = t!;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();
builder.Services.AddSignalR().AddJsonProtocol(o =>
    o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSingleton<FamilyHub.Services.Games.GameRoomManager>();

builder.Services.AddCors(o => o.AddPolicy("SpaDev", p => p
    .WithOrigins("http://localhost:4200", "https://localhost:4200")
    .AllowAnyHeader().AllowAnyMethod()));

builder.Services.Configure<EmailOptions>(o =>
{
    builder.Configuration.GetSection("Email").Bind(o);
    if (Environment.GetEnvironmentVariable("EMAIL_FROM") is { Length: > 0 } from) o.From = from;
    if (Environment.GetEnvironmentVariable("EMAIL_BASE_URL") is { Length: > 0 } url) o.BaseUrl = url;
});
builder.Services.AddResend(o => o.ApiToken =
    Environment.GetEnvironmentVariable("RESEND_API_KEY")
    ?? builder.Configuration["Resend:ApiToken"]
    ?? Environment.GetEnvironmentVariable("RESEND_APITOKEN")
    ?? string.Empty);
builder.Services.AddScoped<IEmailService, ResendEmailService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreated();
    var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
    await SeedAdmin(users, "piehunter123@gmail.com", "Passw0rd!", "Jon");
    await SeedAdmin(users, "mariana.slvapereira@gmail.com", "Passw0rd!", "Mariana");
}

if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.UseCors("SpaDev");
app.UseAuthentication();
app.UseAuthorization();
app.UseDefaultFiles();
app.UseStaticFiles();
app.MapGroup("/api/auth").MapIdentityApi<AppUser>();
app.MapControllers();
app.MapHub<FamilyHub.Hubs.GamesHub>("/hubs/games");
app.MapFallbackToFile("index.html");
app.Run();

// Ensures the named account exists with full permissions; resets password if missing.
static async Task SeedAdmin(UserManager<AppUser> users, string email, string password, string displayName)
{
    var normalized = email.Trim().ToLowerInvariant();
    var user = await users.FindByEmailAsync(normalized);
    if (user is null)
    {
        await users.CreateAsync(new AppUser
        {
            UserName = normalized, Email = normalized, EmailConfirmed = true,
            DisplayName = displayName,
            CanCreateWeddingEvent = true, CanCreateFamilyGathering = true,
            DietaryPreferences = new DietaryPreferences(),
        }, password);
        return;
    }
    user.CanCreateWeddingEvent = true;
    user.CanCreateFamilyGathering = true;
    user.EmailConfirmed = true;
    if (user.DisplayName == normalized) user.DisplayName = displayName;
    await users.UpdateAsync(user);
    if (!await users.HasPasswordAsync(user)) await users.AddPasswordAsync(user, password);
}

// Accepts either a Render-style URI (postgres://user:pass@host:port/db) via
// DATABASE_URL, or a fully-formed Npgsql connection string via
// ConnectionStrings:Postgres. Returns null when neither is set.
static string? ResolvePostgresConnectionString(IConfiguration cfg)
{
    var fromConfig = cfg.GetConnectionString("Postgres");
    if (!string.IsNullOrWhiteSpace(fromConfig)) return fromConfig;

    var url = Environment.GetEnvironmentVariable("DATABASE_URL")
        ?? cfg["DATABASE_URL"];
    if (string.IsNullOrWhiteSpace(url)) return null;
    if (url.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
        url = "postgresql://" + url["postgres://".Length..];
    if (!url.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
        return url; // already an Npgsql key=value string

    var uri = new Uri(url);
    var userInfo = uri.UserInfo.Split(':', 2);
    var user = Uri.UnescapeDataString(userInfo[0]);
    var pass = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";
    var db = uri.AbsolutePath.TrimStart('/');
    var port = uri.IsDefaultPort ? 5432 : uri.Port;
    // SSL: Render requires it. Trust server cert since Render's PG cert
    // is self-signed for the internal hostname.
    return $"Host={uri.Host};Port={port};Database={db};Username={user};Password={pass};SSL Mode=Require;Trust Server Certificate=true";
}
