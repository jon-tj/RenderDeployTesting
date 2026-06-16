using System.Text.Json;

namespace FamilyHub.Services.Games;

// Per-player, per-engine view of game state. JsonElement so the hub can
// stream engine-specific shapes without coupling to game types.
public sealed record GameView(JsonElement State, bool IsEnded);

public sealed record GameEndResult(
    IReadOnlyList<GameTeamResult> Teams,
    string Summary);

public sealed record GameTeamResult(
    IReadOnlyList<string> UserIds,
    int Points,
    string Message,
    bool Winner);

public interface IGameEngine
{
    string GameId { get; }
    string ConfigId { get; }
    bool IsEnded { get; }
    int MinPlayers { get; }
    int MaxPlayers { get; }

    // Snapshot of state from `viewerUserId`'s perspective. The viewer only
    // sees their own hand; opponents are reduced to counts.
    GameView View(string viewerUserId);

    // Apply an action authored by `userId`. Returns null on success, a human
    // readable error string on rejection. Engine remains internally
    // consistent on rejection (no partial mutation).
    string? Apply(string userId, JsonElement action);

    // Called by the room when player set is finalised. Order is the seating order.
    void Start(IReadOnlyList<string> playerUserIds, int? randomSeed = null);

    // Final scoring — caller persists to the leaderboard.
    GameEndResult FinalResult();
}
