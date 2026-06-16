using FamilyHub.Model;
using Microsoft.AspNetCore.Mvc;

namespace FamilyHub.Controllers;

[ApiController, Route("api/games")]
public class GamesController : ControllerBase
{
    // Static catalog used by the games page. Order matters — dictates the
    // catalog tile order on the frontend.
    static readonly GameCatalogEntry[] Catalog =
    [
        new("uno", "Uno",
            "The classic shedding game. First to 500 wins.",
            "casino", new[] { 'u' }),
        new("buraco", "Buraco",
            "Brazilian rummy with melds, jokers and the 'morto' pile.",
            "style", new[] { 'b', 'B' }),
    ];

    [HttpGet]
    public ActionResult<IEnumerable<GameCatalogDto>> List() =>
        Catalog.Select(c => new GameCatalogDto(
            c.Id, c.Title, c.Description, c.Icon,
            c.ConfigIds.Select(id => new GameConfigDto(
                id.ToString(),
                GameConfigs.Get(id) ?? new Dictionary<string, string>()
            )).ToList()
        )).ToList();

    [HttpGet("{gameId}")]
    public ActionResult<GameCatalogDto> Get(string gameId)
    {
        var c = Catalog.FirstOrDefault(x => x.Id == gameId);
        if (c is null) return NotFound();
        return new GameCatalogDto(
            c.Id, c.Title, c.Description, c.Icon,
            c.ConfigIds.Select(id => new GameConfigDto(
                id.ToString(),
                GameConfigs.Get(id) ?? new Dictionary<string, string>()
            )).ToList());
    }

    record GameCatalogEntry(string Id, string Title, string Description, string Icon, char[] ConfigIds);
}

public sealed record GameCatalogDto(string Id, string Title, string Description, string Icon, List<GameConfigDto> Configs);
public sealed record GameConfigDto(string Id, IReadOnlyDictionary<string, string> Options);
