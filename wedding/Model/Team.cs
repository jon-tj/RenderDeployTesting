using System.ComponentModel.DataAnnotations;

namespace FamilyHub.Model;

// A "team" is a bag of users. For solo games (Uno) a team has 1 member;
// for partnered games (Buraco 4p) a team has 2. The same user can belong
// to many teams across different games / sessions.
public class Team
{
    public int Id { get; set; }

    [MaxLength(80)]
    public string Name { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public List<TeamMember> Members { get; set; } = new();
}

// Composite-keyed join row: which user belongs to which team.
public class TeamMember
{
    public int TeamId { get; set; }
    public Team? Team { get; set; }

    public string UserId { get; set; } = string.Empty;
    public AppUser? User { get; set; }
}
