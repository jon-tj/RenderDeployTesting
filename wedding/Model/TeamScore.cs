using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Model;

// One row per scoring event a team produced in a game. The leaderboard is
// derived by summing/aggregating TeamScore rows. GameConfigsId is a single
// char that maps into the static GameConfigs catalog (string->string dict).
public class TeamScore
{
    public int Id { get; set; }

    public int TeamId { get; set; }
    public Team? Team { get; set; }

    [MaxLength(40)]
    public string GameId { get; set; } = string.Empty; // "uno" | "buraco"

    public int PointsAchieved { get; set; }

    [MaxLength(280)]
    public string Message { get; set; } = string.Empty;

    // Single-character key into GameConfigs.All. Persisted as a string for
    // EF/SQLite friendliness; constrained to length 1 in code.
    [MaxLength(1)]
    public string GameConfigsId { get; set; } = "";

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
