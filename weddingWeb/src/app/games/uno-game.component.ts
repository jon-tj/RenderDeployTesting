import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, computed, signal } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { GameView, RoomPlayer, UnoCard, UnoColor, UnoView } from './game-models';

@Component({
  selector: 'app-uno-game',
  imports: [],
  template: `
    @if (state(); as v) {
      <section #board class="board uno" [class.fullscreen]="isFullscreen()">
        <button type="button" class="fs-btn" (click)="toggleFullscreen()"
          [title]="isFullscreen() ? 'Exit fullscreen' : 'Fullscreen'">
          <span class="material-icons">{{ isFullscreen() ? 'fullscreen_exit' : 'fullscreen' }}</span>
        </button>
        <div class="players">
          @for (p of v.players; track p.userId; let i = $index) {
            <div class="seat" [class.active]="p.isTurn" [class.me]="i === v.you?.index">
              <div class="name">{{ nameFor(p.userId) }}@if (i === v.you?.index) { <span class="you">(You)</span> }</div>
              <div class="count">{{ p.cards }} cards</div>
            </div>
          }
        </div>

        <div class="middle">
          <div class="discard" [attr.data-color]="v.activeColor">
            @if (v.top) {
              <div class="card big" [class]="cardClasses(v.top)">{{ cardLabel(v.top) }}</div>
            }
          </div>
          <button type="button" class="draw" (click)="emitDraw()" [disabled]="!isMyTurn()">
            <span class="material-icons">style</span>
            Draw ({{ v.drawCount }})
          </button>
          <div class="active-color">Active: <span class="dot" [class]="'c-' + v.activeColor"></span> {{ v.activeColor }}</div>
        </div>

        @if (pickingColor()) {
          <div class="picker">
            <p>Choose a color:</p>
            @for (c of colors; track c) {
              <button type="button" [class]="'c-' + c" (click)="confirmPlay(c)">{{ c }}</button>
            }
            <button type="button" class="ghost" (click)="cancelPick()">Cancel</button>
          </div>
        }

        <div class="hand">
          @if (v.you) {
            @for (c of v.you.hand; track c.code) {
              <button type="button"
                class="card"
                [class]="cardClasses(c)"
                [disabled]="!isMyTurn()"
                (click)="tryPlay(c)">{{ cardLabel(c) }}</button>
            }
            @if (!v.you.hand.length) { <p class="muted">No cards.</p> }
          } @else {
            <p class="muted">Spectating.</p>
          }
        </div>
      </section>
    }
  `,
  styles: [`
    .board.uno { position:relative; background:#0c5e2a; border-radius:var(--r); padding:1rem; color:#fff; margin-top:1rem; }
    .board.uno.fullscreen { border-radius:0; margin:0; overflow:auto; padding:1.5rem; }
    .fs-btn { position:absolute; top:.5rem; right:.5rem; background:rgba(0,0,0,.35); color:#fff; border:0; border-radius:50%; width:2.1rem; height:2.1rem; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; z-index:2; }
    .fs-btn:hover { background:rgba(0,0,0,.55); }
    .fs-btn .material-icons { font-size:1.25rem; }
    .players { display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:1rem; }
    .seat { background:rgba(255,255,255,.1); padding:.4rem .7rem; border-radius:var(--r); min-width:7rem; }
    .seat.active { background:#fff8d6; color:#222; }
    .seat.active .name { color:#222; }
    .seat.me { background:rgba(255,255,255,.22); }
    .seat.me.active { background:#fff8d6; }
    .seat .name { font-weight:600; font-size:.9rem; }
    .seat .name .you { margin-left:.3rem; font-weight:500; opacity:.75; font-size:.78rem; }
    .seat .count { font-size:.8rem; opacity:.85; }
    .middle { display:flex; align-items:center; gap:1rem; margin-bottom:1rem; flex-wrap:wrap; }
    .draw { background:#fff; color:#222; border:0; padding:.5rem .9rem; border-radius:var(--r); cursor:pointer; display:inline-flex; align-items:center; gap:.35rem; }
    .draw:disabled { opacity:.5; cursor:not-allowed; }
    .active-color { display:inline-flex; align-items:center; gap:.4rem; font-size:.9rem; }
    .active-color .dot { width:.8rem; height:.8rem; border-radius:50%; display:inline-block; border:1px solid rgba(255,255,255,.4); }
    .picker { background:rgba(0,0,0,.4); padding:.75rem; border-radius:var(--r); display:flex; gap:.5rem; align-items:center; margin-bottom:1rem; flex-wrap:wrap; }
    .picker p { margin:0; }
    .picker button { border:0; padding:.4rem .8rem; border-radius:var(--r); cursor:pointer; color:#fff; font-weight:600; text-transform:capitalize; }
    .picker .ghost { background:transparent; border:1px solid #fff; }
    .hand { display:flex; flex-wrap:wrap; gap:.4rem; min-height:5.5rem; padding:.5rem; background:rgba(0,0,0,.25); border-radius:var(--r); }
    .card { border:2px solid #fff; border-radius:.5rem; padding:.4rem .55rem; min-width:2.6rem; min-height:4rem; font-weight:700; cursor:pointer; color:#fff; background:#666; display:flex; align-items:center; justify-content:center; font-size:1.05rem; }
    .card:disabled { opacity:.6; cursor:not-allowed; }
    .card.big { min-width:3.6rem; min-height:5.2rem; font-size:1.4rem; }
    .c-red { background:#d3322e; } .c-yellow { background:#d4a017; color:#222; }
    .c-green { background:#2e8b3d; } .c-blue { background:#2562c6; }
    .c-wild { background: conic-gradient(#d3322e, #d4a017, #2e8b3d, #2562c6, #d3322e); color:#fff; text-shadow:0 1px 2px #000; }
    .discard { padding:.3rem; border-radius:.6rem; background:rgba(0,0,0,.25); }
    .board.uno.fullscreen .card { min-width:3.6rem; min-height:5.4rem; font-size:1.4rem; padding:.55rem .75rem; }
    .board.uno.fullscreen .card.big { min-width:5rem; min-height:7rem; font-size:1.9rem; }
    .board.uno.fullscreen .hand { min-height:7.5rem; gap:.55rem; }
    .muted { color:rgba(255,255,255,.7); }
  `],
})
export class UnoGameComponent {
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

  protected readonly colors: UnoColor[] = ['red', 'yellow', 'green', 'blue'];
  protected readonly pickingCard = signal<UnoCard | null>(null);
  protected readonly pickingColor = computed(() => this.pickingCard() !== null);

  protected state(): UnoView | null {
    const v = this.view; return v ? (v.state as UnoView) : null;
  }

  protected isMyTurn(): boolean {
    const v = this.state(); if (!v || !v.you) return false;
    return v.players[v.you.index]?.isTurn ?? false;
  }

  protected cardLabel(c: UnoCard): string {
    switch (c.kind) {
      case 'number': return String(c.number);
      case 'skip': return '⊘';
      case 'reverse': return '⇄';
      case 'draw2': return '+2';
      case 'wild': return 'W';
      case 'wilddraw4': return '+4';
    }
  }
  protected cardClasses(c: UnoCard): string { return `c-${c.color}`; }

  protected nameFor(userId: string): string {
    const me = this.auth.me();
    if (me?.id === userId) return me.displayName || 'You';
    const p = this.players.find(x => x.userId === userId);
    return p?.displayName || '?';
  }

  protected tryPlay(c: UnoCard): void {
    if (c.color === 'wild') { this.pickingCard.set(c); return; }
    this.action.emit({ type: 'play', cardCode: c.code });
  }

  protected confirmPlay(color: UnoColor): void {
    const c = this.pickingCard(); if (!c) return;
    this.action.emit({ type: 'play', cardCode: c.code, chosenColor: color });
    this.pickingCard.set(null);
  }

  protected cancelPick(): void { this.pickingCard.set(null); }

  protected emitDraw(): void { this.action.emit({ type: 'draw' }); }
}
