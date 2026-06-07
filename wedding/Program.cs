using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

var dbPath = builder.Configuration["FAMILYHUB_DB_PATH"]
    ?? Path.Combine(AppContext.BaseDirectory, "Data", "familyhub.db");
Directory.CreateDirectory(Path.GetDirectoryName(dbPath)!);

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseSqlite($"Data Source={dbPath}"));

builder.Services
    .AddIdentityApiEndpoints<AppUser>(opt =>
    {
        opt.Password.RequiredLength = 8;
        opt.Password.RequireNonAlphanumeric = false;
        opt.Password.RequireUppercase = false;
        opt.User.RequireUniqueEmail = true;
        opt.SignIn.RequireConfirmedAccount = false;
    })
    .AddEntityFrameworkStores<AppDbContext>();

builder.Services.AddAuthorization();
builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        // Accept and emit enum names (e.g. "Wedding") instead of integers
        // so the SPA can round-trip them as strings.
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });
builder.Services.AddOpenApi();

builder.Services.AddCors(opt =>
{
    opt.AddPolicy("SpaDev", p => p
        .WithOrigins("http://localhost:4200", "https://localhost:4200")
        .AllowAnyHeader()
        .AllowAnyMethod());
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
    await SeedAdminAsync(userManager, "piehunter123@gmail.com", "Passw0rd!");
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("SpaDev");
app.UseAuthentication();
app.UseAuthorization();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGroup("/api/auth").MapIdentityApi<AppUser>();
app.MapControllers();

app.MapFallbackToFile("index.html");

app.Run();

// Ensures the named account exists and always has the full permission set.
// Safe to run on every startup: only flips flags / resets the password when needed.
static async Task SeedAdminAsync(UserManager<AppUser> users, string email, string password)
{
    var normalized = email.Trim().ToLowerInvariant();
    var user = await users.FindByEmailAsync(normalized);
    if (user is null)
    {
        user = new AppUser
        {
            UserName = normalized,
            Email = normalized,
            EmailConfirmed = true,
            DisplayName = normalized,
            CanCreateWeddingEvent = true,
            CanCreateFamilyGathering = true,
            DietaryPreferences = new DietaryPreferences(),
        };
        await users.CreateAsync(user, password);
        return;
    }

    var changed = false;
    if (!user.CanCreateWeddingEvent) { user.CanCreateWeddingEvent = true; changed = true; }
    if (!user.CanCreateFamilyGathering) { user.CanCreateFamilyGathering = true; changed = true; }
    if (!user.EmailConfirmed) { user.EmailConfirmed = true; changed = true; }
    if (changed) await users.UpdateAsync(user);

    // If the account was created earlier without a password (e.g. invite stub),
    // attach the seed password so the admin can actually sign in.
    if (!await users.HasPasswordAsync(user))
    {
        await users.AddPasswordAsync(user, password);
    }
}
