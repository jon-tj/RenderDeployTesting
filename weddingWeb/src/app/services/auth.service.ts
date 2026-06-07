import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiConfig } from './api-config.service';
import { AuthTokenResponse, Me } from '../models';

const TOKEN_KEY = 'familyhub.auth';
const ME_KEY = 'familyhub.me';

// Refresh a bit before the access token actually expires so the next request
// goes out with a fresh one and we don't race the server.
const REFRESH_SKEW_MS = 60_000;

interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  expiresAtMs: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfig);
  private readonly router = inject(Router);

  // Hydrate from localStorage synchronously so the UI doesn't flash an
  // unauthenticated state on reload while /api/me is in flight.
  private readonly _me = signal<Me | null>(this.readMe());
  readonly me = this._me.asReadonly();
  readonly isAuthenticated = computed(() => this._me() !== null);

  private refreshInFlight: Promise<boolean> | null = null;

  constructor() {
    if (this.readStored()) {
      // Background refresh; failures here must not blank the cached user.
      void this.refreshMe();
    }
  }

  async login(email: string, password: string): Promise<void> {
    const resp = await firstValueFrom(
      this.http.post<AuthTokenResponse>(this.api.url('/api/auth/login'), { email, password })
    );
    this.persist(resp);
    await this.refreshMe();
  }

  async register(email: string, password: string, displayName: string): Promise<void> {
    await firstValueFrom(
      this.http.post(this.api.url('/api/auth/register'), { email, password })
    );
    await this.login(email, password);
    const me = await firstValueFrom(
      this.http.put<Me>(this.api.url('/api/me'), { displayName })
    );
    this.setMe(me);
  }

  logout(): void {
    this.clearStored();
    void this.router.navigate(['/login']);
  }

  getAccessToken(): string | null {
    return this.readStored()?.accessToken ?? null;
  }

  // Returns a usable access token, refreshing it first if it's expired or
  // close to expiring. Returns null only when there's no refresh token or
  // the refresh call itself was rejected.
  async getValidAccessToken(): Promise<string | null> {
    const stored = this.readStored();
    if (!stored) return null;
    if (stored.expiresAtMs - Date.now() > REFRESH_SKEW_MS) return stored.accessToken;
    const ok = await this.tryRefresh();
    if (!ok) return null;
    return this.readStored()?.accessToken ?? null;
  }

  // Single-flight refresh: concurrent callers all await the same network call.
  tryRefresh(): Promise<boolean> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const stored = this.readStored();
    if (!stored?.refreshToken) return Promise.resolve(false);

    this.refreshInFlight = (async () => {
      try {
        const resp = await firstValueFrom(
          this.http.post<AuthTokenResponse>(
            this.api.url('/api/auth/refresh'),
            { refreshToken: stored.refreshToken }
          )
        );
        this.persist(resp);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async refreshMe(): Promise<void> {
    try {
      const me = await firstValueFrom(this.http.get<Me>(this.api.url('/api/me')));
      this.setMe(me);
    } catch (err) {
      // Hard auth failure: drop the session. Anything else (offline, slow
      // cold start) is treated as transient — keep the cached user visible.
      if (err instanceof HttpErrorResponse && err.status === 401) {
        this.clearStored();
      }
    }
  }

  setMe(me: Me): void {
    this._me.set(me);
    try {
      localStorage.setItem(ME_KEY, JSON.stringify(me));
    } catch { /* storage may be unavailable in private modes */ }
  }

  clearStored(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ME_KEY);
    this._me.set(null);
  }

  private persist(t: AuthTokenResponse): void {
    const stored: StoredAuth = {
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      expiresAtMs: Date.now() + t.expiresIn * 1000,
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(stored));
  }

  private readStored(): StoredAuth | null {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? (JSON.parse(raw) as StoredAuth) : null;
    } catch {
      return null;
    }
  }

  private readMe(): Me | null {
    try {
      const raw = localStorage.getItem(ME_KEY);
      return raw ? (JSON.parse(raw) as Me) : null;
    } catch {
      return null;
    }
  }
}

