import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, computed, signal } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BuracoCard, BuracoView, GameView, RoomPlayer } from './game-models';

// Buraco UI: select cards from your hand to meld or lay off. Click a meld to
// target it for layoff. Discard via the lixo button. The picker keeps the
// selection cached client-side; the server is the source of truth.
@Component({
  selector: 'app-buraco-game',
  imports: [],
  template: `
    @if (state(); as v) {
      <section #board class="board buraco" [class.fullscreen]="isFullscreen()">
        <button type="button" class="fs-btn" (click)="toggleFullscreen()"
          [title]="isFullscreen() ? 'Exit fullscreen' : 'Fullscreen'">
          <span class="material-icons">{{ isFullscreen() ? 'fullscreen_exit' : 'fullscreen' }}</span>
        </button>
        <header class="row">
          <div class="players">
            @for (p of v.players; track p.userId; let i = $index) {
              <div class="seat"
                [class.active]="p.isTurn"
                [class.me]="i === v.you?.index"
                [attr.data-team]="p.team">
                <div class="name">{{ nameFor(p.userId) }}@if (i === v.you?.index) { <span class="you">(You)</span> }</div>
                <div class="count">{{ p.cards }} · Team {{ p.team + 1 }}</div>
              </div>
            }
          </div>
          <div class="piles">
            <button type="button" class="pile stock" (click)="draw('drawStock')" [disabled]="!canDraw(v)">
              Stock · {{ v.stockCount }}
            </button>
            <button type="button" class="pile discard" (click)="draw('takeDiscard')" [disabled]="!canTake(v)">
              <span class="fan">
                @for (c of v.discard; track c.code; let i = $index; let last = $last) {
                  <span class="card mini fan-card"
                    [class]="suitClass(c)"
                    [class.wild]="c.rank === 2"
                    [class.top]="last"
                    [style.--fi]="i">{{ cardLabel(c) }}</span>
                }
                @if (!v.discard.length) { <span class="empty">Lixo</span> }
              </span>
              <span class="pile-label">· {{ v.discardCount }}</span>
            </button>
            @for (m of v.mortos; track m.team) {
              <div class="pile morto">Morto T{{ m.team + 1 }} · {{ m.count }}</div>
            }
          </div>
        </header>

        <section class="melds">
          @for (t of v.teamMelds; track t.team) {
            <div class="team-melds" [attr.data-team]="t.team">
              <h4>
                Team {{ t.team + 1 }}
                <span class="score">{{ teamScore(t) }} pts</span>
                @if (t.usedMorto) { <span class="muted small">· morto used</span> }
              </h4>
              <div class="meld-list">
                @for (m of t.melds; track $index; let mi = $index) {
                  <button type="button" class="meld"
                    [class.canastra]="m.isCanastra"
                    [class.dirty]="m.hasWild"
                    [class.target]="layoffTarget()?.team === t.team && layoffTarget()?.index === mi"
                    [disabled]="!canLayoff(v, t.team)"
                    (click)="targetLayoff(t.team, mi)">
                    <span class="meld-pts">{{ meldPoints(m) }}</span>
                    @for (c of m.cards; track c.code) {
                      <span class="card mini" [class]="suitClass(c)">{{ cardLabel(c) }}</span>
                    }
                  </button>
                }
                @if (!t.melds.length) { <span class="muted small">no melds yet</span> }
              </div>
            </div>
          }
        </section>

        <section class="actions">
          @if (selected().length) {
            <button type="button" (click)="meldNew()" [disabled]="!canMeld(v) || selected().length < 3">
              Meld {{ selected().length }} cards
            </button>
            @if (layoffTarget()) {
              <button type="button" (click)="doLayoff()" [disabled]="!canLayoff(v)">
                Lay off on T{{ layoffTarget()!.team + 1 }} #{{ layoffTarget()!.index + 1 }}
              </button>
            }
            <button type="button" (click)="discardSelected()"
              [disabled]="!canDiscard(v) || selected().length !== 1">Discard 1</button>
            <button type="button" class="ghost" (click)="clearSelection()">Clear</button>
          } @else {
            <span class="muted small">
              Phase: <strong>{{ v.phase }}</strong>.
              @if (canDraw(v)) { Draw or take the lixo. }
              @else { Select cards to meld, lay off, or discard. }
            </span>
          }
        </section>

        <section class="hand">
          @if (v.you) {
            @for (c of sortedHand(v.you.hand); track c.code) {
              <button type="button"
                class="card"
                [class]="suitClass(c)"
                [class.wild]="c.rank === 2"
                [class.picked]="isSelected(c)"
                (click)="toggle(c)"
                [title]="c.rank === 2 ? 'Wild card — may be played as a 2 or as any rank' : ''">{{ cardLabel(c) }}</button>
            }
            @if (!v.you.hand.length) { <p class="muted">Empty hand!</p> }
          } @else { <p class="muted">Spectating.</p> }
          <div class="sort-group">
            <button type="button" class="sort-btn" (click)="sortBy('suit')"
              [class.on]="sortKey() === 'suit'"
              [title]="sortKey() === 'suit' ? (dirFor('suit') === 'asc' ? 'Reverse (Z–A)' : 'Reverse (A–Z)') : 'Sort by suit'">
              <span class="material-icons">{{ sortKey() === 'suit' && dirFor('suit') === 'desc' ? 'arrow_downward' : 'arrow_upward' }}</span>
              Suit
            </button>
            <button type="button" class="sort-btn" (click)="sortBy('rank')"
              [class.on]="sortKey() === 'rank'"
              [title]="sortKey() === 'rank' ? (dirFor('rank') === 'asc' ? 'Reverse (high→low)' : 'Reverse (low→high)') : 'Sort by value'">
              <span class="material-icons">{{ sortKey() === 'rank' && dirFor('rank') === 'desc' ? 'arrow_downward' : 'arrow_upward' }}</span>
              Value
            </button>
          </div>
        </section>
      </section>
    }
  `,
  styles: [`
    .board.buraco { position:relative; background:#1e3d24; color:#fff; border-radius:var(--r); padding:1rem; margin-top:1rem; }
    .board.buraco.fullscreen { border-radius:0; margin:0; overflow:auto; padding:1.5rem; }
    .fs-btn { position:absolute; top:.5rem; right:.5rem; background:rgba(0,0,0,.35); color:#fff; border:0; border-radius:50%; width:2.1rem; height:2.1rem; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; z-index:2; }
    .fs-btn:hover { background:rgba(0,0,0,.55); }
    .fs-btn .material-icons { font-size:1.25rem; }
    .row { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; flex-wrap:wrap; margin-bottom:1rem; }
    .players { display:flex; gap:.5rem; flex-wrap:wrap; }
    .seat { background:rgba(255,255,255,.1); padding:.4rem .7rem; border-radius:var(--r); min-width:6.5rem; }
    .seat[data-team="0"] { border-left:3px solid #f0c14b; }
    .seat[data-team="1"] { border-left:3px solid #4caaff; }
    .seat.active { background:#fff8d6; color:#222; }
    .seat.active .name, .seat.active .count { color:#222; }
    .seat.me { background:rgba(255,255,255,.22); }
    .seat.me.active { background:#fff8d6; }
    .seat .name { font-weight:600; font-size:.9rem; }
    .seat .name .you { margin-left:.3rem; font-weight:500; opacity:.75; font-size:.78rem; }
    .seat .count { font-size:.75rem; opacity:.85; }
    .piles { display:flex; gap:.5rem; flex-wrap:wrap; }
    .pile { background:rgba(255,255,255,.12); border:0; color:#fff; padding:.5rem .7rem; border-radius:var(--r); cursor:pointer; font:inherit; display:inline-flex; align-items:center; gap:.4rem; }
    .pile:disabled { opacity:.5; cursor:not-allowed; }
    .pile.discard { background:rgba(0,0,0,.35); }
    .pile.discard .fan { display:inline-flex; }
    /* Collapsed: each card past the first fully overlaps the previous so
       only the top shows. On hover, ease to a 40% overlap fan. */
    .pile.discard .fan .fan-card { margin-left:-2rem; transition:margin-left .2s ease; }
    .pile.discard .fan .fan-card:first-child { margin-left:0; }
    .pile.discard:hover .fan .fan-card { margin-left:-1.2rem; }
    .pile.discard:hover .fan .fan-card:first-child { margin-left:0; }
    .pile.discard .empty { padding:.15rem .3rem; }
    .pile-label { margin-left:.15rem; }
    .pile.morto { cursor:default; opacity:.75; }
    .melds { display:grid; gap:.75rem; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); margin-bottom:1rem; }
    .team-melds { background:rgba(0,0,0,.2); padding:.5rem .75rem; border-radius:var(--r); }
    .team-melds h4 { margin:0 0 .35rem; font-size:.9rem; font-weight:600; display:flex; align-items:center; gap:.5rem; }
    .team-melds h4 .score { background:rgba(255,215,0,.22); color:#ffd700; padding:.05rem .45rem; border-radius:999px; font-size:.8rem; font-weight:700; }
    .meld-list { display:flex; flex-wrap:wrap; gap:.5rem; }
    .meld { position:relative; background:rgba(255,255,255,.06); border:1px dashed rgba(255,255,255,.3); border-radius:var(--r); padding:.85rem .3rem .3rem; display:inline-flex; gap:.15rem; flex-wrap:wrap; cursor:pointer; }
    .meld.canastra { border-color:#ffd700; box-shadow:0 0 0 1px #ffd700 inset; }
    .meld.dirty { border-style:solid; border-color:#8b5a2b; box-shadow:0 0 0 1px #8b5a2b inset; }
    .meld.dirty.canastra { box-shadow:0 0 0 1px #ffd700 inset, 0 0 0 3px #8b5a2b inset; }
    .meld.target { background:rgba(255,215,0,.15); }
    .meld:disabled { cursor:default; }
    .meld-pts { position:absolute; top:.15rem; right:.35rem; font-size:.7rem; font-weight:700; color:#ffd700; background:rgba(0,0,0,.35); padding:.05rem .35rem; border-radius:999px; pointer-events:none; }
    .actions { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-bottom:1rem; }
    .actions button { background:var(--accent); color:#fff; border:0; padding:.4rem .8rem; border-radius:var(--r); cursor:pointer; font:inherit; }
    .actions button.ghost { background:transparent; border:1px solid #fff; }
    .actions button:disabled { opacity:.5; cursor:not-allowed; }
    .hand { display:flex; flex-wrap:wrap; gap:.35rem; min-height:5.5rem; padding:.5rem; background:rgba(0,0,0,.25); border-radius:var(--r); align-items:flex-start; }
    .sort-group { margin-left:auto; align-self:flex-start; display:inline-flex; gap:.35rem; }
    .sort-btn { background:rgba(255,255,255,.12); color:#fff; border:0; padding:.35rem .6rem; border-radius:var(--r); cursor:pointer; font:inherit; display:inline-flex; align-items:center; gap:.25rem; font-size:.85rem; }
    .sort-btn .material-icons { font-size:1rem; }
    .sort-btn:hover { background:rgba(255,255,255,.22); }
    .sort-btn.on { background:#ffd700; color:#222; }
    .card { background:#fff; color:#222; border:2px solid #fff; border-radius:.4rem; padding:.3rem .45rem; min-width:2.6rem; min-height:3.4rem; cursor:pointer; font-weight:700; font-size:.95rem; display:inline-flex; align-items:center; justify-content:center; }
    .card.mini { min-width:2rem; min-height:2.4rem; padding:.15rem .3rem; font-size:.8rem; cursor:default; }
    .card.picked { transform:translateY(-6px); box-shadow:0 4px 0 #ffd700; }
    .card.s-hearts, .card.s-diamonds { color:#c4232a; }
    .card.s-clubs, .card.s-spades { color:#111; }
    .card.wild { background:linear-gradient(135deg,#fff7d6,#ffd700); box-shadow:inset 0 0 0 2px #b8860b; }
    .board.buraco.fullscreen .card { min-width:3.6rem; min-height:5rem; padding:.45rem .65rem; font-size:1.3rem; border-radius:.55rem; }
    .board.buraco.fullscreen .card.mini { min-width:2.8rem; min-height:3.6rem; padding:.25rem .45rem; font-size:1.05rem; }
    .board.buraco.fullscreen .pile.discard .fan .fan-card { margin-left:-2.8rem; }
    .board.buraco.fullscreen .pile.discard:hover .fan .fan-card { margin-left:-1.7rem; }
    .board.buraco.fullscreen .pile.discard .fan .fan-card:first-child,
    .board.buraco.fullscreen .pile.discard:hover .fan .fan-card:first-child { margin-left:0; }
    .board.buraco.fullscreen .hand { min-height:7rem; gap:.5rem; }
    .muted { color:rgba(255,255,255,.7); }
    .small { font-size:.8rem; }
  `],
})
export class BuracoGameComponent {
  @Input() view: GameView | null = null;
  @Input() players: RoomPlayer[] = [];
  @Input({ required: true }) auth!: AuthService;
  @Output() action = new EventEmitter<unknown>();
  @ViewChild('board') private boardRef?: ElementRef<HTMLElement>;

  protected readonly isFullscreen = signal(false);

  @HostListener('document:fullscreenchange')
  protected onFsChange(): void {
    this.isFullscreen.set(document.fullscreenElement === this.boardRef?.nativeElement);
  }

  protected async toggleFullscreen(): Promise<void> {
    const el = this.boardRef?.nativeElement;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch { /* user-gesture or unsupported — ignore */ }
  }

  protected readonly selected = signal<string[]>([]); // codes
  protected readonly layoffTarget = signal<{ team: number; index: number } | null>(null);
  // Active sort key + remembered direction per key. Clicking a key the
  // second time flips just that key's direction; switching keys uses the
  // last direction chosen for it.
  protected readonly sortKey = signal<'suit' | 'rank'>('suit');
  private readonly suitDir = signal<'asc' | 'desc'>('asc');
  private readonly rankDir = signal<'asc' | 'desc'>('asc');

  protected dirFor(key: 'suit' | 'rank'): 'asc' | 'desc' {
    return key === 'suit' ? this.suitDir() : this.rankDir();
  }

  protected sortBy(key: 'suit' | 'rank'): void {
    if (this.sortKey() === key) {
      const sig = key === 'suit' ? this.suitDir : this.rankDir;
      sig.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
    }
  }

  protected sortedHand(hand: BuracoCard[]): BuracoCard[] {
    // Stable sort along the chosen primary key. Wilds (legacy jokers) pin
    // to the end so they're easy to spot regardless of direction.
    const wild = hand.filter(c => c.isWild);
    const rest = hand.filter(c => !c.isWild);
    const suitOrder: Record<string, number> = { clubs: 0, diamonds: 1, hearts: 2, spades: 3, joker: 4 };
    const key = this.sortKey();
    const dir = this.dirFor(key) === 'asc' ? 1 : -1;
    const cmp = key === 'suit'
      ? (a: BuracoCard, b: BuracoCard) => dir * (suitOrder[a.suit] - suitOrder[b.suit])
      : (a: BuracoCard, b: BuracoCard) => dir * ((a.rank || 99) - (b.rank || 99));
    return [...rest.sort(cmp), ...wild.sort(cmp)];
  }

  protected state(): BuracoView | null {
    return this.view ? (this.view.state as BuracoView) : null;
  }

  protected isMyTurn(v: BuracoView): boolean {
    return !!v.you && v.players[v.you.index]?.isTurn === true;
  }
  protected canDraw(v: BuracoView): boolean { return this.isMyTurn(v) && v.phase === 'Draw'; }
  protected canTake(v: BuracoView): boolean { return this.canDraw(v) && v.discardCount > 0; }
  protected canMeld(v: BuracoView): boolean { return this.isMyTurn(v) && v.phase === 'MeldDiscard'; }
  protected canDiscard(v: BuracoView): boolean { return this.isMyTurn(v) && v.phase === 'MeldDiscard'; }
  protected canLayoff(v: BuracoView, team?: number): boolean {
    if (!this.isMyTurn(v) || v.phase !== 'MeldDiscard') return false;
    if (team !== undefined && v.you && v.you.team !== team) return false;
    return true;
  }

  protected nameFor(userId: string): string {
    const me = this.auth.me();
    if (me?.id === userId) return me.displayName || 'You';
    const p = this.players.find(x => x.userId === userId);
    return p?.displayName || '?';
  }

  protected cardLabel(c: BuracoCard): string {
    if (c.isWild) return 'JK'; // legacy — jokers no longer dealt, kept for safety
    const r = c.rank === 1 ? 'A' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
    const s = c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : c.suit === 'clubs' ? '♣' : '♠';
    return `${r}${s}`;
  }
  protected suitClass(c: BuracoCard): string { return `s-${c.suit}`; }

  // Mirrors BuracoEngine scoring for melds only (face values + canastra bonus).
  // Hand penalties / morto / bater are applied server-side at round end.
  protected teamScore(t: { melds: { cards: BuracoCard[]; isCanastra: boolean; hasWild: boolean }[] }): number {
    let total = 0;
    for (const m of t.melds) total += this.meldPoints(m);
    return total;
  }

  protected meldPoints(m: { cards: BuracoCard[]; isCanastra: boolean; hasWild: boolean }): number {
    let pts = 0;
    for (const c of m.cards) pts += this.cardPoints(c);
    if (m.isCanastra) pts += m.hasWild ? 100 : 200;
    return pts;
  }

  private cardPoints(c: BuracoCard): number {
    if (c.isWild) return 30; // joker
    if (c.rank === 1) return 15; // ace
    if (c.rank >= 2 && c.rank <= 7) return 5;
    return 10;
  }

  protected isSelected(c: BuracoCard): boolean { return this.selected().includes(c.code); }
  protected toggle(c: BuracoCard): void {
    this.selected.update(prev => prev.includes(c.code) ? prev.filter(x => x !== c.code) : [...prev, c.code]);
  }
  protected clearSelection(): void { this.selected.set([]); this.layoffTarget.set(null); }

  protected draw(type: 'drawStock' | 'takeDiscard'): void { this.action.emit({ type }); }

  protected meldNew(): void {
    const cards = this.selected();
    if (cards.length < 3) return;
    this.action.emit({ type: 'meld', cards });
    this.selected.set([]);
  }

  protected targetLayoff(team: number, index: number): void {
    const v = this.state();
    if (!v?.you || v.you.team !== team) return;
    this.layoffTarget.set({ team, index });
  }

  protected doLayoff(): void {
    const t = this.layoffTarget(); if (!t) return;
    const cards = this.selected();
    if (!cards.length) return;
    this.action.emit({ type: 'layoff', meldIndex: t.index, cards });
    this.selected.set([]); this.layoffTarget.set(null);
  }

  protected discardSelected(): void {
    const cards = this.selected();
    if (cards.length !== 1) return;
    this.action.emit({ type: 'discard', cardCode: cards[0] });
    this.selected.set([]); this.layoffTarget.set(null);
  }
}
