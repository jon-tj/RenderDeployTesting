var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddControllers();
builder.Services.AddSingleton<wedding.Data.JsonDatabase>();

// Resend email client. Reads RESEND_API_KEY from env / config; if missing,
// EmailService falls back to logging instead of sending.
builder.Services.AddOptions();
builder.Services.AddHttpClient<Resend.ResendClient>();
builder.Services.Configure<Resend.ResendClientOptions>(o =>
{
    o.ApiToken = builder.Configuration["RESEND_API_KEY"] ?? string.Empty;
});
builder.Services.AddTransient<Resend.IResend, Resend.ResendClient>();

builder.Services.AddScoped<wedding.Services.EmailService>();
builder.Services.AddSingleton<wedding.Services.AdminTwoFactorService>();
builder.Services.AddCors(options =>
{
    options.AddPolicy("WeddingWebDev", policy =>
    {
        policy
            .WithOrigins("http://localhost:4200", "https://localhost:4200")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Note: no UseHttpsRedirection() here — Render terminates TLS and forwards
// plain HTTP to the container on $PORT; redirecting would create a loop.

app.UseCors("WeddingWebDev");

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapControllers();

// SPA fallback: any non-API, non-file request returns index.html
app.MapFallbackToFile("index.html");

app.Run();
