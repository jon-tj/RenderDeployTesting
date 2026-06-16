import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { BuracoCard, BuracoView, GameView } from './game-models';

// Buraco UI: select cards from your hand to meld or lay off. Click a meld to
// target it for layoff. Discard via the lixo button. The picker keeps the
// selection cached client-side; the server is the source of truth.
@Component({
  selector: 'app-buraco-game',
  imports: [],
  template: `
    @if (state(); as v) {
      <section class="board buraco">
        <header class="row">
          <div class="players">
            @for (p of v.players; track p.userId; let i = $index) {
              <div class="seat"
                [class.active]="p.isTurn"
                [class.me]="i === v.you?.index"
                [attr.data-team]="p.team">
                <div class="name">{{ nameFor(p.userId) }}</div>
                <div class="count">{{ p.cards }} · Team {{ p.team + 1 }}</div>
              </div>
            }
          </div>
          <div class="piles">
            <button type="button" class="pile stock" (click)="draw('drawStock')" [disabled]="!canDraw(v)">
              Stock · {{ v.stockCount }}
            </button>
            <button type="button" class="pile discard" (click)="draw('takeDiscard')" [disabled]="!canTake(v)">
              @if (v.discardTop?.length) {
                <span class="card mini" [class]="suitClass(v.discardTop![0])">{{ cardLabel(v.discardTop![0]) }}</span>
              } @else { Lixo }
              · {{ v.discardCount }}
            </button>
            @for (m of v.mortos; track m.team) {
              <div class="pile morto">Morto T{{ m.team + 1 }} · {{ m.count }}</div>
            }
          </div>
        </header>

        <section class="melds">
          @for (t of v.teamMelds; track t.team) {
            <div class="team-melds" [attr.data-team]="t.team">
              <h4>Team {{ t.team + 1 }} {{ t.usedMorto ? '· morto used' : '' }}</h4>
              <div class="meld-list">
                @for (m of t.melds; track $index; let mi = $index) {
                  <button type="button" class="meld"
                    [class.canastra]="m.isCanastra"
                    [class.target]="layoffTarget()?.team === t.team && layoffTarget()?.index === mi"
                    [disabled]="!canLayoff(v, t.team)"
                    (click)="targetLayoff(t.team, mi)">
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
            @for (c of v.you.hand; track c.code) {
              <button type="button"
                class="card"
                [class]="suitClass(c)"
                [class.picked]="isSelected(c)"
                (click)="toggle(c)">{{ cardLabel(c) }}</button>
            }
            @if (!v.you.hand.length) { <p class="muted">Empty hand!</p> }
          } @else { <p class="muted">Spectating.</p> }
        </section>
      </section>
    }
  `,
  styles: [`
    .board.buraco { background:#1e3d24; color:#fff; border-radius:var(--r); padding:1rem; margin-top:1rem; }
    .row { display:flex; justify-content:space-between; gap:1rem; align-items:flex-start; flex-wrap:wrap; margin-bottom:1rem; }
    .players { display:flex; gap:.5rem; flex-wrap:wrap; }
    .seat { background:rgba(255,255,255,.1); padding:.4rem .7rem; border-radius:var(--r); min-width:6.5rem; }
    .seat[data-team="0"] { border-left:3px solid #f0c14b; }
    .seat[data-team="1"] { border-left:3px solid #4caaff; }
    .seat.active { background:#fff; color:#222; box-shadow:0 0 0 2px #ffd700; }
    .seat.me { outline:2px dashed #ffd700; }
    .seat .name { font-weight:600; font-size:.9rem; }
    .seat .count { font-size:.75rem; opacity:.85; }
    .piles { display:flex; gap:.5rem; flex-wrap:wrap; }
    .pile { background:rgba(255,255,255,.12); border:0; color:#fff; padding:.5rem .7rem; border-radius:var(--r); cursor:pointer; font:inherit; display:inline-flex; align-items:center; gap:.4rem; }
    .pile:disabled { opacity:.5; cursor:not-allowed; }
    .pile.discard { background:rgba(0,0,0,.35); }
    .pile.morto { cursor:default; opacity:.75; }
    .melds { display:grid; gap:.75rem; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); margin-bottom:1rem; }
    .team-melds { background:rgba(0,0,0,.2); padding:.5rem .75rem; border-radius:var(--r); }
    .team-melds h4 { margin:0 0 .35rem; font-size:.9rem; font-weight:600; }
    .meld-list { display:flex; flex-wrap:wrap; gap:.5rem; }
    .meld { background:rgba(255,255,255,.06); border:1px dashed rgba(255,255,255,.3); border-radius:var(--r); padding:.3rem; display:inline-flex; gap:.15rem; flex-wrap:wrap; cursor:pointer; }
    .meld.canastra { border-color:#ffd700; box-shadow:0 0 0 1px #ffd700 inset; }
    .meld.target { background:rgba(255,215,0,.15); }
    .meld:disabled { cursor:default; }
    .actions { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-bottom:1rem; }
    .actions button { background:var(--accent); color:#fff; border:0; padding:.4rem .8rem; border-radius:var(--r); cursor:pointer; font:inherit; }
    .actions button.ghost { background:transparent; border:1px solid #fff; }
    .actions button:disabled { opacity:.5; cursor:not-allowed; }
    .hand { display:flex; flex-wrap:wrap; gap:.35rem; min-height:5.5rem; padding:.5rem; background:rgba(0,0,0,.25); border-radius:var(--r); }
    .card { background:#fff; color:#222; border:2px solid #fff; border-radius:.4rem; padding:.3rem .45rem; min-width:2.6rem; min-height:3.4rem; cursor:pointer; font-weight:700; font-size:.95rem; display:inline-flex; align-items:center; justify-content:center; }
    .card.mini { min-width:2rem; min-height:2.4rem; padding:.15rem .3rem; font-size:.8rem; cursor:default; }
    .card.picked { transform:translateY(-6px); box-shadow:0 4px 0 #ffd700; }
    .card.s-hearts, .card.s-diamonds { color:#c4232a; }
    .card.s-clubs, .card.s-spades { color:#111; }
    .card.s-joker { background:linear-gradient(135deg,#fdbb2d,#22c1c3); color:#fff; text-shadow:0 1px 2px #0006; }
    .muted { color:rgba(255,255,255,.7); }
    .small { font-size:.8rem; }
  `],
})
export class BuracoGameComponent {
  @Input() view: GameView | null = null;
  @Input({ required: true }) auth!: AuthService;
  @Output() action = new EventEmitter<unknown>();

  protected readonly selected = signal<string[]>([]); // codes
  protected readonly layoffTarget = signal<{ team: number; index: number } | null>(null);

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
    return me?.id === userId ? (me.displayName || 'You') : userId.slice(0, 6);
  }

  protected cardLabel(c: BuracoCard): string {
    if (c.isWild) return 'JK';
    const r = c.rank === 1 ? 'A' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
    const s = c.suit === 'hearts' ? '♥' : c.suit === 'diamonds' ? '♦' : c.suit === 'clubs' ? '♣' : '♠';
    return `${r}${s}`;
  }
  protected suitClass(c: BuracoCard): string { return `s-${c.suit}`; }

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
