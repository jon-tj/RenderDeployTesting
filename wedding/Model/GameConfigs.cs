namespace FamilyHub.Model;

// Static catalog of "game configurations". A single char keys into a
// string->string dictionary describing a flavor of a game (variant, player
// count, score target). Stored on TeamScore so the leaderboard can be
// filtered/segmented by ruleset.
public static class GameConfigs
{
    public static readonly IReadOnlyDictionary<char, IReadOnlyDictionary<string, string>> All =
        new Dictionary<char, IReadOnlyDictionary<string, string>>
        {
            ['u'] = Ro(new()
            {
                ["gameId"] = "uno",
                ["variant"] = "classic",
                ["minPlayers"] = "2",
                ["maxPlayers"] = "4",
                ["target"] = "500",
                ["label"] = "Uno — Classic",
            }),
            ['b'] = Ro(new()
            {
                ["gameId"] = "buraco",
                ["variant"] = "brazilian",
                ["players"] = "2",
                ["target"] = "3000",
                ["label"] = "Buraco — 2 players",
            }),
            ['B'] = Ro(new()
            {
                ["gameId"] = "buraco",
                ["variant"] = "brazilian",
                ["players"] = "4",
                ["target"] = "3000",
                ["label"] = "Buraco — 4 players (teams of 2)",
            }),
        };

    public static IReadOnlyDictionary<string, string>? Get(char id) =>
        All.TryGetValue(id, out var v) ? v : null;

    public static char DefaultFor(string gameId) => gameId switch
    {
        "uno" => 'u',
        "buraco" => 'b',
        _ => '\0',
    };

    static IReadOnlyDictionary<string, string> Ro(Dictionary<string, string> d) => d;
}
