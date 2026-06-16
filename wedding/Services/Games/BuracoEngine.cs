using System.Text.Json;

namespace FamilyHub.Services.Games;

// Server-authoritative Buraco — Brazilian flavor, deliberately simplified to
// keep this iteration shippable. Rules implemented:
//   - 2 standard decks + 4 jokers (108 cards)
//   - 11 cards dealt to each player; for 4p, teams of 2 are seated alternately
//   - 2 mortos of 11 cards (face-down). Each team picks up one when they go out
//   - Stock + a single discard ("lixo") pile, flipped from stock to start
//   - On your turn: draw 1 from stock OR take the *entire* lixo, then optionally
//     meld / lay off, then discard 1 (unless you went out exactly)
//   - Melds: 3+ same rank ("trinca") OR 3+ same-suit consecutive run ("sequência")
//   - Wilds: jokers only (rule simplification — 2s are not wild here). At most
//     one wild per meld. Wilds may not occupy the high end of a run if it caps at A
//   - Going out ("bater") requires (a) empty hand after discard AND (b) your
//     team has already used its morto AND (c) at least one canasta (7+ meld)
//   - Scoring per round (per team): melded cards' face values + 100 per canastra
//     limpa (no wild) + 50 per canastra suja + 100 if you went out − leftover card
//     values in any hand on your team
//
// Known omissions vs full ruleset: 2 is not wild, no "bater na mão" bonus, no
// canastra real (A through A) bonus, A-2-3 wraparound disallowed, no morto-vivo
// vs morto-morto distinction, no penalty for picking up morto without melding.
public sealed class BuracoEngine : IGameEngine
{
    public string GameId => "buraco";
    public string ConfigId { get; }
    public bool IsEnded { get; private set; }
    public int MinPlayers => _expectedPlayers;
    public int MaxPlayers => _expectedPlayers;

    readonly int _expectedPlayers;

    public BuracoEngine(string configId)
    {
        ConfigId = configId;
        _expectedPlayers = configId == "B" ? 4 : 2;
    }

    public enum Suit { Clubs, Diamonds, Hearts, Spades, Joker }

    public sealed record Card(Suit Suit, int Rank, int DeckId)
    {
        // Rank: 1=A, 2..10, 11=J, 12=Q, 13=K, 0=Joker
        public bool IsWild => Suit == Suit.Joker;
        public string Code => IsWild ? $"JK{DeckId}" : $"{Suit.ToString()[0]}{Rank}d{DeckId}";
        public int Points => Rank switch
        {
            0 => 30, // joker
            1 => 15, // ace
            >= 2 and <= 7 => 5,
            _ => 10,
        };
    }

    sealed class Meld
    {
        public bool IsRun;       // sequence in suit; otherwise same-rank set
        public Suit RunSuit;     // when IsRun
        public List<Card> Cards = new();
        public bool HasWild => Cards.Any(c => c.IsWild);
        public bool IsCanastra => Cards.Count >= 7;
        public int BaseValue => Cards.Sum(c => c.Points);
        public int Bonus => IsCanastra ? (HasWild ? 50 : 100) : 0;
    }

    readonly List<Card> _stock = new();
    readonly List<Card> _discard = new();
    readonly List<List<Card>> _hands = new();
    readonly List<List<Meld>> _melds = new(); // per team
    readonly List<List<Card>> _mortos = new(); // 0..1 piles
    readonly bool[] _teamUsedMorto = new bool[2];
    List<string> _players = new();
    int[] _playerTeam = Array.Empty<int>();
    int _turn;
    Random _rng = new();
    Phase _phase = Phase.Draw;
    int? _outTeam;

    enum Phase { Draw, MeldDiscard }

    public void Start(IReadOnlyList<string> playerUserIds, int? randomSeed = null)
    {
        if (playerUserIds.Count != _expectedPlayers)
            throw new ArgumentException($"Buraco config {ConfigId} needs exactly {_expectedPlayers} players");
        _rng = randomSeed is int s ? new Random(s) : new Random();
        _players = playerUserIds.ToList();
        // Teams: 2p -> [0,1]; 4p -> [0,1,0,1] (seats alternate)
        _playerTeam = _players.Count == 2
            ? new[] { 0, 1 }
            : new[] { 0, 1, 0, 1 };
        _hands.Clear(); for (int i = 0; i < _players.Count; i++) _hands.Add(new());
        _melds.Clear(); _melds.Add(new()); _melds.Add(new());
        _mortos.Clear();
        Array.Fill(_teamUsedMorto, false);
        _stock.Clear(); _discard.Clear();
        BuildDeck();
        Shuffle(_stock);
        for (int i = 0; i < 11; i++)
            for (int p = 0; p < _players.Count; p++) _hands[p].Add(Pop());
        // Build mortos: 2 piles of 11 in 4p, 2 piles of 11 in 2p too (each
        // team has its own).
        _mortos.Add(new(Take(11)));
        _mortos.Add(new(Take(11)));
        _discard.Add(Pop());
        _turn = 0;
        _phase = Phase.Draw;
        IsEnded = false;
        _outTeam = null;
    }

    void BuildDeck()
    {
        for (int d = 0; d < 2; d++)
            foreach (var s in new[] { Suit.Clubs, Suit.Diamonds, Suit.Hearts, Suit.Spades })
                for (int r = 1; r <= 13; r++) _stock.Add(new(s, r, d));
        for (int i = 0; i < 4; i++) _stock.Add(new(Suit.Joker, 0, i));
    }

    void Shuffle(List<Card> cards)
    {
        for (int i = cards.Count - 1; i > 0; i--)
        {
            int j = _rng.Next(i + 1);
            (cards[i], cards[j]) = (cards[j], cards[i]);
        }
    }

    Card Pop() { var c = _stock[^1]; _stock.RemoveAt(_stock.Count - 1); return c; }
    List<Card> Take(int n) { var l = new List<Card>(); for (int i = 0; i < n; i++) l.Add(Pop()); return l; }

    int TeamOf(int playerIdx) => _playerTeam[playerIdx];

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
            case "drawStock":
                if (_phase != Phase.Draw) return "Already drew";
                if (_stock.Count == 0) return "Stock is empty";
                _hands[idx].Add(Pop());
                _phase = Phase.MeldDiscard;
                return null;

            case "takeDiscard":
                if (_phase != Phase.Draw) return "Already drew";
                if (_discard.Count == 0) return "Discard is empty";
                _hands[idx].AddRange(_discard);
                _discard.Clear();
                _phase = Phase.MeldDiscard;
                return null;

            case "meld":
            {
                if (_phase != Phase.MeldDiscard) return "Draw first";
                if (!action.TryGetProperty("cards", out var arr) || arr.ValueKind != JsonValueKind.Array)
                    return "cards[] required";
                var codes = arr.EnumerateArray().Select(e => e.GetString() ?? "").ToList();
                var picked = TakeFromHand(idx, codes);
                if (picked is null) return "Cards not in your hand";
                var meld = ValidateNewMeld(picked);
                if (meld is null) { _hands[idx].AddRange(picked); return "Not a valid meld"; }
                _melds[TeamOf(idx)].Add(meld);
                return null;
            }

            case "layoff":
            {
                if (_phase != Phase.MeldDiscard) return "Draw first";
                if (!action.TryGetProperty("meldIndex", out var miEl)) return "meldIndex required";
                if (!action.TryGetProperty("cards", out var arr) || arr.ValueKind != JsonValueKind.Array)
                    return "cards[] required";
                int mi = miEl.GetInt32();
                var teamMelds = _melds[TeamOf(idx)];
                if (mi < 0 || mi >= teamMelds.Count) return "No such meld";
                var codes = arr.EnumerateArray().Select(e => e.GetString() ?? "").ToList();
                var picked = TakeFromHand(idx, codes);
                if (picked is null) return "Cards not in your hand";
                if (!TryLayoff(teamMelds[mi], picked))
                {
                    _hands[idx].AddRange(picked);
                    return "Cards don't extend that meld";
                }
                return null;
            }

            case "discard":
            {
                if (_phase != Phase.MeldDiscard) return "Draw first";
                if (!action.TryGetProperty("cardCode", out var cc)) return "cardCode required";
                var code = cc.GetString();
                var card = _hands[idx].FirstOrDefault(c => c.Code == code);
                if (card is null) return "You don't have that card";
                // Going out check: hand becomes empty after this discard
                bool wouldGoOut = _hands[idx].Count == 1;
                if (wouldGoOut)
                {
                    var team = TeamOf(idx);
                    if (!_teamUsedMorto[team])
                    {
                        // Pick up the team's morto instead of going out.
                        _hands[idx].Remove(card);
                        _discard.Add(card);
                        var morto = _mortos[team];
                        _hands[idx].AddRange(morto);
                        morto.Clear();
                        _teamUsedMorto[team] = true;
                        _phase = Phase.Draw; // they get a fresh turn flow? No — turn ends.
                        AdvanceTurn();
                        return null;
                    }
                    if (!HasCanastra(team)) return "You need at least one canastra (7+ meld) to go out";
                    // Bater
                    _hands[idx].Remove(card);
                    _discard.Add(card);
                    _outTeam = team;
                    IsEnded = true;
                    return null;
                }
                _hands[idx].Remove(card);
                _discard.Add(card);
                AdvanceTurn();
                return null;
            }

            default:
                return $"Unknown action '{type}'";
        }
    }

    bool HasCanastra(int team) => _melds[team].Any(m => m.IsCanastra);

    void AdvanceTurn()
    {
        _turn = (_turn + 1) % _players.Count;
        _phase = Phase.Draw;
    }

    List<Card>? TakeFromHand(int idx, List<string> codes)
    {
        var hand = _hands[idx];
        var picked = new List<Card>();
        foreach (var code in codes)
        {
            var c = hand.FirstOrDefault(x => x.Code == code && !picked.Contains(x));
            if (c is null) { return null; }
            picked.Add(c);
        }
        foreach (var c in picked) hand.Remove(c);
        return picked;
    }

    Meld? ValidateNewMeld(List<Card> cards)
    {
        if (cards.Count < 3) return null;
        int wilds = cards.Count(c => c.IsWild);
        if (wilds > 1) return null; // simplification: at most one wild
        var nonWild = cards.Where(c => !c.IsWild).ToList();
        // Try set
        if (nonWild.Select(c => c.Rank).Distinct().Count() == 1)
        {
            var rank = nonWild[0].Rank;
            if (rank != 0) return new Meld { IsRun = false, Cards = cards.ToList() };
        }
        // Try run
        if (nonWild.Select(c => c.Suit).Distinct().Count() == 1)
        {
            var suit = nonWild[0].Suit;
            var ranks = nonWild.Select(c => c.Rank).OrderBy(x => x).ToList();
            // Build a length-13 run frame; place non-wilds, then attempt to fit wild in one gap.
            var slots = new bool[15]; // 1..13 + buffer
            foreach (var r in ranks)
            {
                if (r == 0) return null;
                if (r < 1 || r > 13) return null;
                if (slots[r]) return null; // duplicate suit+rank in run not allowed
                slots[r] = true;
            }
            // Find min/max of placed cards
            int min = ranks.Min(), max = ranks.Max();
            int needed = max - min + 1; // slots between extremes
            int gaps = needed - nonWild.Count;
            if (gaps < 0) return null;
            if (gaps > wilds) return null;
            int extension = cards.Count - needed; // wild may extend past max (not below A)
            if (extension < 0) return null;
            if (extension > wilds - gaps) return null;
            // Wild can't push past K (rank 13)
            if (max + extension > 13) return null;
            return new Meld { IsRun = true, RunSuit = suit, Cards = cards.ToList() };
        }
        return null;
    }

    bool TryLayoff(Meld m, List<Card> add)
    {
        var combined = m.Cards.Concat(add).ToList();
        // Reuse new-meld validation, preserving meld kind.
        if (m.IsRun)
        {
            if (!combined.Where(c => !c.IsWild).All(c => c.Suit == m.RunSuit)) return false;
        }
        else
        {
            int rank = m.Cards.First(c => !c.IsWild).Rank;
            if (!combined.Where(c => !c.IsWild).All(c => c.Rank == rank)) return false;
        }
        var trial = ValidateNewMeld(combined);
        if (trial is null) return false;
        m.Cards.Clear(); m.Cards.AddRange(combined);
        return true;
    }

    public GameView View(string viewerUserId)
    {
        var idx = _players.IndexOf(viewerUserId);
        var payload = new
        {
            gameId = GameId,
            you = idx < 0 ? null : new
            {
                index = idx,
                team = TeamOf(idx),
                hand = _hands[idx].Select(c => new { code = c.Code, suit = c.Suit.ToString().ToLowerInvariant(), rank = c.Rank, isWild = c.IsWild, points = c.Points }).ToList(),
            },
            players = _players.Select((u, i) => new
            {
                userId = u,
                team = TeamOf(i),
                cards = _hands[i].Count,
                isTurn = i == _turn && !IsEnded,
            }).ToList(),
            teamMelds = _melds.Select((teamMelds, t) => new
            {
                team = t,
                usedMorto = _teamUsedMorto[t],
                melds = teamMelds.Select(m => new
                {
                    isRun = m.IsRun,
                    suit = m.IsRun ? m.RunSuit.ToString().ToLowerInvariant() : null,
                    cards = m.Cards.Select(c => new { code = c.Code, suit = c.Suit.ToString().ToLowerInvariant(), rank = c.Rank, isWild = c.IsWild }).ToList(),
                    isCanastra = m.IsCanastra,
                    hasWild = m.HasWild,
                }).ToList(),
            }).ToList(),
            mortos = _mortos.Select((m, t) => new { team = t, count = m.Count }).ToList(),
            discardTop = _discard.Count == 0 ? null : new[] { new { code = _discard[^1].Code, suit = _discard[^1].Suit.ToString().ToLowerInvariant(), rank = _discard[^1].Rank, isWild = _discard[^1].IsWild } },
            discardCount = _discard.Count,
            stockCount = _stock.Count,
            phase = _phase.ToString(),
            turn = _turn,
            ended = IsEnded,
            outTeam = _outTeam,
        };
        return new GameView(JsonSerializer.SerializeToElement(payload), IsEnded);
    }

    public GameEndResult FinalResult()
    {
        // Round-only scoring (no multi-round bookkeeping in this iteration).
        int[] team = new int[2];
        for (int t = 0; t < 2; t++)
        {
            foreach (var m in _melds[t]) team[t] += m.BaseValue + m.Bonus;
            if (_outTeam == t) team[t] += 100;
            // Subtract leftover hand cards for players on this team.
            for (int p = 0; p < _players.Count; p++)
                if (TeamOf(p) == t) team[t] -= _hands[p].Sum(c => c.Points);
            // If morto never used, big penalty (encourages picking up).
            if (!_teamUsedMorto[t]) team[t] -= 100;
        }
        var teams = new List<GameTeamResult>();
        for (int t = 0; t < 2; t++)
        {
            var members = _players.Where((_, i) => TeamOf(i) == t).ToList();
            teams.Add(new(members, team[t], $"Team {t + 1}: {team[t]} pts", _outTeam == t));
        }
        var summary = _outTeam is int ot
            ? $"Team {ot + 1} bateu. Final: T1 {team[0]} – T2 {team[1]}."
            : $"Round ended. T1 {team[0]} – T2 {team[1]}.";
        return new(teams, summary);
    }
}
