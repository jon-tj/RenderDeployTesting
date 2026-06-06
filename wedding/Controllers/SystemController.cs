using Microsoft.AspNetCore.Mvc;
using wedding.Data;
using wedding.Model;

namespace wedding.Controllers;

[ApiController]
[Route("api")]
public sealed class SystemController : ControllerBase
{
    [HttpGet("currentVersion")]
    public ActionResult<int> GetCurrentVersion([FromServices] JsonDatabase database)
    {
        return Ok(database.CurrentVersion);
    }

    [HttpGet("event")]
    public ActionResult GetEvent([FromServices] JsonDatabase database)
    {
        return Ok(ToEventResponses(database.Events, database.Users));
    }

    [HttpGet("events")]
    public ActionResult GetEvents([FromServices] JsonDatabase database)
    {
        return Ok(ToEventResponses(database.Events, database.Users));
    }

    private static List<SystemEventResponse> ToEventResponses(List<WeddingEvent> weddingEvents, List<User> users)
    {
        return weddingEvents
            .Select(weddingEvent => new SystemEventResponse(
                weddingEvent.Place,
                weddingEvent.VenueName,
                weddingEvent.MapQuery,
                weddingEvent.Time,
                EventsController.BuildRsvpMap(users, weddingEvent.Place)))
            .ToList();
    }
}

public sealed record SystemEventResponse(string Place, string VenueName, string MapQuery, DateTimeOffset Time, Dictionary<string, string> Rsvp);
