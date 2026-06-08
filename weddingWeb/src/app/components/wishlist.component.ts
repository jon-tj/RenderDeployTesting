import { Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  imports: [CommonModule, FormsModule, NavbarComponent, DatePipe, RouterLink],
  template: `
    <app-navbar></app-navbar>
    <main class="page">
      @if (loading()) {
        <p class="muted">Loading…</p>
      } @else if (notFound()) {
        <p class="error">Wishlist not found.</p>
      } @else if (view(); as v) {
        <header class="page-head">
          <div class="head-row">
            <h1>{{ headerTitle(v) }}</h1>
            <button type="button" class="primary icon-btn" (click)="share()" [title]="shareLabel()" [attr.aria-label]="shareLabel()">
              <span class="material-icons">{{ shareCopied() ? 'done' : 'share' }}</span>
            </button>
          </div>
          <p class="muted small">
            @if (v.eventId) {
              <a [routerLink]="['/event', v.eventId]">← Back to event</a> ·
            }
            {{ v.canEdit ? 'You can edit this wishlist. Claim counts are visible to you, but not who claimed what.' : 'Pick what you’d like to gift. Add items to your cart, then claim them together.' }}
          </p>
        </header>

        @if (v.canEdit) {
          <section class="card">
            <h2>Add an item</h2>
            <form class="add-form" (ngSubmit)="addItem()">
              <label class="field span-2">
                <span class="field-label">Name</span>
                <input type="text" name="name" [(ngModel)]="draftName" required />
              </label>
              <div class="field-row span-2">
                <label class="field">
                  <span class="field-label">Price</span>
                  <input type="number" name="price" min="0" step="0.01" [(ngModel)]="draftPrice" />
                </label>
                <label class="field">
                  <span class="field-label">Currency</span>
                  <select name="cur" [(ngModel)]="draftCurrency">
                    @for (c of currencies; track c) {
                      <option [value]="c">{{ c }}</option>
                    }
                  </select>
                </label>
                <label class="field">
                  <span class="field-label">Quantity</span>
                  <input type="number" name="qty" min="1" [(ngModel)]="draftQty" />
                </label>
              </div>
              <label class="field span-2">
                <span class="field-label">Link <span class="muted small">(optional)</span></span>
                <input type="url" name="url" placeholder="https://…" [(ngModel)]="draftUrl" />
              </label>
              <label class="field span-2">
                <span class="field-label">Image URL <span class="muted small">(optional)</span></span>
                <input type="url" name="imgurl" placeholder="https://…" [(ngModel)]="draftImageUrl" />
              </label>
              <div class="field span-2">
                <span class="field-label">Upload image <span class="muted small">(optional)</span></span>
                <label class="file-drop">
                  <input type="file" accept="image/*" (change)="onDraftFile($event)" hidden />
                  <span class="material-icons">upload</span>
                  <span>{{ draftFile ? draftFile.name : 'Choose an image…' }}</span>
                </label>
              </div>
              <div class="form-actions span-2">
                <button type="submit" [disabled]="!draftName.trim() || saving()">{{ saving() ? 'Saving…' : 'Add item' }}</button>
              </div>
            </form>
            @if (addError()) { <p class="error small">{{ addError() }}</p> }
          </section>
        }

        <section class="card">
          <div class="cart-header">
            <h2>Items</h2>
            @if (!v.canEdit) {
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
                  @if (itemImageSrc(i); as src) {
                    <img class="item-img" [src]="src" alt="" />
                  }
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
                    </p>
                    @if (v.canEdit && i.claims.length) {
                      <ul class="claims">
                        @for (c of i.claims; track c.id) {
                          <li class="muted small claim-row">
                            <span>{{ c.quantity }}× claimed {{ c.createdAtUtc | date:'short' }}</span>
                            <button type="button" class="ghost small" (click)="completeClaim(c.id)" title="Remove these from your wishlist once you've received them">Mark as complete</button>
                          </li>
                        }
                      </ul>
                    }
                  </div>
                  <div class="item-actions">
                    @if (v.canEdit) {
                      <label class="ghost small file-btn">
                        {{ i.hasUploadedImage ? 'Change image' : 'Upload image' }}
                        <input type="file" accept="image/*" (change)="onItemImage($event, i)" hidden />
                      </label>
                      @if (i.hasUploadedImage) {
                        <button type="button" class="ghost small" (click)="removeItemImage(i)">Remove image</button>
                      }
                      <button type="button" class="ghost small" (click)="deleteItem(i)">Remove</button>
                    }
                    @if (remaining > 0) {
                      @let inCart = cart().get(i.id) ?? 0;
                      @if (inCart === 0) {
                        <button type="button" (click)="adjustCart(i.id, 1, remaining)">
                          <span class="material-icons">add_shopping_cart</span>
                          Add to cart
                        </button>
                      } @else {
                        <div class="cart-controls">
                          <button type="button" class="ghost small" (click)="adjustCart(i.id, -1)">−</button>
                          <span class="qty">{{ inCart }}</span>
                          <button type="button" class="ghost small" (click)="adjustCart(i.id, 1, remaining)" [disabled]="inCart >= remaining">+</button>
                        </div>
                      }
                    } @else {
                      <span class="muted small">Fully claimed</span>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </section>

        @if (v.canEdit) {
          <section class="card">
            <h2>Payment options</h2>
            <p class="muted small">Shown at the bottom of your wishlist so guests can pay you back.</p>
            <div class="row">
              <input type="text" placeholder="Pix key" name="pix" [(ngModel)]="pixDraft" />
              <button type="button" (click)="savePixKey()" [disabled]="pixSaving() || pixDraft.trim() === (v.pixKey ?? '').trim()">
                {{ pixSaving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
            @if (pixError()) { <p class="error small">{{ pixError() }}</p> }
          </section>
        }

        <section #cartSummary class="card cart-summary" [class.empty]="cartCount() === 0">
            <h2>Your cart</h2>
            @if (cartCount() === 0) {
              <p class="muted small">Pick items above to add them to your cart.</p>
            } @else {
              <ul class="muted small">
                @for (line of cartLines(); track line.itemId) {
                  @let it = itemById(line.itemId);
                  @if (it) {
                    <li>{{ line.quantity }}× {{ it.name }} ({{ formatPrice(it.priceMinor * line.quantity, it.currency) }})</li>
                  }
                }
              </ul>
            }
            <p><strong>Total: {{ formatTotal(cartTotalBrl(), displayCurrency) }}</strong></p>
            @if (v.pixKey) {
              <p class="muted small">Pay with Pix: <code>{{ v.pixKey }}</code></p>
            }
            @if (cartCount() > 0) {
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
              }
              <button type="button" (click)="submitCart()" [disabled]="claiming() || !canSubmit()">{{ claiming() ? 'Claiming…' : 'Claim cart' }}</button>
              @if (claimError()) { <p class="error small">{{ claimError() }}</p> }
            }
          </section>
      }
    </main>

    @if (cartCount() > 0 && !cartInView()) {
      <button type="button" class="cart-fab" (click)="scrollToCart()">
        <span class="material-icons">shopping_cart</span>
        <span class="fab-count">{{ cartCount() }}</span>
        <span>Go to cart · {{ formatTotal(cartTotalBrl(), displayCurrency) }}</span>
      </button>
    }
  `,
  styles: [`
    .page { max-width:780px; margin:0 auto; padding:1rem; padding-bottom:5rem; }
    .page-head h1 { margin:0 0 .25rem; }
    .head-row { display:flex; align-items:center; gap:.75rem; justify-content:space-between; flex-wrap:wrap; }
    .primary { background:#6f7a5b; color:#faf5ea; border:0; padding:.5rem .9rem; border-radius:.4rem; cursor:pointer; font:inherit; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; }
    .primary:disabled { opacity:.6; cursor:default; }
    .icon-btn { padding:.35rem; display:inline-flex; align-items:center; justify-content:center; line-height:1; }
    .icon-btn .material-icons { font-size:1.25rem; }
    .card { background:#fff; border-radius:.6rem; padding:1rem 1.1rem; margin-top:1rem; box-shadow:0 1px 2px rgba(0,0,0,.06); }
    .card h2 { margin:0 0 .6rem; font-size:1.1rem; }
    .row { display:flex; gap:.5rem; flex-wrap:wrap; }
    .row input, .row select { flex:1; min-width:120px; }
    .row button { flex:0 0 auto; }
    .add-form { display:grid; grid-template-columns:1fr 1fr; gap:.6rem .75rem; }
    .add-form .span-2 { grid-column:1 / -1; }
    .add-form .field-row { display:grid; grid-template-columns:1fr auto 1fr; gap:.5rem; }
    .add-form .field { display:flex; flex-direction:column; gap:.25rem; margin:0; }
    .add-form .field-label { font-size:.8rem; color:#5a5347; font-weight:500; }
    .add-form input, .add-form select { width:100%; box-sizing:border-box; padding:.45rem .55rem; border:1px solid #e4e4e4; border-radius:.35rem; background:#fafafa; font:inherit; }
    .add-form input:focus, .add-form select:focus { outline:none; border-color:#c9b88a; background:#fff; }
    .file-drop { display:flex; align-items:center; gap:.5rem; padding:.55rem .75rem; border:1px dashed #d9cfb8; border-radius:.4rem; background:#faf7f0; cursor:pointer; color:#5a5347; }
    .file-drop:hover { background:#f1e7cd; }
    .form-actions { display:flex; justify-content:flex-end; }
    @media (max-width:520px) {
      .add-form { grid-template-columns:1fr; }
      .add-form .span-2 { grid-column:1; }
    }
    ul.items { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.6rem; }
    .item { display:flex; gap:.75rem; align-items:flex-start; padding:.65rem .75rem; background:#faf7f0; border-radius:.4rem; }
    .item-img { width:64px; height:64px; object-fit:cover; border-radius:.35rem; flex:0 0 auto; background:#eee; }
    .file-pick { display:flex; align-items:center; gap:.4rem; flex-basis:100%; }
    .item-actions { display:flex; flex-direction:column; gap:.3rem; align-items:flex-end; }
    .item-actions button { display:inline-flex; align-items:center; gap:.3rem; }
    .file-btn { cursor:pointer; }
    .item-main { flex:1; min-width:0; }
    .item-name a { color:#8a6f3a; text-decoration:none; }
    .item-name a:hover { text-decoration:underline; }
    .item.taken .item-name { text-decoration:line-through; opacity:.55; }
    .cart-controls { display:flex; align-items:center; gap:.4rem; }
    .qty { min-width:1.4rem; text-align:center; }
    .cart-header { display:flex; justify-content:space-between; align-items:baseline; gap:1rem; }
    .cart-summary { background:#fff8e6; }
    .cart-summary.empty { background:#faf7f0; }
    .field { display:flex; flex-direction:column; gap:.2rem; margin:.5rem 0; }
    .check { display:flex; align-items:center; gap:.4rem; margin:.5rem 0; }
    .claims { list-style:disc; margin:.25rem 0 0 1.25rem; padding:0; }
    .claim-row { display:flex; align-items:center; gap:.5rem; justify-content:space-between; }
    .error { color:#b03030; }
    .small { font-size:.85rem; }
    .muted { color:#6b6450; }
    code { background:#eee; padding:0 .25rem; border-radius:.2rem; }
    .cart-fab { position:fixed; right:1rem; bottom:1rem; display:inline-flex; align-items:center; gap:.5rem; padding:.7rem 1.1rem; background:#8a6f3a; color:#fff; border:0; border-radius:2rem; font:inherit; font-weight:600; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.18); z-index:60; }
    .cart-fab:hover { background:#6f5a2f; }
    .fab-count { background:#fff; color:#8a6f3a; min-width:1.3rem; height:1.3rem; padding:0 .35rem; border-radius:1rem; display:inline-flex; align-items:center; justify-content:center; font-size:.8rem; }
    @media (max-width:600px) {
      .cart-fab { left:50%; right:auto; transform:translateX(-50%); }
    }
  `],
})
export class WishlistComponent implements OnInit, OnDestroy {
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
  protected readonly pixSaving = signal(false);
  protected readonly pixError = signal('');
  protected readonly shareLabel = signal('Share');
  protected readonly shareCopied = signal(false);
  protected readonly cartInView = signal(true);

  protected readonly cartSummaryRef = viewChild<ElementRef<HTMLElement>>('cartSummary');

  protected readonly cart = signal<Map<number, number>>(new Map());
  protected readonly cartCount = computed(() =>
    Array.from(this.cart().values()).reduce((s, q) => s + q, 0));
  protected readonly cartLines = computed<CartLine[]>(() =>
    Array.from(this.cart().entries()).map(([itemId, quantity]) => ({ itemId, quantity })));

  protected readonly canEdit = computed(() => this.view()?.canEdit ?? false);

  protected rates: Record<WishlistCurrency, number> = { ...FALLBACK_TO_BRL };

  protected displayCurrency: WishlistCurrency = 'BRL';
  protected draftName = '';
  protected draftPrice: number | null = null;
  protected draftCurrency: WishlistCurrency = 'BRL';
  protected draftQty = 1;
  protected draftUrl = '';
  protected draftPix = '';
  protected draftImageUrl = '';
  protected draftFile: File | null = null;
  protected claimantLabel = '';
  protected anonymous = false;
  protected pixDraft = '';

  private observer: IntersectionObserver | null = null;
  private observed: HTMLElement | null = null;

  constructor() {
    // The cart summary lives inside @if blocks, so its DOM element appears
    // only once the wishlist data loads. React to the viewChild signal so the
    // observer attaches as soon as the element exists.
    effect(() => {
      const ref = this.cartSummaryRef();
      queueMicrotask(() => this.refreshObserver(ref?.nativeElement ?? null));
    });
  }

  protected headerTitle(v: WishlistView): string {
    const name = v.ownerDisplayName || 'Wishlist';
    return v.eventId ? `Wishlist for ${name}` : `${name}’s wishlist`;
  }

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.paramMap;
    // Routes: /wishlist/event/:eventId, /wishlist/user/:userId
    try {
      this.rates = await this.api.getWishlistRates();
    } catch { /* fallback already set */ }
    try {
      let view: WishlistView;
      if (params.has('eventId')) {
        const eid = Number(params.get('eventId'));
        if (!Number.isFinite(eid) || eid <= 0) { this.notFound.set(true); return; }
        view = await this.api.getEventWishlist(eid);
      } else if (params.has('userId')) {
        view = await this.api.getUserWishlist(params.get('userId')!);
      } else {
        this.notFound.set(true);
        return;
      }
      this.view.set(view);
      this.pixDraft = view.pixKey ?? '';
    } catch {
      this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private refreshObserver(el: HTMLElement | null): void {
    if (el === this.observed) return;
    this.observer?.disconnect();
    this.observed = el;
    if (!el || typeof IntersectionObserver === 'undefined') {
      this.cartInView.set(true);
      return;
    }
    this.observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          this.cartInView.set(entry.isIntersecting);
        }
      },
      { rootMargin: '0px 0px -80px 0px', threshold: 0.01 },
    );
    this.observer.observe(el);
  }

  protected scrollToCart(): void {
    const el = this.cartSummaryRef()?.nativeElement;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async share(): Promise<void> {
    const v = this.view();
    if (!v) return;
    let path = '/wishlist';
    if (v.eventId) path = `/wishlist/event/${v.eventId}`;
    else if (v.ownerUserId) path = `/wishlist/user/${encodeURIComponent(v.ownerUserId)}`;
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      this.shareLabel.set('Link copied');
      this.shareCopied.set(true);
    } catch {
      this.shareLabel.set('Copy: ' + url);
    }
    setTimeout(() => { this.shareLabel.set('Share'); this.shareCopied.set(false); }, 2500);
  }

  async savePixKey(): Promise<void> {
    const v = this.view();
    if (!v) return;
    this.pixSaving.set(true);
    this.pixError.set('');
    try {
      const updated = await this.api.updateWishlistPayment({
        eventId: v.eventId ?? undefined,
        ownerUserId: v.ownerUserId ?? undefined,
        pixKey: this.pixDraft.trim(),
      });
      this.view.set(updated);
      this.pixDraft = updated.pixKey ?? '';
    } catch {
      this.pixError.set('Could not save payment options.');
    } finally {
      this.pixSaving.set(false);
    }
  }

  async completeClaim(claimId: number): Promise<void> {
    if (!confirm('Mark this claim as complete? The claimed quantity will be removed from your wishlist.')) return;
    try {
      await this.api.completeWishlistClaim(claimId);
      await this.reloadView();
    } catch {
      this.addError.set('Could not mark the claim as complete.');
    }
  }

  private async reloadView(): Promise<void> {
    const v = this.view();
    if (!v) return;
    let fresh: WishlistView | null = null;
    if (v.eventId) fresh = await this.api.getEventWishlist(v.eventId);
    else if (v.ownerUserId) fresh = await this.api.getUserWishlist(v.ownerUserId);
    if (fresh) {
      this.view.set(fresh);
      this.pixDraft = fresh.pixKey ?? '';
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
    if (this.auth.isAuthenticated()) return true;
    return this.claimantLabel.trim().length > 0;
  }

  async addItem(): Promise<void> {
    if (!this.draftName.trim()) return;
    const v = this.view();
    if (!v) return;
    this.saving.set(true);
    this.addError.set('');
    try {
      let item = await this.api.createWishlistItem({
        eventId: v.eventId ?? undefined,
        ownerUserId: v.ownerUserId ?? undefined,
        name: this.draftName.trim(),
        priceMinor: Math.round((this.draftPrice ?? 0) * 100),
        currency: this.draftCurrency,
        wishedQuantity: Math.max(1, this.draftQty || 1),
        url: this.draftUrl.trim(),
        imageUrl: this.draftImageUrl.trim(),
      });
      if (this.draftFile) {
        try { item = await this.api.uploadWishlistImage(item.id, this.draftFile); }
        catch { this.addError.set('Item added, but image upload failed.'); }
      }
      const fresh = this.view();
      if (fresh) this.view.set({ ...fresh, items: [...fresh.items, item] });
      this.draftName = ''; this.draftPrice = null; this.draftQty = 1; this.draftUrl = '';
      this.draftImageUrl = ''; this.draftFile = null;
    } catch {
      this.addError.set('Could not add item.');
    } finally {
      this.saving.set(false);
    }
  }

  protected onDraftFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.draftFile = input.files && input.files.length ? input.files[0] : null;
  }

  protected itemImageSrc(i: WishlistItem): string | null {
    if (i.hasUploadedImage) return this.api.wishlistImageUrl(i.id);
    if (i.imageUrl) return i.imageUrl;
    return null;
  }

  async onItemImage(ev: Event, item: WishlistItem): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files.length ? input.files[0] : null;
    input.value = '';
    if (!file) return;
    try {
      const updated = await this.api.uploadWishlistImage(item.id, file);
      this.replaceItem(updated);
    } catch {
      this.addError.set('Could not upload image.');
    }
  }

  async removeItemImage(item: WishlistItem): Promise<void> {
    try {
      const updated = await this.api.deleteWishlistImage(item.id);
      this.replaceItem(updated);
    } catch {
      this.addError.set('Could not remove image.');
    }
  }

  private replaceItem(updated: WishlistItem): void {
    const v = this.view();
    if (!v) return;
    this.view.set({ ...v, items: v.items.map(x => x.id === updated.id ? updated : x) });
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
      await this.reloadView();
    } catch {
      this.claimError.set('Could not claim items. Some may already be taken — try again.');
    } finally {
      this.claiming.set(false);
    }
  }
}
