import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { NavbarComponent } from '../components/navbar.component';
import { GamesApi } from './games-api.service';
import { GameCatalogEntry, LeaderboardRow } from './game-models';

@Component({
  selector: 'app-games-catalog',
  imports: [NavbarComponent, DatePipe],
  template: `
    <app-navbar />
    <main class="shell">
      <header class="hd">
        <h1>Games</h1>
        <p class="muted">Pick a game and play live with other people on the site.</p>
      </header>

      <section class="catalog">
        @for (g of games(); track g.id) {
          <article class="card" (click)="open(g)">
            <span class="material-icons icon">{{ g.icon }}</span>
            <div class="meta">
              <h2>{{ g.title }}</h2>
              <p>{{ g.description }}</p>
              <div class="chips">
                @for (c of g.configs; track c.id) {
                  <span class="chip">{{ c.options['label'] || c.id }}</span>
                }
              </div>
            </div>
            <button type="button" class="play">Play <span class="material-icons">chevron_right</span></button>
          </article>
        }
        @if (!games().length && !loading()) {
          <p class="muted">No games available.</p>
        }
      </section>

      <section class="board">
        <header class="row">
          <h2>Leaderboard</h2>
          <div class="filters">
            <label>Game
              <select [value]="filterGame()" (change)="onGame($event)">
                <option value="">All</option>
                @for (g of games(); track g.id) { <option [value]="g.id">{{ g.title }}</option> }
              </select>
            </label>
            <label>Variant
              <select [value]="filterConfig()" (change)="onConfig($event)" [disabled]="!filterGame()">
                <option value="">All</option>
                @for (c of currentConfigs(); track c.id) {
                  <option [value]="c.id">{{ c.options['label'] || c.id }}</option>
                }
              </select>
            </label>
          </div>
        </header>
        @if (loadingLb()) {
          <p class="muted small">Loading…</p>
        } @else if (!leaderboard().length) {
          <p class="muted small">No scores yet — be the first.</p>
        } @else {
          <table class="lb">
            <thead><tr><th>#</th><th>Team</th><th>Game</th><th>Variant</th><th>Points</th><th>Wins</th><th>Last</th></tr></thead>
            <tbody>
              @for (r of leaderboard(); track r.teamId + '-' + r.gameId + '-' + r.gameConfigsId; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td>{{ r.teamName }} <span class="muted small">({{ r.members.length }})</span></td>
                  <td>{{ r.gameId }}</td>
                  <td>{{ r.gameConfigsId || '–' }}</td>
                  <td><strong>{{ r.totalPoints }}</strong></td>
                  <td>{{ r.wins }}</td>
                  <td class="muted small">{{ r.lastPlayed | date:'short' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </section>
    </main>
  `,
  styles: [`
    .shell { max-width:960px; margin:0 auto; padding:1.5rem 1.25rem 4rem; }
    .hd h1 { margin:0 0 .25rem; }
    .hd .muted { margin:0 0 1.5rem; color:var(--muted); }
    .catalog { display:grid; gap:1rem; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); }
    .card { background:var(--bg-card); border:1px solid var(--rule); border-radius:var(--r); padding:1.25rem; display:flex; flex-direction:column; gap:.75rem; cursor:pointer; transition:transform .1s, box-shadow .1s; }
    .card:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,.08); }
    .card .icon { font-size:2.4rem; color:var(--accent); }
    .card h2 { margin:0; font-size:1.2rem; }
    .card p { margin:0 0 .5rem; color:var(--ink-soft); font-size:.95rem; }
    .chips { display:flex; flex-wrap:wrap; gap:.35rem; }
    .chip { background:#f5efe1; border-radius:999px; padding:.15rem .6rem; font-size:.75rem; color:var(--ink-soft); }
    .play { margin-top:auto; align-self:flex-start; display:inline-flex; align-items:center; gap:.25rem; background:var(--accent); color:#fff; border:0; padding:.45rem .85rem; border-radius:var(--r); cursor:pointer; font:inherit; }
    .board { margin-top:2rem; background:var(--bg-card); border:1px solid var(--rule); border-radius:var(--r); padding:1rem 1.25rem; }
    .board .row { display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-bottom:.75rem; }
    .board h2 { margin:0; font-size:1.1rem; }
    .filters { display:flex; gap:.75rem; flex-wrap:wrap; }
    .filters label { display:flex; gap:.35rem; align-items:center; font-size:.85rem; color:var(--ink-soft); }
    .filters select { font:inherit; padding:.25rem .4rem; border:1px solid var(--rule); border-radius:var(--r); background:#fff; }
    table.lb { width:100%; border-collapse:collapse; font-size:.9rem; }
    table.lb th, table.lb td { padding:.4rem .5rem; text-align:left; border-bottom:1px solid var(--rule); }
    table.lb th { font-weight:600; color:var(--ink-soft); }
    .muted { color:var(--muted); }
    .small { font-size:.8rem; }
  `],
})
export class GamesCatalogComponent implements OnInit {
  private readonly api = inject(GamesApi);
  private readonly router = inject(Router);

  protected readonly games = signal<GameCatalogEntry[]>([]);
  protected readonly leaderboard = signal<LeaderboardRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadingLb = signal(false);
  protected readonly filterGame = signal('');
  protected readonly filterConfig = signal('');

  protected readonly currentConfigs = computed(() => {
    const g = this.games().find(x => x.id === this.filterGame());
    return g?.configs ?? [];
  });

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try { this.games.set(await this.api.listGames()); } finally { this.loading.set(false); }
    void this.reloadLeaderboard();
  }

  async reloadLeaderboard(): Promise<void> {
    this.loadingLb.set(true);
    try {
      this.leaderboard.set(await this.api.leaderboard({
        gameId: this.filterGame() || undefined,
        configId: this.filterConfig() || undefined,
      }));
    } finally { this.loadingLb.set(false); }
  }

  onGame(ev: Event): void {
    this.filterGame.set((ev.target as HTMLSelectElement).value);
    this.filterConfig.set('');
    void this.reloadLeaderboard();
  }
  onConfig(ev: Event): void {
    this.filterConfig.set((ev.target as HTMLSelectElement).value);
    void this.reloadLeaderboard();
  }

  open(g: GameCatalogEntry): void {
    void this.router.navigate(['/game', g.id, 'play']);
  }
}
