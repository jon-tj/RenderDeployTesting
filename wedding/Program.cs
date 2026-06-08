using FamilyHub.Data;
using FamilyHub.Model;
using FamilyHub.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Resend;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

var dbPath = builder.Configuration["FAMILYHUB_DB_PATH"]
    ?? Path.Combine(AppContext.BaseDirectory, "Data", "familyhub.db");
Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);

builder.Services.AddDbContext<AppDbContext>(o => o.UseSqlite($"Data Source={dbPath}"));

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

builder.Services.AddAuthorization();
builder.Services.AddControllers().AddJsonOptions(o =>
    o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddOpenApi();

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
