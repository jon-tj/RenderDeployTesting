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

builder.Services.Configure<EmailOptions>(opt =>
{
    builder.Configuration.GetSection("Email").Bind(opt);
    var envFrom = Environment.GetEnvironmentVariable("EMAIL_FROM");
    if (!string.IsNullOrWhiteSpace(envFrom)) opt.From = envFrom;
    var envBase = Environment.GetEnvironmentVariable("EMAIL_BASE_URL");
    if (!string.IsNullOrWhiteSpace(envBase)) opt.BaseUrl = envBase;
});
builder.Services.AddResend(o =>
{
    o.ApiToken = Environment.GetEnvironmentVariable("RESEND_API_KEY")
        ?? builder.Configuration["Resend:ApiToken"]
        ?? Environment.GetEnvironmentVariable("RESEND_APITOKEN")
        ?? string.Empty;
});
builder.Services.AddScoped<IEmailService, ResendEmailService>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();

    // Additive schema patch: EnsureCreated doesn't ALTER existing tables, so
    // add new columns by hand. Safe to run repeatedly (PRAGMA-checked).
    await EnsureColumnAsync(db, "Invites", "InviteEmailSentUtc", "TEXT NULL");
    await EnsureColumnAsync(db, "Events", "DressCode", "TEXT NOT NULL DEFAULT ''");
    await EnsureColumnAsync(db, "Events", "LocationLabel", "TEXT NOT NULL DEFAULT ''");
    await EnsureTableAsync(db, "InviteGroups", @"CREATE TABLE InviteGroups (
        Id INTEGER NOT NULL CONSTRAINT PK_InviteGroups PRIMARY KEY AUTOINCREMENT,
        EventId INTEGER NOT NULL,
        Name TEXT NOT NULL,
        VisibleChildEventIds TEXT NOT NULL,
        CreatedAtUtc TEXT NOT NULL,
        CONSTRAINT FK_InviteGroups_Events_EventId FOREIGN KEY (EventId) REFERENCES Events (Id) ON DELETE CASCADE
    );");
    await EnsureColumnAsync(db, "Invites", "InviteGroupId", "INTEGER NULL REFERENCES InviteGroups(Id) ON DELETE SET NULL");

    await EnsureTableAsync(db, "WishlistItems", @"CREATE TABLE WishlistItems (
        Id INTEGER NOT NULL CONSTRAINT PK_WishlistItems PRIMARY KEY AUTOINCREMENT,
        EventId INTEGER NULL,
        OwnerUserId TEXT NULL,
        Name TEXT NOT NULL,
        Description TEXT NOT NULL DEFAULT '',
        Url TEXT NOT NULL DEFAULT '',
        ImageUrl TEXT NOT NULL DEFAULT '',
        PriceMinor INTEGER NOT NULL DEFAULT 0,
        Currency INTEGER NOT NULL DEFAULT 0,
        PixKey TEXT NOT NULL DEFAULT '',
        WishedQuantity INTEGER NOT NULL DEFAULT 1,
        CreatedAtUtc TEXT NOT NULL,
        CONSTRAINT FK_WishlistItems_Events_EventId FOREIGN KEY (EventId) REFERENCES Events (Id) ON DELETE CASCADE
    );");
    await EnsureTableAsync(db, "WishlistClaims", @"CREATE TABLE WishlistClaims (
        Id INTEGER NOT NULL CONSTRAINT PK_WishlistClaims PRIMARY KEY AUTOINCREMENT,
        ItemId INTEGER NOT NULL,
        ClaimantUserId TEXT NULL,
        ClaimantLabel TEXT NOT NULL DEFAULT '',
        Quantity INTEGER NOT NULL DEFAULT 1,
        CreatedAtUtc TEXT NOT NULL,
        CONSTRAINT FK_WishlistClaims_WishlistItems_ItemId FOREIGN KEY (ItemId) REFERENCES WishlistItems (Id) ON DELETE CASCADE,
        CONSTRAINT FK_WishlistClaims_Users_ClaimantUserId FOREIGN KEY (ClaimantUserId) REFERENCES AspNetUsers (Id) ON DELETE SET NULL
    );");
    await EnsureColumnAsync(db, "WishlistItems", "ImageData", "BLOB NULL");
    await EnsureColumnAsync(db, "WishlistItems", "ImageContentType", "TEXT NOT NULL DEFAULT ''");
    // Migration: wishlists were originally owned by users. Adding nullable
    // EventId here lets old rows survive as orphans (controller hides them).
    await EnsureColumnAsync(db, "WishlistItems", "EventId", "INTEGER NULL REFERENCES Events(Id) ON DELETE CASCADE");

    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
    await SeedAdminAsync(userManager, "piehunter123@gmail.com", "Passw0rd!", "Jon");
    await SeedAdminAsync(userManager, "mariana.slvapereira@gmail.com", "Passw0rd!", "Mariana");
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
static async Task SeedAdminAsync(UserManager<AppUser> users, string email, string password, string displayName)
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
            DisplayName = displayName,
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
    if (user.DisplayName == normalized && user.DisplayName != displayName) { user.DisplayName = displayName; changed = true; }
    if (changed) await users.UpdateAsync(user);

    // If the account was created earlier without a password (e.g. invite stub),
    // attach the seed password so the admin can actually sign in.
    if (!await users.HasPasswordAsync(user))
    {
        await users.AddPasswordAsync(user, password);
    }
}

// Adds a column to a SQLite table if it doesn't already exist.
static async Task EnsureColumnAsync(AppDbContext db, string table, string column, string columnDef)
{
    var conn = db.Database.GetDbConnection();
    if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
    await using var pragma = conn.CreateCommand();
    pragma.CommandText = $"PRAGMA table_info({table});";
    await using var reader = await pragma.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        if (string.Equals(reader.GetString(1), column, StringComparison.OrdinalIgnoreCase)) return;
    }
    await reader.CloseAsync();
    await db.Database.ExecuteSqlRawAsync($"ALTER TABLE {table} ADD COLUMN {column} {columnDef};");
}

// Creates a SQLite table from the given DDL if it doesn't already exist.
static async Task EnsureTableAsync(AppDbContext db, string table, string createSql)
{
    var conn = db.Database.GetDbConnection();
    if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
    await using var probe = conn.CreateCommand();
    probe.CommandText = "SELECT name FROM sqlite_master WHERE type='table' AND name=$n;";
    var p = probe.CreateParameter();
    p.ParameterName = "$n";
    p.Value = table;
    probe.Parameters.Add(p);
    var existing = await probe.ExecuteScalarAsync();
    if (existing is not null) return;
    await db.Database.ExecuteSqlRawAsync(createSql);
}
