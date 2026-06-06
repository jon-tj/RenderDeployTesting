var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddControllers();
builder.Services.AddSingleton<wedding.Data.JsonDatabase>();
builder.Services.AddSingleton<wedding.Services.EmailService>();
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
