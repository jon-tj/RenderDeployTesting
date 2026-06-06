using Microsoft.AspNetCore.Mvc;
using wedding.Data;
using wedding.Model;

namespace wedding.Controllers;

[ApiController]
[Route("api")]
public sealed class EventsController : ControllerBase
{
    [HttpPost("event/rsvp")]
    public ActionResult SaveRsvp([FromBody] RsvpRequest request, [FromServices] JsonDatabase database)
    {
        if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.Status))
        {
            return BadRequest(false);
        }

        var user = database.Users.FirstOrDefault(u =>
            string.Equals(u.FullName, request.FullName.Trim(), StringComparison.OrdinalIgnoreCase));

        if (user is null)
        {
            return NotFound(false);
        }

        if (string.IsNullOrWhiteSpace(request.EventPlace))
        {
            return BadRequest(false);
        }

        var weddingEvent = database.Events.FirstOrDefault(e =>
            string.Equals(e.Place, request.EventPlace.Trim(), StringComparison.OrdinalIgnoreCase));

        if (weddingEvent is null)
        {
            return NotFound(false);
        }

        var key = weddingEvent.Place;
        if (!user.EventChoices.TryGetValue(key, out var choice))
        {
            choice = new GuestEventChoice();
            user.EventChoices[key] = choice;
        }
        choice.Rsvp = request.Status.Trim();
        database.Commit();

        return Ok(ToEventResponses(database.Events, database.Users));
    }

    [HttpPost("calendar/added")]
    public ActionResult<bool> SetCalendarAdded([FromBody] CalendarAddedRequest request, [FromServices] JsonDatabase database)
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

        if (user.AddedToCalendar != request.Added)
        {
            user.AddedToCalendar = request.Added;
            database.Commit();
        }

        return Ok(true);
    }

    [HttpPost("user/allergies")]
    public ActionResult<List<string>> SaveAllergies(
        [FromBody] AllergiesRequest request,
        [FromServices] JsonDatabase database)
    {
        if (string.IsNullOrWhiteSpace(request.FullName))
        {
            return BadRequest();
        }

        var user = database.Users.FirstOrDefault(u =>
            string.Equals(u.FullName, request.FullName.Trim(), StringComparison.OrdinalIgnoreCase));

        if (user is null)
        {
            return NotFound();
        }

        var cleaned = (request.Allergies ?? new List<string>())
            .Select(a => a?.Trim() ?? string.Empty)
            .Where(a => !string.IsNullOrWhiteSpace(a))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        user.Allergies = cleaned;
        database.Commit();

        return Ok(user.Allergies);
    }

    [HttpPost("user/event-choice")]
    public ActionResult<GuestEventChoice> SetEventChoice(
        [FromBody] EventChoiceRequest request,
        [FromServices] JsonDatabase database)
    {
        if (string.IsNullOrWhiteSpace(request.FullName) || string.IsNullOrWhiteSpace(request.EventPlace))
        {
            return BadRequest();
        }

        var user = database.Users.FirstOrDefault(u =>
            string.Equals(u.FullName, request.FullName.Trim(), StringComparison.OrdinalIgnoreCase));

        if (user is null)
        {
            return NotFound();
        }

        var weddingEvent = database.Events.FirstOrDefault(e =>
            string.Equals(e.Place, request.EventPlace.Trim(), StringComparison.OrdinalIgnoreCase));

        if (weddingEvent is null)
        {
            return NotFound();
        }

        var key = weddingEvent.Place;
        if (!user.EventChoices.TryGetValue(key, out var existing))
        {
            existing = new GuestEventChoice();
            user.EventChoices[key] = existing;
        }

        if (request.Meal is not null)
        {
            existing.Meal = request.Meal.Trim();
        }
        if (request.Drink is not null)
        {
            existing.Drink = request.Drink.Trim();
        }

        database.Commit();

        return Ok(existing);
    }

    [HttpGet("admin/event-allergies")]
    public ActionResult<EventAllergyReport> GetEventAllergyReport(
        [FromQuery] string adminFullName,
        [FromQuery] string eventPlace,
        [FromServices] JsonDatabase database)
    {
        if (string.IsNullOrWhiteSpace(adminFullName) || string.IsNullOrWhiteSpace(eventPlace))
        {
            return BadRequest();
        }

        var admin = database.Users.FirstOrDefault(u =>
            string.Equals(u.FullName, adminFullName.Trim(), StringComparison.OrdinalIgnoreCase));

        if (admin is null || !admin.Admin)
        {
            return Forbid();
        }

        var weddingEvent = database.Events.FirstOrDefault(e =>
            string.Equals(e.Place, eventPlace.Trim(), StringComparison.OrdinalIgnoreCase));

        if (weddingEvent is null)
        {
            return NotFound();
        }

        // Attending = anyone whose RSVP is "yes" or "maybe".
        var attendingUsers = database.Users
            .Where(u =>
            {
                if (!u.EventChoices.TryGetValue(weddingEvent.Place, out var c)) return false;
                var status = c.Rsvp;
                return string.Equals(status, "yes", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(status, "maybe", StringComparison.OrdinalIgnoreCase);
            })
            .ToList();

        var mealOptions = ResolveMealOptions(weddingEvent);
        var drinkOptions = DrinkOptions;
        var defaultMealKey = mealOptions[0].Type;
        var defaultDrink = drinkOptions[0];

        string DisplayMealName(string key)
        {
            var match = mealOptions.FirstOrDefault(m =>
                string.Equals(m.Type, key, StringComparison.OrdinalIgnoreCase));
            if (match is not null && !string.IsNullOrWhiteSpace(match.Name))
            {
                return match.Name;
            }
            return key;
        }

        var groups = attendingUsers
            .Select(u =>
            {
                u.EventChoices.TryGetValue(weddingEvent.Place, out var choice);
                var rawMeal = choice?.Meal?.Trim() ?? string.Empty;
                var mealKey = string.IsNullOrWhiteSpace(rawMeal) ? defaultMealKey : rawMeal;
                var allergies = (u.Allergies ?? new List<string>())
                    .Select(a => a.Trim())
                    .Where(a => !string.IsNullOrWhiteSpace(a))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(a => a, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                return new { User = u, MealKey = mealKey, Allergies = allergies };
            })
            .GroupBy(x => new
            {
                Meal = x.MealKey.ToLowerInvariant(),
                AllergyKey = string.Join("|", x.Allergies.Select(a => a.ToLowerInvariant()))
            })
            .Select(g =>
            {
                var sample = g.First();
                return new MealAllergyGroup(
                    DisplayMealName(sample.MealKey),
                    sample.Allergies,
                    g.Count(),
                    g.Select(x => x.User.FullName).OrderBy(n => n).ToList());
            })
            .OrderBy(g => g.Meal, StringComparer.OrdinalIgnoreCase)
            .ThenByDescending(g => g.Count)
            .ThenBy(g => string.Join(",", g.Allergies))
            .ToList();

        List<OptionCount> CountOptions(List<string> options, string defaultValue, Func<GuestEventChoice, string> selector)
        {
            var counts = options.ToDictionary(o => o, _ => 0, StringComparer.OrdinalIgnoreCase);
            foreach (var u in attendingUsers)
            {
                u.EventChoices.TryGetValue(weddingEvent.Place, out var choice);
                var raw = choice is null ? string.Empty : selector(choice);
                var value = string.IsNullOrWhiteSpace(raw) ? defaultValue : raw;
                if (counts.ContainsKey(value))
                {
                    counts[value]++;
                }
                else
                {
                    counts[value] = 1;
                }
            }
            return counts.Select(kv => new OptionCount(kv.Key, kv.Value)).ToList();
        }

        var drinkCounts = CountOptions(drinkOptions, defaultDrink, c => c.Drink);

        return Ok(new EventAllergyReport(
            weddingEvent.Place,
            attendingUsers.Count,
            groups,
            drinkCounts));
    }

    private static readonly List<MealOption> DefaultMealOptions = new()
    {
        new MealOption { Type = "meat", Name = "Meat", Price = 0m },
        new MealOption { Type = "fish", Name = "Fish", Price = 0m },
        new MealOption { Type = "salad", Name = "Salad", Price = 0m },
    };
    internal static readonly List<string> DrinkOptions = new() { "water", "soda", "alcohol" };

    internal static List<MealOption> ResolveMealOptions(WeddingEvent weddingEvent)
        => weddingEvent.MealOptions is { Count: > 0 } m ? m : DefaultMealOptions;

    internal static Dictionary<string, string> BuildRsvpMap(List<User> users, string place)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var u in users)
        {
            if (u.EventChoices.TryGetValue(place, out var c) && !string.IsNullOrWhiteSpace(c.Rsvp))
            {
                map[u.FullName] = c.Rsvp;
            }
        }
        return map;
    }

    internal static List<EventsItemResponse> ToEventResponses(List<WeddingEvent> weddingEvents, List<User> users)
    {
        return weddingEvents
            .Select(weddingEvent => new EventsItemResponse(
                weddingEvent.Place,
                weddingEvent.VenueName,
                weddingEvent.MapQuery,
                weddingEvent.Time,
                weddingEvent.DressCode,
                weddingEvent.Currency,
                ResolveMealOptions(weddingEvent),
                BuildRsvpMap(users, weddingEvent.Place)))
            .ToList();
    }
}

public sealed record RsvpRequest(string FullName, string EventPlace, string Status);
public sealed record CalendarAddedRequest(string FullName, bool Added);
public sealed record AllergiesRequest(string FullName, List<string> Allergies);
public sealed record EventChoiceRequest(string FullName, string EventPlace, string? Meal, string? Drink);
public sealed record EventsItemResponse(
    string Place,
    string VenueName,
    string MapQuery,
    DateTimeOffset Time,
    string DressCode,
    string Currency,
    List<MealOption> MealOptions,
    Dictionary<string, string> Rsvp);
public sealed record AllergyGroup(List<string> Allergies, int Count, List<string> Guests);
public sealed record MealAllergyGroup(string Meal, List<string> Allergies, int Count, List<string> Guests);
public sealed record OptionCount(string Option, int Count);
public sealed record EventAllergyReport(
    string Place,
    int TotalAttending,
    List<MealAllergyGroup> Groups,
    List<OptionCount> DrinkCounts);
