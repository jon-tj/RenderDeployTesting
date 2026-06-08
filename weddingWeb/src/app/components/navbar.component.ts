import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { HubApi } from '../services/hub-api.service';
import { SearchHit } from '../models';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, FormsModule],
  template: `
    <nav class="navbar">
      <a class="brand" routerLink="/" aria-label="Home" title="Home"><span class="material-icons">home</span></a>
      <div class="spacer"></div>
      <div class="search" (click)="$event.stopPropagation()">
        <span class="material-icons search-icon">search</span>
        <input type="search" [(ngModel)]="query" (ngModelChange)="onQueryChange($event)"
          (focus)="onFocus()" (keydown.escape)="close()"
          placeholder="Go to event or wishlist…" autocomplete="off" />
        @if (open() && (loading() || hasResults() || searched())) {
          <div class="results" role="listbox">
            @if (loading()) { <div class="row muted small">Searching…</div> }
            @if (events().length) {
              <div class="group-label">Events</div>
              @for (e of events(); track e.id) {
                <button type="button" class="row" (click)="goEvent(e)">
                  <span class="material-icons">event</span>
                  <div class="meta"><strong>{{ e.title || '(untitled)' }}</strong><span class="muted small">{{ e.subtitle }}</span></div>
                </button>
              }
            }
            @if (wishlists().length) {
              <div class="group-label">Wishlists</div>
              @for (w of wishlists(); track w.id) {
                <button type="button" class="row" (click)="goWishlist(w)">
                  <span class="material-icons">redeem</span>
                  <div class="meta"><strong>{{ w.title }}</strong><span class="muted small">{{ w.subtitle }}</span></div>
                </button>
              }
            }
            @if (!loading() && !hasResults() && searched()) { <div class="row muted small">No matches.</div> }
          </div>
        }
      </div>
      <div class="spacer"></div>
      @if (auth.me(); as me) {
        <a class="who" routerLink="/settings" title="Account settings">{{ me.displayName || me.email }}</a>
      }
      @if (showLogout()) { <button type="button" class="ghost" (click)="logout()">Log out</button> }
    </nav>
  `,
  styles: [`
    .navbar { display:flex; align-items:center; gap:1rem; padding:.75rem 1.25rem; background:var(--bg-card); border-bottom:1px solid var(--rule); }
    .brand { font-weight:600; font-size:1.1rem; text-decoration:none; color:var(--ink); white-space:nowrap; display:inline-flex; align-items:center; }
    .brand .material-icons { font-size:1.6rem; }
    .search { flex:0 1 480px; width:100%; position:relative; }
    .spacer { flex:1 1 0; min-width:0; }
    .search-icon { position:absolute; left:.5rem; top:50%; transform:translateY(-50%); color:var(--muted); font-size:1.1rem; pointer-events:none; }
    .search input { width:100%; box-sizing:border-box; padding:.45rem .6rem .45rem 2rem; border:1px solid #e4e4e4; border-radius:var(--r); font:inherit; background:#f5f5f5; }
    .search input:focus { outline:none; border-color:var(--accent); background:var(--bg-card); }
    .results { position:absolute; top:calc(100% + .25rem); left:0; right:0; background:var(--bg-card); border:1px solid var(--rule); border-radius:var(--r); box-shadow:0 8px 24px rgba(0,0,0,.08); max-height:24rem; overflow:auto; z-index:50; }
    .group-label { padding:.4rem .75rem .15rem; font-size:.7rem; text-transform:uppercase; letter-spacing:.04em; color:var(--muted); }
    .row { display:flex; align-items:center; gap:.6rem; width:100%; padding:.5rem .75rem; background:transparent; border:0; text-align:left; cursor:pointer; font:inherit; color:var(--ink); }
    .row:hover { background:#f5efe1; }
    .row .material-icons { color:var(--muted); }
    .meta { display:flex; flex-direction:column; min-width:0; }
    .meta strong { font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .who { color:var(--ink-soft); text-decoration:none; border-bottom:1px dotted transparent; white-space:nowrap; }
    .who:hover { color:var(--ink); border-bottom-color:var(--accent); }
  `],
})
export class NavbarComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly api = inject(HubApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected query = '';
  protected readonly hits = signal<SearchHit[]>([]);
  protected readonly events = computed(() => this.hits().filter(h => h.kind === 'Event'));
  protected readonly wishlists = computed(() => this.hits().filter(h => h.kind === 'Wishlist'));
  protected readonly loading = signal(false);
  protected readonly open = signal(false);
  protected readonly searched = signal(false);
  protected readonly hasResults = computed(() => this.hits().length > 0);
  protected readonly showLogout = computed(() => this.auth.me() !== null || this.auth.getAccessToken() !== null);

  private debounce: ReturnType<typeof setTimeout> | null = null;
  private requestSeq = 0;

  onQueryChange(value: string): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.open.set(true);
    const q = (value ?? '').trim();
    if (q.length < 2) { this.hits.set([]); this.searched.set(false); this.loading.set(false); return; }
    this.loading.set(true);
    this.debounce = setTimeout(async () => {
      const seq = ++this.requestSeq;
      try {
        const r = await this.api.search(q);
        if (seq !== this.requestSeq) return;
        this.hits.set(r ?? []);
        this.searched.set(true);
      } finally {
        if (seq === this.requestSeq) this.loading.set(false);
      }
    }, 200);
  }

  onFocus(): void { if (this.query.trim().length >= 2) this.open.set(true); }

  @HostListener('document:click', ['$event'])
  protected onDocClick(ev: MouseEvent): void {
    if (!this.host.nativeElement.contains(ev.target as Node)) this.close();
  }

  close(): void { this.open.set(false); }

  private resetSearch(): void { this.close(); this.query = ''; this.hits.set([]); this.searched.set(false); }
  goEvent(e: SearchHit): void { this.resetSearch(); this.router.navigate(['/event', e.id]); }
  goWishlist(w: SearchHit): void { this.resetSearch(); this.router.navigate(['/wishlist', w.id]); }
  logout(): void { this.auth.logout(); }
}
