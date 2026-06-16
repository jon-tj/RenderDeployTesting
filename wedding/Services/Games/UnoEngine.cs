using System.Text.Json;

namespace FamilyHub.Services.Games;

// Server-authoritative Uno. Standard 108-card deck:
//   - 4 colors (R/Y/G/B): one 0, two each of 1..9, two each of Skip/Reverse/Draw2
//   - 4 Wild and 4 Wild Draw Four
// Rules implemented:
//   - 7 cards dealt to each player; first non-wild card flipped as discard
//   - Stacking is OFF (a Draw Two cannot be countered with another Draw Two)
//   - Playing on top requires same color OR same number/symbol; Wild always plays
//   - Wild Draw Four legality is not checked (the bluff rule is omitted)
//   - "Uno" callout is implicit — no penalty for forgetting (kept simple)
//   - First player to empty their hand wins; round score = sum of opponents' cards
public sealed class UnoEngine : IGameEngine
{
    public string GameId => "uno";
    public string ConfigId { get; }
    public bool IsEnded { get; private set; }
    public int MinPlayers => 2;
    public int MaxPlayers => 4;

    public UnoEngine(string configId) { ConfigId = configId; }

    enum Color { Red, Yellow, Green, Blue, Wild }
    enum Kind { Number, Skip, Reverse, Draw2, Wild, WildDraw4 }

    sealed record Card(Color Color, Kind Kind, int Number)
    {
        public string Code => Color.ToString().ToLowerInvariant()[..1] + Kind switch
        {
            Kind.Number => Number.ToString(),
            Kind.Skip => "S",
            Kind.Reverse => "R",
            Kind.Draw2 => "D2",
            Kind.Wild => "W",
            Kind.WildDraw4 => "WD4",
            _ => "?"
        };
        public int Points => Kind switch
        {
            Kind.Number => Number,
            Kind.Wild or Kind.WildDraw4 => 50,
            _ => 20,
        };
    }

    readonly List<Card> _draw = new();
    readonly List<Card> _discard = new();
    readonly List<List<Card>> _hands = new();
    List<string> _players = new();
    int _turn;
    int _direction = 1;
    Color _activeColor;
    Random _rng = new();
    int? _winnerIndex;

    public void Start(IReadOnlyList<string> playerUserIds, int? randomSeed = null)
    {
        if (playerUserIds.Count is < 2 or > 4) throw new ArgumentException("Uno needs 2-4 players");
        _rng = randomSeed is int s ? new Random(s) : new Random();
        _players = playerUserIds.ToList();
        _hands.Clear(); for (int i = 0; i < _players.Count; i++) _hands.Add(new());
        _draw.Clear(); _discard.Clear();
        BuildDeck();
        Shuffle(_draw);
        for (int i = 0; i < 7; i++)
            for (int p = 0; p < _players.Count; p++) _hands[p].Add(Pop());
        // Flip the starter; if it's a Wild Draw 4, bury and try again.
        Card starter;
        do { starter = Pop(); _draw.Insert(0, starter); _draw.Remove(starter); }
        while (starter.Kind == Kind.WildDraw4 && _draw.Count > 0);
        _discard.Add(starter);
        _activeColor = starter.Color == Color.Wild ? Color.Red : starter.Color;
        _turn = 0;
        IsEnded = false;
        _winnerIndex = null;
        // Apply starter side effects affecting the very first turn.
        ApplyStarterEffect(starter);
    }

    void BuildDeck()
    {
        foreach (var c in new[] { Color.Red, Color.Yellow, Color.Green, Color.Blue })
        {
            _draw.Add(new(c, Kind.Number, 0));
            for (int n = 1; n <= 9; n++) { _draw.Add(new(c, Kind.Number, n)); _draw.Add(new(c, Kind.Number, n)); }
            for (int i = 0; i < 2; i++)
            {
                _draw.Add(new(c, Kind.Skip, -1));
                _draw.Add(new(c, Kind.Reverse, -1));
                _draw.Add(new(c, Kind.Draw2, -1));
            }
        }
        for (int i = 0; i < 4; i++) { _draw.Add(new(Color.Wild, Kind.Wild, -1)); _draw.Add(new(Color.Wild, Kind.WildDraw4, -1)); }
    }

    void Shuffle(List<Card> cards)
    {
        for (int i = cards.Count - 1; i > 0; i--)
        {
            int j = _rng.Next(i + 1);
            (cards[i], cards[j]) = (cards[j], cards[i]);
        }
    }

    Card Pop()
    {
        if (_draw.Count == 0)
        {
            if (_discard.Count <= 1) throw new InvalidOperationException("No cards left to draw");
            var top = _discard[^1];
            _draw.AddRange(_discard.Take(_discard.Count - 1));
            _discard.Clear();
            _discard.Add(top);
            Shuffle(_draw);
        }
        var c = _draw[^1]; _draw.RemoveAt(_draw.Count - 1); return c;
    }

    void ApplyStarterEffect(Card starter)
    {
        switch (starter.Kind)
        {
            case Kind.Skip: Advance(); break;
            case Kind.Reverse: _direction = -_direction; if (_players.Count == 2) Advance(); break;
            case Kind.Draw2:
                for (int i = 0; i < 2; i++) _hands[NextIndex()].Add(Pop());
                Advance();
                break;
            case Kind.Wild:
                // Player to the dealer's left (turn = 0) chooses; we let them on first action.
                break;
        }
    }

    int NextIndex(int delta = 1) => Mod(_turn + _direction * delta, _players.Count);
    void Advance(int delta = 1) => _turn = NextIndex(delta);
    static int Mod(int a, int n) => ((a % n) + n) % n;

    public string? Apply(string userId, JsonElement action)
    {
        if (IsEnded) return "Game is already over";
        var idx = _players.IndexOf(userId);
        if (idx < 0) return "Not a player in this game";
        if (idx != _turn) return "Not your turn";
        if (!action.TryGetProperty("type", out var typeEl)) return "Missing action type";
        var type = typeEl.GetString();

        switch (type)
        {
            case "play":
            {
                if (!action.TryGetProperty("cardCode", out var ccEl)) return "Missing cardCode";
                var code = ccEl.GetString() ?? "";
                var card = _hands[idx].FirstOrDefault(c => c.Code == code);
                if (card is null) return "You don't have that card";
                if (!CanPlay(card)) return "That card can't be played right now";
                Color? choose = null;
                if (card.Color == Color.Wild)
                {
                    if (!action.TryGetProperty("chosenColor", out var col)) return "Wilds need chosenColor";
                    choose = ParseColor(col.GetString());
                    if (choose is null or Color.Wild) return "Invalid color choice";
                }
                _hands[idx].Remove(card);
                _discard.Add(card);
                _activeColor = choose ?? card.Color;
                if (_hands[idx].Count == 0) { _winnerIndex = idx; IsEnded = true; return null; }
                ApplyEffect(card);
                return null;
            }
            case "draw":
            {
                _hands[idx].Add(Pop());
                Advance();
                return null;
            }
            default:
                return $"Unknown action '{type}'";
        }
    }

    bool CanPlay(Card c)
    {
        if (c.Color == Color.Wild) return true;
        var top = _discard[^1];
        if (c.Color == _activeColor) return true;
        if (c.Kind == top.Kind && c.Kind != Kind.Number) return true;
        if (c.Kind == Kind.Number && top.Kind == Kind.Number && c.Number == top.Number) return true;
        return false;
    }

    void ApplyEffect(Card card)
    {
        switch (card.Kind)
        {
            case Kind.Skip: Advance(2); break;
            case Kind.Reverse:
                _direction = -_direction;
                if (_players.Count == 2) Advance(0); // same player goes again
                else Advance();
                break;
            case Kind.Draw2:
                for (int i = 0; i < 2; i++) _hands[NextIndex()].Add(Pop());
                Advance(2);
                break;
            case Kind.WildDraw4:
                for (int i = 0; i < 4; i++) _hands[NextIndex()].Add(Pop());
                Advance(2);
                break;
            default: Advance(); break;
        }
    }

    static Color? ParseColor(string? s) => s?.ToLowerInvariant() switch
    {
        "red" => Color.Red, "yellow" => Color.Yellow,
        "green" => Color.Green, "blue" => Color.Blue,
        _ => null
    };

    public GameView View(string viewerUserId)
    {
        var idx = _players.IndexOf(viewerUserId);
        var top = _discard.Count > 0 ? _discard[^1] : null;
        var payload = new
        {
            gameId = GameId,
            you = idx < 0 ? null : new
            {
                index = idx,
                hand = _hands[idx].Select(c => new { code = c.Code, color = c.Color.ToString().ToLowerInvariant(), kind = c.Kind.ToString().ToLowerInvariant(), number = c.Number }).ToList(),
            },
            players = _players.Select((u, i) => new
            {
                userId = u,
                cards = _hands[i].Count,
                isTurn = i == _turn && !IsEnded,
            }).ToList(),
            turn = _turn,
            direction = _direction,
            activeColor = _activeColor.ToString().ToLowerInvariant(),
            top = top is null ? null : new { code = top.Code, color = top.Color.ToString().ToLowerInvariant(), kind = top.Kind.ToString().ToLowerInvariant(), number = top.Number },
            drawCount = _draw.Count,
            ended = IsEnded,
            winner = _winnerIndex,
        };
        return new GameView(JsonSerializer.SerializeToElement(payload), IsEnded);
    }

    public GameEndResult FinalResult()
    {
        if (_winnerIndex is null) return new(Array.Empty<GameTeamResult>(), "No winner.");
        int losersTotal = 0;
        for (int i = 0; i < _hands.Count; i++)
            if (i != _winnerIndex) losersTotal += _hands[i].Sum(c => c.Points);
        var winnerId = _players[_winnerIndex.Value];
        var teams = new List<GameTeamResult>
        {
            new(new[] { winnerId }, losersTotal, $"Won the round (+{losersTotal})", true),
        };
        for (int i = 0; i < _players.Count; i++)
            if (i != _winnerIndex)
                teams.Add(new(new[] { _players[i] }, 0, $"Held {_hands[i].Sum(c => c.Points)} pts", false));
        return new(teams, $"{winnerId} went out for {losersTotal}.");
    }
}
