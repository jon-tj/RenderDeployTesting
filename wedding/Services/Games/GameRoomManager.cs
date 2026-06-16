using System.Collections.Concurrent;
using System.Text.Json;
using FamilyHub.Model;

namespace FamilyHub.Services.Games;

public sealed class GameRoomPlayer
{
    public required string UserId { get; init; }
    public required string DisplayName { get; set; }
    public string? ConnectionId { get; set; }
    public bool Connected => ConnectionId is not null;
}

public enum RoomStatus { Lobby, Playing, Ended }

public sealed class GameRoom
{
    public required string Code { get; init; }
    public required string GameId { get; init; }
    public required string ConfigId { get; init; } // length 1
    public required string HostUserId { get; init; }
    public RoomStatus Status { get; set; } = RoomStatus.Lobby;
    public List<GameRoomPlayer> Players { get; } = new();
    public IGameEngine? Engine { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset LastActivity { get; set; } = DateTimeOffset.UtcNow;
    public readonly object Lock = new();

    public int MinPlayers => GameId switch
    {
        "uno" => 2,
        "buraco" => ConfigId == "B" ? 4 : 2,
        _ => 2,
    };

    public int MaxPlayers => GameId switch
    {
        "uno" => 4,
        "buraco" => ConfigId == "B" ? 4 : 2,
        _ => 4,
    };
}

// Rooms live in-memory only. A restart kicks everyone back to the lobby —
// acceptable for casual play; persisting in-flight game state across
// restarts is out of scope for this iteration.
public sealed class GameRoomManager
{
    readonly ConcurrentDictionary<string, GameRoom> _rooms = new(StringComparer.OrdinalIgnoreCase);
    readonly ConcurrentDictionary<string, string> _connectionToRoom = new();
    static readonly Random _rng = new();

    public GameRoom Create(string gameId, string configId, string hostUserId, string hostName)
    {
        if (configId.Length != 1 || GameConfigs.Get(configId[0]) is null)
            throw new ArgumentException($"Unknown configId '{configId}'");

        for (int i = 0; i < 10; i++)
        {
            var code = NewCode();
            var room = new GameRoom
            {
                Code = code,
                GameId = gameId,
                ConfigId = configId,
                HostUserId = hostUserId,
            };
            room.Players.Add(new GameRoomPlayer { UserId = hostUserId, DisplayName = hostName });
            if (_rooms.TryAdd(code, room)) return room;
        }
        throw new InvalidOperationException("Could not allocate a unique room code");
    }

    public GameRoom? Get(string code) => _rooms.TryGetValue(code, out var r) ? r : null;
    public GameRoom? RoomFor(string connectionId) =>
        _connectionToRoom.TryGetValue(connectionId, out var c) ? Get(c) : null;
    public void Track(string connectionId, string roomCode) => _connectionToRoom[connectionId] = roomCode;
    public void Untrack(string connectionId) => _connectionToRoom.TryRemove(connectionId, out _);

    public void Remove(string code) => _rooms.TryRemove(code, out _);

    static string NewCode()
    {
        const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous chars
        Span<char> buf = stackalloc char[5];
        for (int i = 0; i < buf.Length; i++) buf[i] = alphabet[_rng.Next(alphabet.Length)];
        return new string(buf);
    }

    public IGameEngine BuildEngine(GameRoom room) => room.GameId switch
    {
        "uno" => new UnoEngine(room.ConfigId),
        "buraco" => new BuracoEngine(room.ConfigId),
        _ => throw new ArgumentException($"Unknown gameId '{room.GameId}'"),
    };

    // Public DTOs are simple enough that callers can map directly. Keeping
    // the manager focused on lifecycle.
    public static JsonElement RoomStateJson(GameRoom r)
    {
        var doc = JsonSerializer.SerializeToElement(new
        {
            code = r.Code,
            gameId = r.GameId,
            configId = r.ConfigId,
            host = r.HostUserId,
            status = r.Status.ToString(),
            minPlayers = r.MinPlayers,
            maxPlayers = r.MaxPlayers,
            players = r.Players.Select(p => new
            {
                userId = p.UserId,
                displayName = p.DisplayName,
                connected = p.Connected,
            }).ToList(),
        });
        return doc;
    }
}
