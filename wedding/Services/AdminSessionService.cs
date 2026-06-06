using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace wedding.Services;

public sealed class AdminSessionService
{
    private static readonly TimeSpan DefaultLifetime = TimeSpan.FromDays(30);

    private readonly ConcurrentDictionary<string, Session> _sessions = new(StringComparer.Ordinal);

    public string IssueToken(string fullName, string email)
    {
        CleanupExpired();

        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        _sessions[token] = new Session(
            fullName.Trim(),
            email.Trim(),
            DateTimeOffset.UtcNow.Add(DefaultLifetime));
        return token;
    }

    public bool TryResolve(string token, out string fullName, out string email)
    {
        CleanupExpired();

        if (string.IsNullOrWhiteSpace(token)
            || !_sessions.TryGetValue(token.Trim(), out var session))
        {
            fullName = string.Empty;
            email = string.Empty;
            return false;
        }

        fullName = session.FullName;
        email = session.Email;
        return true;
    }

    public void Revoke(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return;
        }
        _sessions.TryRemove(token.Trim(), out _);
    }

    private void CleanupExpired()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in _sessions)
        {
            if (entry.Value.ExpiresAtUtc <= now)
            {
                _sessions.TryRemove(entry.Key, out _);
            }
        }
    }

    private sealed record Session(string FullName, string Email, DateTimeOffset ExpiresAtUtc);
}
