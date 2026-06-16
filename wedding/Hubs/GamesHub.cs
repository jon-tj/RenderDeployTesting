using System.Text.Json;
using FamilyHub.Controllers;
using FamilyHub.Data;
using FamilyHub.Model;
using FamilyHub.Services.Games;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace FamilyHub.Hubs;

[Authorize]
public class GamesHub(GameRoomManager rooms, AppDbContext db, UserManager<AppUser> users) : Hub
{
    static string Group(string code) => $"room:{code}";

    AppUser? _cachedMe;

    async Task<AppUser?> MeAsync()
    {
        if (_cachedMe is not null) return _cachedMe;
        var id = users.GetUserId(Context.User!);
        if (id is null) return null;
        return _cachedMe = await db.Users.FirstOrDefaultAsync(u => u.Id == id);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var room = rooms.RoomFor(Context.ConnectionId);
        rooms.Untrack(Context.ConnectionId);
        if (room is not null)
        {
            lock (room.Lock)
            {
                var p = room.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
                if (p is not null) p.ConnectionId = null;
                room.LastActivity = DateTimeOffset.UtcNow;
            }
            await Clients.Group(Group(room.Code)).SendAsync("RoomState", GameRoomManager.RoomStateJson(room));
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task<object> CreateRoom(string gameId, string configId)
    {
        var me = await MeAsync() ?? throw new HubException("Not signed in");
        if (configId.Length != 1 || GameConfigs.Get(configId[0]) is null)
            throw new HubException($"Unknown configId '{configId}'");
        var room = rooms.Create(gameId, configId, me.Id, me.DisplayName);
        room.Players[0].ConnectionId = Context.ConnectionId;
        rooms.Track(Context.ConnectionId, room.Code);
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(room.Code));
        var state = GameRoomManager.RoomStateJson(room);
        await Clients.Caller.SendAsync("RoomState", state);
        return new { code = room.Code };
    }

    public async Task JoinRoom(string code)
    {
        var me = await MeAsync() ?? throw new HubException("Not signed in");
        var room = rooms.Get(code) ?? throw new HubException("Room not found");
        lock (room.Lock)
        {
            var existing = room.Players.FirstOrDefault(p => p.UserId == me.Id);
            if (existing is null)
            {
                if (room.Status != RoomStatus.Lobby) throw new HubException("Game already started");
                if (room.Players.Count >= room.MaxPlayers) throw new HubException("Room is full");
                room.Players.Add(new GameRoomPlayer { UserId = me.Id, DisplayName = me.DisplayName, ConnectionId = Context.ConnectionId });
            }
            else
            {
                existing.ConnectionId = Context.ConnectionId;
                existing.DisplayName = me.DisplayName;
            }
            room.LastActivity = DateTimeOffset.UtcNow;
        }
        rooms.Track(Context.ConnectionId, room.Code);
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(room.Code));
        await Clients.Group(Group(room.Code)).SendAsync("RoomState", GameRoomManager.RoomStateJson(room));
        // If the game is in progress, push the rejoiner a private view.
        if (room.Status == RoomStatus.Playing && room.Engine is not null)
        {
            var view = room.Engine.View(me.Id);
            await Clients.Caller.SendAsync("GameView", view);
        }
    }

    public async Task LeaveRoom()
    {
        var room = rooms.RoomFor(Context.ConnectionId);
        if (room is null) return;
        rooms.Untrack(Context.ConnectionId);
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, Group(room.Code));
        bool removeRoom = false;
        lock (room.Lock)
        {
            var p = room.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
            if (p is not null)
            {
                if (room.Status == RoomStatus.Lobby) room.Players.Remove(p);
                else p.ConnectionId = null;
            }
            if (room.Players.Count == 0) removeRoom = true;
        }
        if (removeRoom) rooms.Remove(room.Code);
        else await Clients.Group(Group(room.Code)).SendAsync("RoomState", GameRoomManager.RoomStateJson(room));
    }

    public async Task StartGame()
    {
        var me = await MeAsync() ?? throw new HubException("Not signed in");
        var room = rooms.RoomFor(Context.ConnectionId) ?? throw new HubException("Not in a room");
        if (room.HostUserId != me.Id) throw new HubException("Only the host can start");
        if (room.Status != RoomStatus.Lobby) throw new HubException("Already started");
        if (room.Players.Count < room.MinPlayers)
            throw new HubException($"Need at least {room.MinPlayers} players");

        var engine = rooms.BuildEngine(room);
        engine.Start(room.Players.Select(p => p.UserId).ToList());
        room.Engine = engine;
        room.Status = RoomStatus.Playing;
        await Clients.Group(Group(room.Code)).SendAsync("RoomState", GameRoomManager.RoomStateJson(room));
        await BroadcastViewsAsync(room);
    }

    public async Task Action(JsonElement action)
    {
        var me = await MeAsync() ?? throw new HubException("Not signed in");
        var room = rooms.RoomFor(Context.ConnectionId) ?? throw new HubException("Not in a room");
        if (room.Engine is null || room.Status != RoomStatus.Playing) throw new HubException("Game not running");

        string? err;
        lock (room.Lock) { err = room.Engine.Apply(me.Id, action); }
        if (err is not null) { await Clients.Caller.SendAsync("Error", err); return; }

        await BroadcastViewsAsync(room);

        if (room.Engine.IsEnded)
        {
            room.Status = RoomStatus.Ended;
            var result = room.Engine.FinalResult();
            await PersistResultAsync(room, result);
            await Clients.Group(Group(room.Code)).SendAsync("GameEnded", result);
            await Clients.Group(Group(room.Code)).SendAsync("RoomState", GameRoomManager.RoomStateJson(room));
        }
    }

    public async Task SendChat(string text)
    {
        var me = await MeAsync() ?? throw new HubException("Not signed in");
        var room = rooms.RoomFor(Context.ConnectionId) ?? throw new HubException("Not in a room");
        text = (text ?? "").Trim();
        if (text.Length == 0 || text.Length > 280) return;
        await Clients.Group(Group(room.Code)).SendAsync("Chat", new
        {
            from = me.Id,
            name = me.DisplayName,
            text,
            at = DateTimeOffset.UtcNow,
        });
    }

    async Task BroadcastViewsAsync(GameRoom room)
    {
        if (room.Engine is null) return;
        foreach (var p in room.Players)
        {
            if (p.ConnectionId is null) continue;
            var view = room.Engine.View(p.UserId);
            await Clients.Client(p.ConnectionId).SendAsync("GameView", view);
        }
    }

    async Task PersistResultAsync(GameRoom room, GameEndResult result)
    {
        // Write a TeamScore row per team in the result. Resolve / create the
        // canonical Team row by member-set so leaderboard aggregates roll up.
        var lb = new LeaderboardController(db, users);
        foreach (var t in result.Teams)
        {
            if (t.UserIds.Count == 0) continue;
            var team = await lb.ResolveOrCreateTeamAsync(t.UserIds, NameFor(room, t.UserIds));
            db.TeamScores.Add(new TeamScore
            {
                TeamId = team.Id,
                GameId = room.GameId,
                PointsAchieved = t.Points,
                Message = t.Message,
                GameConfigsId = room.ConfigId,
            });
        }
        await db.SaveChangesAsync();
    }

    string NameFor(GameRoom room, IReadOnlyList<string> userIds)
    {
        var names = userIds.Select(id =>
            room.Players.FirstOrDefault(p => p.UserId == id)?.DisplayName ?? "?");
        return string.Join(" + ", names);
    }
}
