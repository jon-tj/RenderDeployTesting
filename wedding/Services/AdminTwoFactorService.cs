using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;

namespace wedding.Services;

public sealed class AdminTwoFactorService
{
    private readonly ConcurrentDictionary<string, Challenge> _challenges = new(StringComparer.Ordinal);

    public string IssueCode(string fullName, string email, TimeSpan validFor)
    {
        CleanupExpired();

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", CultureInfo.InvariantCulture);
        var key = BuildKey(fullName, email);
        var challenge = new Challenge(code, fullName, email, DateTimeOffset.UtcNow.Add(validFor));
        _challenges[key] = challenge;

        return code;
    }

    public string GeneratePersonalAccessToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
    }

    public bool VerifyCode(string fullName, string email, string inputCode)
    {
        CleanupExpired();

        var key = BuildKey(fullName, email);
        if (!_challenges.TryGetValue(key, out var challenge))
        {
            return false;
        }

        if (!string.Equals(challenge.Code, NormalizeCode(inputCode), StringComparison.Ordinal))
        {
            return false;
        }

        _challenges.TryRemove(key, out _);
        return true;
    }

    private void CleanupExpired()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in _challenges)
        {
            if (entry.Value.ExpiresAtUtc <= now)
            {
                _challenges.TryRemove(entry.Key, out _);
            }
        }
    }

    private static string BuildKey(string fullName, string email)
    {
        return $"{fullName.Trim().ToUpperInvariant()}|{email.Trim().ToUpperInvariant()}";
    }

    private static string NormalizeCode(string code)
    {
        return code.Trim().Replace(" ", string.Empty, StringComparison.Ordinal);
    }

    private sealed record Challenge(string Code, string FullName, string Email, DateTimeOffset ExpiresAtUtc);
}