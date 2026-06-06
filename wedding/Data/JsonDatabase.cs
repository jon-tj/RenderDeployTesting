using System.Text.Json;
using System.Text.Json.Serialization;
using wedding.Model;

namespace wedding.Data;

public sealed class JsonDatabase
{
    private readonly string _dataPath;
    private readonly JsonSerializerOptions _serializerOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    public List<User> Users { get; private set; } = [];
    public int CurrentVersion { get; private set; }
    public List<WeddingEvent> Events { get; private set; } = [];
    public List<Announcement> Announcements { get; private set; } = [];
    public bool PatLoginEnabled { get; set; }

    public JsonDatabase(IWebHostEnvironment environment)
    {
        var dataFolder = Path.Combine(environment.ContentRootPath, "Data");
        var primaryPath = Path.Combine(dataFolder, "data.json");
        var fallbackPath = Path.Combine(dataFolder, "example.json");

        _dataPath = primaryPath;

        var fileToLoad = File.Exists(primaryPath) ? primaryPath : fallbackPath;
        Load(fileToLoad);
        LoadCurrentVersionFromExample(fallbackPath);

        // Persist startup state to the primary data file.
        Commit();
    }

    public void Commit()
    {
        var payload = new DatabasePayload
        {
            CurrentVersion = CurrentVersion,
            Events = Events,
            Announcements = Announcements,
            Users = Users,
            PatLoginEnabled = PatLoginEnabled
        };

        var directory = Path.GetDirectoryName(_dataPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var json = JsonSerializer.Serialize(payload, _serializerOptions);
        File.WriteAllText(_dataPath, json);
    }

    private void Load(string path)
    {
        if (!File.Exists(path))
        {
            Users = [];
            return;
        }

        var json = File.ReadAllText(path);
        var payload = JsonSerializer.Deserialize<DatabasePayload>(json, _serializerOptions);
        Users = payload?.Users ?? [];
        Announcements = payload?.Announcements ?? [];
        PatLoginEnabled = payload?.PatLoginEnabled ?? false;

        if (payload?.Events is { Count: > 0 })
        {
            Events = payload.Events;
        }
        else if (payload?.Event is not null)
        {
            // Backward compatibility for old single-event payloads.
            Events = [payload.Event];
        }
        else
        {
            Events = [];
        }
    }

    private void LoadCurrentVersionFromExample(string examplePath)
    {
        if (!File.Exists(examplePath))
        {
            CurrentVersion = 0;
            return;
        }

        var json = File.ReadAllText(examplePath);
        var payload = JsonSerializer.Deserialize<DatabasePayload>(json, _serializerOptions);
        CurrentVersion = payload?.CurrentVersion ?? 0;
    }

    private sealed class DatabasePayload
    {
        [JsonPropertyName("currentVersion")]
        public int CurrentVersion { get; init; }

        [JsonPropertyName("users")]
        public List<User> Users { get; init; } = [];

        [JsonPropertyName("events")]
        public List<WeddingEvent> Events { get; init; } = [];

        [JsonPropertyName("announcements")]
        public List<Announcement> Announcements { get; init; } = [];

        [JsonPropertyName("patLoginEnabled")]
        public bool PatLoginEnabled { get; init; }

        [JsonPropertyName("event")]
        public WeddingEvent? Event { get; init; }
    }
}