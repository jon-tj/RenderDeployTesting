import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfig } from '../services/api-config.service';
import { GameCatalogEntry, LeaderboardRow, ScoreEntry } from './game-models';

@Injectable({ providedIn: 'root' })
export class GamesApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfig);

  listGames(): Promise<GameCatalogEntry[]> {
    return firstValueFrom(this.http.get<GameCatalogEntry[]>(this.api.url('/api/games')));
  }

  getGame(id: string): Promise<GameCatalogEntry> {
    return firstValueFrom(this.http.get<GameCatalogEntry>(this.api.url(`/api/games/${id}`)));
  }

  leaderboard(opts?: { gameId?: string; configId?: string; take?: number }): Promise<LeaderboardRow[]> {
    const params = new URLSearchParams();
    if (opts?.gameId) params.set('gameId', opts.gameId);
    if (opts?.configId) params.set('configId', opts.configId);
    if (opts?.take) params.set('take', String(opts.take));
    const qs = params.toString();
    return firstValueFrom(
      this.http.get<LeaderboardRow[]>(this.api.url(`/api/leaderboard${qs ? '?' + qs : ''}`))
    );
  }

  recentScores(take = 25): Promise<ScoreEntry[]> {
    return firstValueFrom(
      this.http.get<ScoreEntry[]>(this.api.url(`/api/leaderboard/recent?take=${take}`))
    );
  }
}
