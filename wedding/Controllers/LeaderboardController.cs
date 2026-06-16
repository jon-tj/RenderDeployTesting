using FamilyHub.Data;
using FamilyHub.Model;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Controllers;

[ApiController, Route("api/leaderboard"), Authorize]
public class LeaderboardController(AppDbContext db, UserManager<AppUser> users) : ControllerBase
{
    // Aggregate view: total points per team per game (optionally filtered by
    // gameId and gameConfigsId). Used by the catalog/leaderboard page.
    [HttpGet, AllowAnonymous]
    public async Task<ActionResult<IEnumerable<LeaderboardRowDto>>> Get(
        [FromQuery] string? gameId,
        [FromQuery] string? configId,
        [FromQuery] int take = 50)
    {
        take = Math.Clamp(take, 1, 200);
        var q = db.TeamScores.AsQueryable();
        if (!string.IsNullOrWhiteSpace(gameId)) q = q.Where(s => s.GameId == gameId);
        if (!string.IsNullOrWhiteSpace(configId)) q = q.Where(s => s.GameConfigsId == configId);

        var rows = await q
            .GroupBy(s => new { s.TeamId, s.GameId, s.GameConfigsId })
            .Select(g => new
            {
                g.Key.TeamId,
                g.Key.GameId,
                g.Key.GameConfigsId,
                Total = g.Sum(x => x.PointsAchieved),
                Wins = g.Count(x => x.PointsAchieved > 0),
                Last = g.Max(x => x.CreatedAt),
            })
            .OrderByDescending(x => x.Total)
            .Take(take)
            .ToListAsync();

        var teamIds = rows.Select(r => r.TeamId).Distinct().ToList();
        var teams = await db.Teams
            .Where(t => teamIds.Contains(t.Id))
            .Include(t => t.Members).ThenInclude(m => m.User)
            .ToDictionaryAsync(t => t.Id);

        return rows.Select(r =>
        {
            teams.TryGetValue(r.TeamId, out var t);
            return new LeaderboardRowDto(
                r.TeamId,
                t?.Name ?? $"Team #{r.TeamId}",
                t?.Members.Select(m => new TeamMemberDto(m.UserId, m.User?.DisplayName ?? "")).ToList() ?? new(),
                r.GameId,
                r.GameConfigsId,
                r.Total,
                r.Wins,
                r.Last);
        }).ToList();
    }

    // Recent score events; useful for an activity feed under the leaderboard.
    [HttpGet("recent"), AllowAnonymous]
    public async Task<ActionResult<IEnumerable<ScoreDto>>> Recent([FromQuery] int take = 25)
    {
        take = Math.Clamp(take, 1, 100);
        var rows = await db.TeamScores
            .OrderByDescending(s => s.CreatedAt)
            .Take(take)
            .Include(s => s.Team).ThenInclude(t => t!.Members).ThenInclude(m => m.User)
            .ToListAsync();
        return rows.Select(ScoreDto.From).ToList();
    }

    // Manual score submission (e.g. table-top games not played in-engine).
    [HttpPost("scores")]
    public async Task<ActionResult<ScoreDto>> Submit([FromBody] SubmitScoreDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.GameId)) return BadRequest("gameId required");
        if (dto.Members is null || dto.Members.Count == 0) return BadRequest("members required");
        var configId = string.IsNullOrEmpty(dto.GameConfigsId) ? "" : dto.GameConfigsId[..1];
        if (configId.Length == 1 && GameConfigs.Get(configId[0]) is null) return BadRequest("unknown gameConfigsId");

        var meId = users.GetUserId(User);
        if (meId is null) return Unauthorized();
        // Caller must be one of the team members. Prevents drive-by score
        // posting for arbitrary users.
        if (!dto.Members.Contains(meId)) return Forbid();

        var team = await ResolveOrCreateTeamAsync(dto.Members, dto.TeamName);
        var score = new TeamScore
        {
            TeamId = team.Id,
            GameId = dto.GameId.Trim(),
            PointsAchieved = dto.PointsAchieved,
            Message = dto.Message?.Trim() ?? "",
            GameConfigsId = configId,
        };
        db.TeamScores.Add(score);
        await db.SaveChangesAsync();
        await db.Entry(score).Reference(s => s.Team).LoadAsync();
        if (score.Team is not null)
            await db.Entry(score.Team).Collection(t => t.Members).Query().Include(m => m.User).LoadAsync();
        return ScoreDto.From(score);
    }

    // Find a team that has *exactly* the given member set, or create one.
    // Internal — also used by the SignalR game engines when a match ends.
    internal async Task<Team> ResolveOrCreateTeamAsync(IEnumerable<string> userIds, string? name)
    {
        var ordered = userIds.Distinct().OrderBy(x => x, StringComparer.Ordinal).ToList();
        var candidates = await db.Teams
            .Where(t => t.Members.Count == ordered.Count)
            .Include(t => t.Members)
            .ToListAsync();
        var hit = candidates.FirstOrDefault(t =>
            t.Members.Select(m => m.UserId).OrderBy(x => x, StringComparer.Ordinal).SequenceEqual(ordered));
        if (hit is not null) return hit;

        var team = new Team
        {
            Name = string.IsNullOrWhiteSpace(name) ? string.Join(" + ", ordered.Select(_ => "?")) : name.Trim(),
            Members = ordered.Select(uid => new TeamMember { UserId = uid }).ToList(),
        };
        db.Teams.Add(team);
        await db.SaveChangesAsync();
        return team;
    }
}

public sealed record TeamMemberDto(string UserId, string DisplayName);

public sealed record LeaderboardRowDto(
    int TeamId,
    string TeamName,
    List<TeamMemberDto> Members,
    string GameId,
    string GameConfigsId,
    int TotalPoints,
    int Wins,
    DateTimeOffset LastPlayed);

public sealed record ScoreDto(
    int Id,
    int TeamId,
    string TeamName,
    List<TeamMemberDto> Members,
    string GameId,
    int PointsAchieved,
    string Message,
    string GameConfigsId,
    DateTimeOffset CreatedAt)
{
    public static ScoreDto From(TeamScore s) => new(
        s.Id,
        s.TeamId,
        s.Team?.Name ?? $"Team #{s.TeamId}",
        s.Team?.Members.Select(m => new TeamMemberDto(m.UserId, m.User?.DisplayName ?? "")).ToList() ?? new(),
        s.GameId,
        s.PointsAchieved,
        s.Message,
        s.GameConfigsId,
        s.CreatedAt);
}

public sealed class SubmitScoreDto
{
    public string GameId { get; set; } = "";
    public string GameConfigsId { get; set; } = "";
    public int PointsAchieved { get; set; }
    public string? Message { get; set; }
    public List<string> Members { get; set; } = new();
    public string? TeamName { get; set; }
}
