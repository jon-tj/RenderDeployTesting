import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { HubApi } from '../services/hub-api.service';
import { AuthService } from '../services/auth.service';
import { WISHLIST_CURRENCIES, WishlistCurrency, WishlistItem, WishlistView } from '../models';

interface CartLine {
  itemId: number;
  quantity: number;
}

// Rates expressed as (target = source * factor) to BRL — fallback if API
// call fails. Matches the server's hard-coded table.
const FALLBACK_TO_BRL: Record<WishlistCurrency, number> = { BRL: 1, NOK: 0.5, USD: 0.05 };

@Component({
  selector: 'app-wishlist',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, DatePipe],
  template: `
    <app-navbar></app-navbar>
    <main class="page">
      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (notFound()) {
        <p class="error">Wishlist not found.</p>
      } @else if (view(); as v) {
        <header class="page-head">
          <h1>{{ v.ownerDisplayName }}'s wishlist</h1>
          <p class="muted small">Pick what you'd like to gift. {{ isMine() ? 'Items you add appear here; you can see claim counts but not who claimed what.' : 'Add items to your cart, then claim them together.' }}</p>
        </header>

        @if (isMine()) {
          <section class="card">
            <h2>Add an item</h2>
            <form class="row" (ngSubmit)="addItem()">
              <input type="text" placeholder="Name" name="name" [(ngModel)]="draftName" required />
              <input type="number" placeholder="Price" name="price" min="0" step="0.01" [(ngModel)]="draftPrice" />
              <select name="cur" [(ngModel)]="draftCurrency">
                @for (c of currencies; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
              <input type="number" placeholder="Qty" name="qty" min="1" [(ngModel)]="draftQty" />
              <input type="url" placeholder="Link (optional)" name="url" [(ngModel)]="draftUrl" />
              <input type="text" placeholder="Pix key (BRL only, optional)" name="pix" [(ngModel)]="draftPix" />
              <button type="submit" [disabled]="!draftName.trim() || saving()">{{ saving() ? 'Saving…' : 'Add' }}</button>
            </form>
            @if (addError()) { <p class="error small">{{ addError() }}</p> }
          </section>
        }

        <section class="card">
          <div class="cart-header">
            <h2>Items</h2>
            @if (!isMine()) {
              <label class="muted small">
                Show totals in
                <select [(ngModel)]="displayCurrency" name="dispcur">
                  @for (c of currencies; track c) {
                    <option [value]="c">{{ c }}</option>
                  }
                </select>
              </label>
            }
          </div>
          @if (!v.items.length) {
            <p class="muted">No items yet.</p>
          } @else {
            <ul class="items">
              @for (i of v.items; track i.id) {
                @let remaining = i.wishedQuantity - i.claimedQuantity;
                <li class="item" [class.taken]="remaining <= 0">
                  <div class="item-main">
                    <div class="item-name">
                      @if (i.url) {
                        <a [href]="i.url" target="_blank" rel="noopener">{{ i.name }}</a>
                      } @else {
                        <strong>{{ i.name }}</strong>
                      }
                      @if (i.priceMinor > 0) {
                        <span class="muted small"> · {{ formatPrice(i.priceMinor, i.currency) }}</span>
                      }
                    </div>
                    @if (i.description) { <p class="muted small">{{ i.description }}</p> }
                    <p class="muted small">
                      {{ i.claimedQuantity }} / {{ i.wishedQuantity }} claimed
                      @if (i.pixKey && i.currency === 'BRL') {
                        · Pix: <code>{{ i.pixKey }}</code>
                      }
                    </p>
                    @if (isMine() && i.claims.length) {
                      <ul class="claims">
                        @for (c of i.claims; track c.id) {
                          <li class="muted small">{{ c.quantity }}× claimed {{ c.createdAtUtc | date:'short' }}</li>
                        }
                      </ul>
                    }
                  </div>
                  <div class="item-actions">
                    @if (isMine()) {
                      <button type="button" class="ghost small" (click)="deleteItem(i)">Remove</button>
                    } @else if (remaining > 0) {
                      <div class="cart-controls">
                        <button type="button" class="ghost small" (click)="adjustCart(i.id, -1)" [disabled]="(cart().get(i.id) ?? 0) === 0">−</button>
                        <span class="qty">{{ cart().get(i.id) ?? 0 }}</span>
                        <button type="button" class="ghost small" (click)="adjustCart(i.id, 1, remaining)" [disabled]="(cart().get(i.id) ?? 0) >= remaining">+</button>
                      </div>
                    } @else {
                      <span class="muted small">Fully claimed</span>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        @if (!isMine() && cartCount() > 0) {
          <section class="card cart-summary">
            <h2>Your cart</h2>
            <ul class="muted small">
              @for (line of cartLines(); track line.itemId) {
                @let it = itemById(line.itemId);
                @if (it) {
                  <li>{{ line.quantity }}× {{ it.name }} ({{ formatPrice(it.priceMinor * line.quantity, it.currency) }})</li>
                }
              }
            </ul>
            <p><strong>Total: {{ formatTotal(cartTotalBrl(), displayCurrency) }}</strong></p>
            @if (!auth.isAuthenticated()) {
              <label class="field">
                <span class="muted small">Your name (so the bride/groom know who to thank)</span>
                <input type="text" name="label" [(ngModel)]="claimantLabel" />
              </label>
            } @else {
              <label class="check">
                <input type="checkbox" name="anon" [(ngModel)]="anonymous" />
                Claim anonymously
              </label>
              @if (anonymous) {
                <label class="field">
                  <span class="muted small">Name to display</span>
                  <input type="text" name="label" [(ngModel)]="claimantLabel" />
                </label>
              }
            }
            <button type="button" (click)="submitCart()" [disabled]="claiming() || !canSubmit()">{{ claiming() ? 'Claiming…' : 'Claim cart' }}</button>
            @if (claimError()) { <p class="error small">{{ claimError() }}</p> }
          </section>
        }
      }
    </main>
  `,
  styles: [`
    .page { max-width:780px; margin:0 auto; padding:1rem; }
    .page-head h1 { margin:0 0 .25rem; }
    .card { background:#fff; border-radius:.6rem; padding:1rem 1.1rem; margin-top:1rem; box-shadow:0 1px 2px rgba(0,0,0,.06); }
    .card h2 { margin:0 0 .6rem; font-size:1.1rem; }
    .row { display:flex; gap:.5rem; flex-wrap:wrap; }
    .row input, .row select { flex:1; min-width:120px; }
    .row button { flex:0 0 auto; }
    ul.items { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.6rem; }
    .item { display:flex; gap:.75rem; align-items:flex-start; padding:.65rem .75rem; background:#faf7f0; border-radius:.4rem; }
    .item-main { flex:1; min-width:0; }
    .item-name a { color:#8a6f3a; text-decoration:none; }
    .item-name a:hover { text-decoration:underline; }
    .item.taken .item-name { text-decoration:line-through; opacity:.55; }
    .item-actions { flex:0 0 auto; }
    .cart-controls { display:flex; align-items:center; gap:.4rem; }
    .qty { min-width:1.4rem; text-align:center; }
    .cart-header { display:flex; justify-content:space-between; align-items:baseline; gap:1rem; }
    .cart-summary { background:#fff8e6; }
    .field { display:flex; flex-direction:column; gap:.2rem; margin:.5rem 0; }
    .check { display:flex; align-items:center; gap:.4rem; margin:.5rem 0; }
    .claims { list-style:disc; margin:.25rem 0 0 1.25rem; padding:0; }
    .error { color:#b03030; }
    .small { font-size:.85rem; }
    .muted { color:#6b6450; }
    code { background:#eee; padding:0 .25rem; border-radius:.2rem; }
  `],
})
export class WishlistComponent implements OnInit {
  private readonly api = inject(HubApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly currencies = WISHLIST_CURRENCIES;
  protected readonly view = signal<WishlistView | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly saving = signal(false);
  protected readonly addError = signal('');
  protected readonly claiming = signal(false);
  protected readonly claimError = signal('');

  protected readonly cart = signal<Map<number, number>>(new Map());
  protected readonly cartCount = computed(() =>
    Array.from(this.cart().values()).reduce((s, q) => s + q, 0));
  protected readonly cartLines = computed<CartLine[]>(() =>
    Array.from(this.cart().entries()).map(([itemId, quantity]) => ({ itemId, quantity })));

  protected readonly isMine = computed(() => {
    const v = this.view();
    const me = this.auth.me();
    return !!v && !!me && v.ownerUserId === me.id;
  });

  protected rates: Record<WishlistCurrency, number> = { ...FALLBACK_TO_BRL };

  protected displayCurrency: WishlistCurrency = 'BRL';
  protected draftName = '';
  protected draftPrice: number | null = null;
  protected draftCurrency: WishlistCurrency = 'BRL';
  protected draftQty = 1;
  protected draftUrl = '';
  protected draftPix = '';
  protected claimantLabel = '';
  protected anonymous = false;

  async ngOnInit(): Promise<void> {
    const ownerId = this.route.snapshot.paramMap.get('userId');
    try {
      this.rates = await this.api.getWishlistRates();
    } catch { /* fallback already set */ }
    try {
      const view = ownerId
        ? await this.api.getWishlist(ownerId)
        : await this.api.getMyWishlist();
      this.view.set(view);
      if (this.auth.me()?.id === view.ownerUserId) {
        // Default to BRL for the owner — same as before — but no cart UI shown.
      }
    } catch {
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected itemById(id: number): WishlistItem | undefined {
    return this.view()?.items.find(i => i.id === id);
  }

  protected adjustCart(itemId: number, delta: number, max?: number): void {
    const next = new Map(this.cart());
    const cur = next.get(itemId) ?? 0;
    let q = cur + delta;
    if (q < 0) q = 0;
    if (max !== undefined && q > max) q = max;
    if (q === 0) next.delete(itemId); else next.set(itemId, q);
    this.cart.set(next);
  }

  protected formatPrice(minor: number, currency: WishlistCurrency): string {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }

  protected cartTotalBrl(): number {
    let total = 0;
    for (const [itemId, qty] of this.cart()) {
      const it = this.itemById(itemId);
      if (!it) continue;
      const rate = this.rates[it.currency] ?? 1;
      total += (it.priceMinor / 100) * qty * rate;
    }
    return total;
  }

  protected formatTotal(brlAmount: number, target: WishlistCurrency): string {
    const factor = this.rates[target] ?? 1;
    // rates table maps source->BRL; to convert BRL->target we divide.
    const amount = factor === 0 ? brlAmount : brlAmount / factor;
    return `${amount.toFixed(2)} ${target}`;
  }

  protected canSubmit(): boolean {
    if (this.cartCount() === 0) return false;
    if (this.auth.isAuthenticated() && !this.anonymous) return true;
    return this.claimantLabel.trim().length > 0;
  }

  async addItem(): Promise<void> {
    if (!this.draftName.trim()) return;
    this.saving.set(true);
    this.addError.set('');
    try {
      const item = await this.api.createWishlistItem({
        name: this.draftName.trim(),
        priceMinor: Math.round((this.draftPrice ?? 0) * 100),
        currency: this.draftCurrency,
        wishedQuantity: Math.max(1, this.draftQty || 1),
        url: this.draftUrl.trim(),
        pixKey: this.draftPix.trim(),
      });
      const v = this.view();
      if (v) this.view.set({ ...v, items: [...v.items, item] });
      this.draftName = ''; this.draftPrice = null; this.draftQty = 1; this.draftUrl = ''; this.draftPix = '';
    } catch {
      this.addError.set('Could not add item.');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteItem(item: WishlistItem): Promise<void> {
    if (!confirm(`Remove "${item.name}" from your wishlist?`)) return;
    try {
      await this.api.deleteWishlistItem(item.id);
      const v = this.view();
      if (v) this.view.set({ ...v, items: v.items.filter(x => x.id !== item.id) });
    } catch {
      this.addError.set('Could not remove item.');
    }
  }

  async submitCart(): Promise<void> {
    if (!this.canSubmit()) return;
    this.claiming.set(true);
    this.claimError.set('');
    try {
      const useLabel = !this.auth.isAuthenticated() || this.anonymous;
      await this.api.claimWishlistCart({
        claimantLabel: useLabel ? this.claimantLabel.trim() : '',
        items: this.cartLines(),
      });
      this.cart.set(new Map());
      this.claimantLabel = '';
      // Reload to reflect new claim totals.
      const ownerId = this.view()?.ownerUserId;
      if (ownerId) this.view.set(await this.api.getWishlist(ownerId));
    } catch {
      this.claimError.set('Could not claim items. Some may already be taken — try again.');
    } finally {
      this.claiming.set(false);
    }
  }
}
