import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NavbarComponent } from '../components/navbar.component';
import { AuthService } from '../services/auth.service';
import { GamesApi } from './games-api.service';
import { GamesHubService } from './games-hub.service';
import { GameCatalogEntry } from './game-models';
import { UnoGameComponent } from './uno-game.component';
import { BuracoGameComponent } from './buraco-game.component';

@Component({
  selector: 'app-game-play',
  imports: [NavbarComponent, FormsModule, UnoGameComponent, BuracoGameComponent],
  template: `
    <app-navbar />
    <main class="shell">
      @if (!catalog()) {
        <p class="muted">Loading game…</p>
      } @else {
        <header class="hd">
          <h1>{{ catalog()!.title }}</h1>
          @if (room(); as r) {
            <p class="muted">Room <strong>{{ r.code }}</strong> · {{ configLabel() }} · {{ r.status }}</p>
          } @else {
            <p class="muted">Create a room or join one to start playing.</p>
          }
        </header>

        @if (hub.error(); as e) { <div class="banner err">{{ e }}</div> }

        @if (!room()) {
          <section class="setup">
            <div class="card">
              <h2>Create a room</h2>
              <label>Variant
                <select [(ngModel)]="newConfigId">
                  @for (c of catalog()!.configs; track c.id) {
                    <option [value]="c.id">{{ c.options['label'] || c.id }}</option>
                  }
                </select>
              </label>
              <button type="button" (click)="create()" [disabled]="busy()">Create</button>
            </div>
            <div class="card">
              <h2>Join a room</h2>
              <label>Code
                <input type="text" [(ngModel)]="joinCode" maxlength="8" placeholder="ABCDE" />
              </label>
              <button type="button" (click)="join()" [disabled]="busy() || !joinCode.trim()">Join</button>
            </div>
          </section>
        } @else {
          <section class="lobby" [class.compact]="room()!.status !== 'Lobby'">
            <h2>Players ({{ room()!.players.length }}/{{ room()!.maxPlayers }})</h2>
            <ul class="players">
              @for (p of room()!.players; track p.userId) {
                <li [class.disco]="!p.connected" [class.host]="p.userId === room()!.host">
                  <span class="dot" [class.on]="p.connected"></span>
                  {{ p.displayName }}
                  @if (p.userId === room()!.host) { <span class="badge">Host</span> }
                </li>
              }
            </ul>
            @if (room()!.status === 'Lobby') {
              @if (isHost()) {
                <button type="button" (click)="start()" [disabled]="!canStart()">
                  Start game
                </button>
                @if (!canStart()) { <p class="muted small">Need at least {{ room()!.minPlayers }} players.</p> }
              } @else {
                <p class="muted small">Waiting for host to start…</p>
              }
            }
            <button type="button" class="ghost leave" (click)="leave()">Leave room</button>
          </section>

          @if (room()!.status === 'Playing' || room()!.status === 'Ended') {
            @if (catalog()!.id === 'uno') {
              <app-uno-game [view]="hub.view()" [players]="room()!.players" [auth]="auth" (action)="onAction($event)" />
            } @else if (catalog()!.id === 'buraco') {
              <app-buraco-game [view]="hub.view()" [players]="room()!.players" [auth]="auth" (action)="onAction($event)" />
            }
          }

          @if (hub.ended(); as end) {
            <section class="ended">
              <h2>Round over</h2>
              <p>{{ end.summary }}</p>
              <ul>
                @for (t of end.teams; track $index) {
                  <li [class.winner]="t.winner">
                    <strong>{{ t.points }}</strong> – {{ t.message }}
                  </li>
                }
              </ul>
            </section>
          }

          <section class="chat">
            <h3>Chat</h3>
            <div class="log">
              @for (m of hub.chat(); track m.at + m.from) {
                <div class="msg"><strong>{{ m.name }}:</strong> {{ m.text }}</div>
              }
              @if (!hub.chat().length) { <p class="muted small">No messages yet.</p> }
            </div>
            <form (submit)="sendChat(); $event.preventDefault();">
              <input type="text" [(ngModel)]="chatText" name="chatText" maxlength="280" placeholder="Say something…" />
              <button type="submit" [disabled]="!chatText.trim()">Send</button>
            </form>
          </section>
        }
      }
    </main>
  `,
  styles: [`
    .shell { max-width:1000px; margin:0 auto; padding:1.25rem 1rem 4rem; }
    .hd h1 { margin:0; }
    .hd .muted { margin:.25rem 0 1rem; }
    .banner.err { background:#ffe9e6; color:#8a2017; padding:.5rem .75rem; border-radius:var(--r); margin-bottom:.75rem; }
    .setup { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); }
    .setup .card { background:var(--bg-card); border:1px solid var(--rule); border-radius:var(--r); padding:1rem; display:flex; flex-direction:column; gap:.75rem; }
    .setup label { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; color:var(--ink-soft); }
    .setup select, .setup input { font:inherit; padding:.4rem; border:1px solid var(--rule); border-radius:var(--r); }
    .setup button, .lobby button { background:var(--accent); color:#fff; border:0; padding:.5rem .9rem; border-radius:var(--r); cursor:pointer; font:inherit; align-self:flex-start; }
    .setup button:disabled, .lobby button:disabled { opacity:.5; cursor:not-allowed; }
    .lobby { background:var(--bg-card); border:1px solid var(--rule); border-radius:var(--r); padding:1rem; margin-top:1rem; }
    .lobby.compact { padding:.5rem .75rem; }
    .lobby h2 { margin:0 0 .5rem; font-size:1.05rem; }
    .players { list-style:none; padding:0; margin:0 0 .75rem; display:flex; flex-wrap:wrap; gap:.5rem; }
    .players li { display:inline-flex; align-items:center; gap:.4rem; background:#f5efe1; padding:.25rem .6rem; border-radius:999px; font-size:.9rem; }
    .players .dot { width:.5rem; height:.5rem; border-radius:50%; background:#bbb; display:inline-block; }
    .players .dot.on { background:#4cb04f; }
    .players .disco { opacity:.55; }
    .players .badge { font-size:.65rem; background:var(--accent); color:#fff; padding:.05rem .35rem; border-radius:4px; }
    .ghost.leave { background:transparent; color:var(--ink-soft); padding:.25rem .5rem; }
    .ended { margin-top:1rem; background:#f3f9f3; border:1px solid #cfe5cf; border-radius:var(--r); padding:1rem; }
    .ended ul { list-style:none; padding:0; }
    .ended li.winner { font-weight:600; color:#1c6b1f; }
    .chat { margin-top:1rem; background:var(--bg-card); border:1px solid var(--rule); border-radius:var(--r); padding:.75rem 1rem; }
    .chat h3 { margin:0 0 .5rem; font-size:.95rem; }
    .chat .log { max-height:8rem; overflow:auto; font-size:.9rem; margin-bottom:.5rem; }
    .chat .msg { padding:.15rem 0; }
    .chat form { display:flex; gap:.5rem; }
    .chat input { flex:1; padding:.4rem; border:1px solid var(--rule); border-radius:var(--r); font:inherit; }
    .chat button { background:var(--accent); color:#fff; border:0; padding:.4rem .8rem; border-radius:var(--r); cursor:pointer; }
    .muted { color:var(--muted); }
    .small { font-size:.8rem; }
  `],
})
export class GamePlayComponent implements OnInit, OnDestroy {
  protected readonly hub = inject(GamesHubService);
  protected readonly auth = inject(AuthService);
  private readonly api = inject(GamesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly catalog = signal<GameCatalogEntry | null>(null);
  protected readonly busy = signal(false);
  protected newConfigId = '';
  protected joinCode = '';
  protected chatText = '';

  protected readonly room = this.hub.room;

  protected readonly isHost = computed(() => {
    const r = this.room(); const me = this.auth.me();
    return !!(r && me && r.host === me.id);
  });
  protected readonly canStart = computed(() => {
    const r = this.room();
    return !!r && r.status === 'Lobby' && r.players.length >= r.minPlayers;
  });
  protected readonly configLabel = computed(() => {
    const r = this.room(); const c = this.catalog();
    if (!r || !c) return '';
    return c.configs.find(x => x.id === r.configId)?.options['label'] || r.configId;
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('gameId') ?? '';
    try {
      const c = await this.api.getGame(id);
      this.catalog.set(c);
      this.newConfigId = c.configs[0]?.id ?? '';
    } catch {
      void this.router.navigate(['/games']);
    }
  }

  async ngOnDestroy(): Promise<void> {
    await this.hub.disconnect();
  }

  async create(): Promise<void> {
    const c = this.catalog(); if (!c) return;
    this.busy.set(true);
    try { await this.hub.createRoom(c.id, this.newConfigId); }
    finally { this.busy.set(false); }
  }

  async join(): Promise<void> {
    const code = this.joinCode.trim().toUpperCase();
    if (!code) return;
    this.busy.set(true);
    try { await this.hub.joinRoom(code); }
    catch (e) { this.hub.error.set((e as Error).message); }
    finally { this.busy.set(false); }
  }

  async start(): Promise<void> {
    try { await this.hub.startGame(); }
    catch (e) { this.hub.error.set((e as Error).message); }
  }

  async leave(): Promise<void> {
    await this.hub.leaveRoom();
    await this.hub.disconnect();
  }

  async onAction(action: unknown): Promise<void> {
    try { await this.hub.sendAction(action); }
    catch (e) { this.hub.error.set((e as Error).message); }
  }

  async sendChat(): Promise<void> {
    const t = this.chatText.trim(); if (!t) return;
    await this.hub.sendChat(t);
    this.chatText = '';
  }
}
