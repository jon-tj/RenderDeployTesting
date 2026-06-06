using Microsoft.AspNetCore.Mvc;
using wedding.Data;
using wedding.Model;
using wedding.Services;

namespace wedding.Controllers;

[ApiController]
[Route("api")]
public sealed class AnnouncementsController : ControllerBase
{
    [HttpGet("announcements")]
    public ActionResult GetAnnouncements([FromServices] JsonDatabase database)
    {
        return Ok(ToAnnouncementResponses(database.Announcements));
    }

    [HttpPost("announcements")]
    public async Task<ActionResult> CreateAnnouncement(
        [FromBody] CreateAnnouncementRequest request,
        [FromServices] JsonDatabase database,
        [FromServices] EmailService emailService)
    {
        if (string.IsNullOrWhiteSpace(request.AdminFullName)
            || string.IsNullOrWhiteSpace(request.Title)
            || string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(false);
        }

        var admin = database.Users.FirstOrDefault(u =>
            string.Equals(u.FullName, request.AdminFullName.Trim(), StringComparison.OrdinalIgnoreCase));

        if (admin is null || !admin.Admin)
        {
            return Forbid();
        }

        var nextId = database.Announcements.Count == 0
            ? 1
            : database.Announcements.Max(a => a.Id) + 1;

        var announcement = new Announcement
        {
            Id = nextId,
            Title = request.Title.Trim(),
            Message = request.Message.Trim(),
            CreatedAt = DateTimeOffset.UtcNow,
            CreatedBy = admin.DisplayName
        };

        database.Announcements.Add(announcement);
        admin.LastAnnouncementSeen = announcement.Id;
        database.Commit();

        await emailService.SendAnnouncementAsync(announcement, database.Users);

        return Ok(ToAnnouncementResponses(database.Announcements));
    }

    [HttpPost("announcements/seen")]
    public ActionResult<bool> MarkSeen([FromBody] SeenAnnouncementRequest request, [FromServices] JsonDatabase database)
    {
        if (string.IsNullOrWhiteSpace(request.FullName))
        {
            return BadRequest(false);
        }

        var user = database.Users.FirstOrDefault(u =>
            string.Equals(u.FullName, request.FullName.Trim(), StringComparison.OrdinalIgnoreCase));

        if (user is null)
        {
            return NotFound(false);
        }

        var seenId = request.AnnouncementId > 0
            ? request.AnnouncementId
            : (database.Announcements.Count == 0 ? -1 : database.Announcements.Max(a => a.Id));

        if (user.LastAnnouncementSeen < seenId)
        {
            user.LastAnnouncementSeen = seenId;
            database.Commit();
        }

        return Ok(true);
    }

    private static List<AnnouncementsItemResponse> ToAnnouncementResponses(List<Announcement> announcements)
    {
        return announcements
            .OrderByDescending(a => a.Id)
            .Select(a => new AnnouncementsItemResponse(a.Id, a.Title, a.Message, a.CreatedAt, a.CreatedBy))
            .ToList();
    }
}

public sealed record CreateAnnouncementRequest(string AdminFullName, string Title, string Message);
public sealed record SeenAnnouncementRequest(string FullName, int AnnouncementId);
public sealed record AnnouncementsItemResponse(int Id, string Title, string Message, DateTimeOffset CreatedAt, string CreatedBy);
