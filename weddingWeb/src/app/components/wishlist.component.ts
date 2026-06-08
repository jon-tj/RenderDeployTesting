import { Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { HubApi } from '../services/hub-api.service';
import { AuthService } from '../services/auth.service';
import { I18nService } from '../services/i18n.service';
import { WISHLIST_CURRENCIES, WishlistClaimMode, WishlistCurrency, WishlistItem, WishlistView } from '../models';

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
  imports: [FormsModule, NavbarComponent, RouterLink],
  template: `
    <app-navbar></app-navbar>
    <main class="page">
      @if (loading()) {
        <p class="muted">{{ t('wishlist.loading') }}</p>
      } @else if (notFound()) {
        <p class="error">{{ t('wishlist.notFound') }}</p>
      } @else if (view(); as v) {
        <header class="page-head">
          <div class="head-row">
            <h1>{{ headerTitle(v) }}</h1>
            <div class="head-actions">
              @if (v.canEdit) {
                <button type="button" class="primary icon-btn" (click)="toggleOwnerView()"
                        [title]="t(previewingAsGuest() ? 'wishlist.backToOwner' : 'wishlist.previewGuest')"
                        [attr.aria-label]="t(previewingAsGuest() ? 'wishlist.backToOwner' : 'wishlist.previewGuest')">
                  <span class="material-icons">{{ previewingAsGuest() ? 'edit' : 'visibility' }}</span>
                </button>
              }
              <button type="button" class="primary icon-btn" (click)="share()" [title]="shareLabel() || t('wishlist.share')" [attr.aria-label]="shareLabel() || t('wishlist.share')">
                <span class="material-icons">{{ shareCopied() ? 'done' : 'share' }}</span>
              </button>
            </div>
          </div>
          <p class="muted small">
            @if (v.eventId) {
              <a [routerLink]="['/event', v.eventId]">{{ t('wishlist.backToEvent') }}</a> ·
            }
            {{ canEdit() ? t('wishlist.subtitleOwner') : t('wishlist.subtitleGuest') }}
          </p>
        </header>

        @if (canEdit()) {
          <section class="card">
            <h2>Wishlist options</h2>
            <p class="muted small">Settings for your wishlist as a whole.</p>
            <form class="add-form" (ngSubmit)="saveOptions()">
              <label class="field span-2">
                <span class="field-label">Pix key <span class="muted small">(shown to guests so they can pay you back)</span></span>
                <input type="text" name="pix" placeholder="email, CPF, phone or random key" [(ngModel)]="pixDraft" />
              </label>
              <label class="field span-2">
                <span class="field-label">Claims</span>
                <select name="claimmode" [(ngModel)]="claimModeDraft">
                  <option value="LimitedQuantities">Limited quantities — guests see counts and pick how many to claim</option>
                  <option value="UnlimitedQuantities">Unlimited quantities — guests claim without seeing counts</option>
                  <option value="Disabled">Disabled — guests can browse but not claim</option>
                </select>
              </label>
              <div class="form-actions span-2">
                <button type="submit" class="primary" [disabled]="pixSaving() || !optionsDirty(v)">
                  {{ pixSaving() ? 'Saving…' : 'Save' }}
                </button>
              </div>
            </form>
            @if (pixError()) { <p class="error small">{{ pixError() }}</p> }
          </section>
        }

        @if (canEdit()) {
          <section class="card">
            <h2>Add an item</h2>
            <form class="add-form" (ngSubmit)="addItem()">
              <label class="field span-2">
                <span class="field-label">Name</span>
                <input type="text" name="name" [(ngModel)]="draftName" required />
              </label>
              <div class="field-row span-2" [class.no-qty]="claimModeDraft !== 'LimitedQuantities'">
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
                @if (claimModeDraft === 'LimitedQuantities') {
                  <label class="field">
                    <span class="field-label">Quantity</span>
                    <input type="number" name="qty" min="1" [(ngModel)]="draftQty" />
                  </label>
                }
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
                <button type="submit" class="primary" [disabled]="!draftName.trim() || saving()">{{ saving() ? 'Saving…' : 'Add item' }}</button>
              </div>
            </form>
            @if (addError()) { <p class="error small">{{ addError() }}</p> }
          </section>
        }

        @if (!canEdit() && v.items.length) {
          <div class="items-toolbar">
            <div class="currency-toggle">
              <span class="material-icons">payments</span>
              <span class="currency-value">{{ displayCurrency }}</span>
              <span class="material-icons chev">expand_more</span>
              <select [(ngModel)]="displayCurrency" name="dispcur" aria-label="Display currency">
                @for (c of currencies; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
            </div>
          </div>
        }
        @if (!v.items.length) {
          <p class="muted">{{ t('wishlist.noItems') }}</p>
        } @else {
          <ul class="items">
              @for (i of v.items; track i.id) {
                @let remaining = i.wishedQuantity - i.claimedQuantity;
                @let inCart = cart().get(i.id) ?? 0;
                <li class="item" [class.taken]="v.claimMode === 'LimitedQuantities' && remaining <= 0">
                  @if (itemImageSrc(i); as src) {
                    <div class="item-img-wrap">
                      <img class="item-img" [src]="src" alt="" />
                      @if (canEdit()) {
                        <label class="img-edit" title="Change image">
                          <span class="material-icons">edit</span>
                          <input type="file" accept="image/*" (change)="onItemImage($event, i)" hidden />
                        </label>
                      }
                    </div>
                  } @else if (canEdit()) {
                    <label class="item-img-wrap empty" title="Upload image">
                      <span class="material-icons big-plus">add_a_photo</span>
                      <input type="file" accept="image/*" (change)="onItemImage($event, i)" hidden />
                    </label>
                  } @else {
                    <div class="item-img-wrap placeholder"></div>
                  }
                  <div class="item-body">
                    <div class="item-name">
                      @if (i.url) {
                        <a [href]="i.url" target="_blank" rel="noopener">{{ i.name }}</a>
                      } @else {
                        <strong>{{ i.name }}</strong>
                      }
                    </div>
                    <div class="item-meta muted small">
                      @if (i.priceMinor > 0) { <span>{{ formatPriceIn(i.priceMinor, i.currency, displayCurrency) }}</span> }
                      @if (v.claimMode === 'LimitedQuantities') {
                        <span>{{ t('wishlist.claimedOfTotal', { claimed: i.claimedQuantity, total: i.wishedQuantity }) }}</span>
                      } @else if (v.claimMode === 'UnlimitedQuantities' && i.claimedQuantity > 0) {
                        <span>{{ t('wishlist.claimedCount', { claimed: i.claimedQuantity }) }}</span>
                      }
                    </div>
                    @if (i.description) { <p class="muted small desc">{{ i.description }}</p> }
                  </div>
                  <div class="item-actions">
                    @if (v.claimMode !== 'Disabled' && (v.claimMode === 'UnlimitedQuantities' || remaining > 0)) {
                      @if (inCart === 0) {
                        <button type="button" class="primary-btn" (click)="adjustCart(i.id, 1, v.claimMode === 'LimitedQuantities' ? remaining : undefined)" [title]="t('wishlist.addToCart')" [attr.aria-label]="t('wishlist.addToCart')">
                          <span class="material-icons">add_shopping_cart</span>
                        </button>
                      } @else {
                        <div class="cart-controls">
                          <button type="button" class="ghost small" (click)="adjustCart(i.id, -1)">−</button>
                          <span class="qty">{{ inCart }}</span>
                          <button type="button" class="ghost small" (click)="adjustCart(i.id, 1, v.claimMode === 'LimitedQuantities' ? remaining : undefined)" [disabled]="v.claimMode === 'LimitedQuantities' && inCart >= remaining">+</button>
                        </div>
                      }
                    } @else if (v.claimMode !== 'Disabled') {
                      <span class="muted small">{{ t('wishlist.fullyClaimed') }}</span>
                    }
                    @if (canEdit()) {
                      <button type="button" class="remove-btn" (click)="deleteItem(i)" title="Remove from wishlist" aria-label="Remove">
                        <span class="material-icons">delete_outline</span>
                      </button>
                    }
                  </div>
                </li>
              }
            </ul>
        }

        @if (v.claimMode !== 'Disabled') {
        <section #cartSummary class="card cart-summary" [class.empty]="cartCount() === 0">
            <h2>{{ t('wishlist.cart.title') }}</h2>
            @if (cartCount() === 0) {
              <p class="muted small">{{ t('wishlist.cart.empty') }}</p>
            } @else {
              <ul class="cart-lines">
                @for (line of cartLines(); track line.itemId) {
                  @let it = itemById(line.itemId);
                  @if (it) {
                    <li>
                      <span class="cart-qty">{{ line.quantity }}×</span>
                      <span class="cart-name">{{ it.name }}</span>
                      <span class="cart-line-total muted small">{{ formatPriceIn(it.priceMinor * line.quantity, it.currency, displayCurrency) }}</span>
                    </li>
                  }
                }
              </ul>
              <div class="cart-total-row">
                <span>{{ t('wishlist.cart.total') }}</span>
                <strong>{{ formatTotal(cartTotalBrl(), displayCurrency) }}</strong>
              </div>
            }
            @if (v.pixKey) {
              <div class="pix-pill">
                <span class="material-icons">qr_code_2</span>
                <div>
                  <div class="muted small">{{ t('wishlist.cart.payWithPix') }}</div>
                  <code>{{ v.pixKey }}</code>
                </div>
              </div>
            }
            @if (cartCount() > 0) {
              <form class="add-form cart-form" (ngSubmit)="submitCart()">
                @if (!auth.isAuthenticated()) {
                  <label class="field span-2">
                    <span class="field-label">{{ t('wishlist.cart.yourName') }} <span class="muted small">{{ t('wishlist.cart.yourNameHint') }}</span></span>
                    <input type="text" name="label" [(ngModel)]="claimantLabel" />
                  </label>
                } @else {
                  <label class="check span-2">
                    <input type="checkbox" name="anon" [(ngModel)]="anonymous" />
                    {{ t('wishlist.cart.anon') }}
                  </label>
                }
                <div class="form-actions span-2">
                  <button type="submit" class="primary-btn" [disabled]="claiming() || !canSubmit()">{{ claiming() ? t('wishlist.cart.claiming') : t('wishlist.cart.claim') }}</button>
                </div>
              </form>
              @if (claimError()) { <p class="error small">{{ claimError() }}</p> }
            }
          </section>
        }
      }
    </main>

    @if (view()?.claimMode !== 'Disabled' && cartCount() > 0 && !cartInView()) {
      <button type="button" class="cart-fab" (click)="scrollToCart()">
        <span class="material-icons">shopping_cart</span>
        <span class="fab-count">{{ cartCount() }}</span>
        <span class="fab-total">{{ formatTotalCompact(cartTotalBrl(), displayCurrency) }}</span>
      </button>
    }
  `,
  styles: [`
    .page { max-width:780px; padding-bottom:5rem; }
    .head-row { display:flex; align-items:center; gap:.75rem; justify-content:space-between; flex-wrap:wrap; }
    .add-form { display:grid; grid-template-columns:1fr 1fr; gap:.6rem .75rem; }
    .add-form .span-2 { grid-column:1 / -1; }
    .add-form .field-row { display:grid; grid-template-columns:1fr auto 1fr; gap:.5rem; }
    .add-form .field-row.no-qty { grid-template-columns:1fr auto; }
    .add-form .field { display:flex; flex-direction:column; gap:.25rem; }
    .add-form .field-label { font-size:.8rem; color:var(--ink-soft); }
    .add-form input:not([type=checkbox]), .add-form select { width:100%; box-sizing:border-box; padding:.45rem .55rem; border:1px solid var(--rule-soft); border-radius:.35rem; background:var(--bg); font:inherit; }
    .file-drop { display:flex; align-items:center; gap:.5rem; padding:.55rem .75rem; border:1px dashed var(--rule-soft); border-radius:var(--r); background:var(--bg); cursor:pointer; color:var(--ink-soft); }
    .form-actions { display:flex; justify-content:flex-end; }
    @media (max-width:520px) { .add-form, .add-form .span-2 { grid-template-columns:1fr; grid-column:1; } }

    ul.items { list-style:none; margin:1rem 0 0; padding:0; display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:.6rem; }
    .items-toolbar { display:flex; justify-content:flex-end; margin:1rem 0 .35rem; }
    .currency-toggle { position:relative; display:inline-flex; align-items:center; gap:.4rem; padding:.35rem .65rem; background:var(--bg-card); border:1px solid var(--gold-pale); border-radius:999px; color:var(--gold); font-size:.85rem; cursor:pointer; }
    .currency-toggle select { position:absolute; inset:0; opacity:0; cursor:pointer; border:0; font:inherit; }
    .currency-value { color:var(--ink); font-weight:600; }

    .item { display:flex; flex-direction:column; background:var(--bg-card); border-radius:.5rem; overflow:hidden; border:1px solid var(--gold-pale); position:relative; }
    .item-img-wrap { position:relative; width:100%; aspect-ratio:1/1; background:var(--accent-soft); display:flex; align-items:center; justify-content:center; }
    .item-img-wrap.empty { cursor:pointer; color:var(--gold); }
    .big-plus { font-size:3rem !important; opacity:.7; }
    .item-img { width:100%; height:100%; object-fit:cover; }
    .img-edit { position:absolute; bottom:.35rem; right:.35rem; background:rgba(255,255,255,.92); border-radius:50%; width:1.85rem; height:1.85rem; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink-soft); }
    .item-body { padding:.7rem .85rem .45rem; display:flex; flex-direction:column; gap:.3rem; flex:1; }
    .item-name a { color:var(--gold); text-decoration:none; }
    .item-meta { display:flex; flex-wrap:wrap; gap:.5rem; }
    .item.taken .item-name { text-decoration:line-through; opacity:.55; }
    .item-actions { padding:.5rem .85rem .85rem; display:flex; flex-direction:column; gap:.4rem; }
    .primary-btn { display:inline-flex; align-items:center; justify-content:center; gap:.4rem; padding:.55rem 1rem; background:var(--accent); color:var(--accent-ink); border:0; border-radius:999px; cursor:pointer; font:inherit; font-weight:600; }
    .primary-btn:disabled { opacity:.6; cursor:default; }

    .cart-lines { list-style:none; margin:0 0 .5rem; padding:0; display:flex; flex-direction:column; gap:.3rem; }
    .cart-lines li { display:grid; grid-template-columns:2.25rem 1fr auto; gap:.5rem; align-items:baseline; }
    .cart-qty { font-weight:600; color:var(--accent); text-align:right; }
    .cart-total-row { display:flex; justify-content:space-between; padding:.55rem .25rem .25rem; border-top:1px dashed var(--rule-soft); margin-top:.25rem; }
    .pix-pill { display:flex; align-items:center; gap:.6rem; padding:.55rem .75rem; background:var(--bg-card); border:1px dashed var(--rule-soft); border-radius:var(--r); margin:.5rem 0; }
    .pix-pill .material-icons { font-size:1.8rem; color:var(--accent); }

    .remove-btn { position:absolute; top:.4rem; left:.4rem; width:1.85rem; height:1.85rem; padding:0; background:rgba(255,255,255,.92); border:0; border-radius:50%; color:#9b6b6b; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; z-index:2; }

    .cart-controls { display:flex; align-items:center; justify-content:space-between; gap:.4rem; height:2.15rem; background:var(--bg); border-radius:999px; padding:.15rem .35rem; }
    .cart-controls button { flex:0 0 auto; width:1.85rem; height:1.85rem; padding:0; border:0; background:transparent; color:var(--ink-soft); border-radius:50%; cursor:pointer; line-height:1; display:inline-flex; align-items:center; justify-content:center; }
    .cart-controls button:disabled { opacity:.35; cursor:default; }
    .qty { min-width:1.4rem; text-align:center; font-weight:600; }
    .cart-form .form-actions { justify-content:center; }

    .cart-fab { position:fixed; right:1rem; bottom:1rem; display:inline-flex; align-items:center; gap:.5rem; padding:.7rem 1.2rem; background:var(--gold); color:#fff; border:0; border-radius:2rem; font:inherit; font-weight:600; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.18); z-index:60; }
    .fab-count { background:#fff; color:var(--gold); min-width:1.3rem; padding:0 .35rem; border-radius:1rem; display:inline-flex; align-items:center; justify-content:center; font-size:.8rem; }
    @media (max-width:600px) { .cart-fab { left:50%; right:auto; transform:translateX(-50%); } }
  `],
})
export class WishlistComponent implements OnInit, OnDestroy {
  private readonly api = inject(HubApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);
  protected readonly t = (k: string, p?: Record<string, string | number>) => this.i18n.t(k, p);

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
  protected readonly shareLabel = signal('');
  protected readonly shareCopied = signal(false);
  protected readonly cartInView = signal(true);
  protected readonly imageVersions = signal<Map<number, number>>(new Map());
  // null = default to owner status from view; true/false once user toggles.
  protected readonly ownerViewOverride = signal<boolean | null>(null);

  protected readonly cartSummaryRef = viewChild<ElementRef<HTMLElement>>('cartSummary');

  protected readonly cart = signal<Map<number, number>>(new Map());
  protected readonly cartCount = computed(() =>
    Array.from(this.cart().values()).reduce((s, q) => s + q, 0));
  protected readonly cartLines = computed<CartLine[]>(() =>
    Array.from(this.cart().entries()).map(([itemId, quantity]) => ({ itemId, quantity })));

  protected readonly canEdit = computed(() => {
    const isOwner = this.view()?.canEdit ?? false;
    if (!isOwner) return false;
    const override = this.ownerViewOverride();
    return override ?? true;
  });
  // Owner viewing as a guest? Used to render the preview toggle.
  protected readonly previewingAsGuest = computed(() =>
    (this.view()?.canEdit ?? false) && this.ownerViewOverride() === false);
  protected toggleOwnerView(): void {
    this.ownerViewOverride.set(!this.canEdit());
  }

  protected rates: Record<WishlistCurrency, number> = { ...FALLBACK_TO_BRL };

  protected displayCurrency: WishlistCurrency = 'BRL';
  protected draftName = '';
  protected draftPrice: number | null = null;
  protected draftCurrency: WishlistCurrency = 'BRL';
  protected draftQty = 1;
  protected draftUrl = '';
  protected draftImageUrl = '';
  protected draftFile: File | null = null;
  protected claimantLabel = '';
  protected anonymous = false;
  protected pixDraft = '';
  protected claimModeDraft: WishlistClaimMode = 'LimitedQuantities';

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
    const name = v.ownerDisplayName || this.t('wishlist.fallbackName');
    return this.t(v.eventId ? 'wishlist.titleFor' : 'wishlist.titleOwn', { name });
  }

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.paramMap;
    try {
      this.rates = await this.api.getWishlistRates();
    } catch { /* fallback already set */ }
    try {
      const id = Number(params.get('id'));
      if (!Number.isFinite(id) || id <= 0) { this.notFound.set(true); return; }
      const view = await this.api.getWishlist(id);
      this.view.set(view);
      this.syncOptionDrafts(view);
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
    const url = `${window.location.origin}/wishlist/${v.id}`;
    try {
      await navigator.clipboard.writeText(url);
      this.shareLabel.set(this.t('wishlist.linkCopied'));
      this.shareCopied.set(true);
    } catch {
      this.shareLabel.set('Copy: ' + url);
    }
    setTimeout(() => { this.shareLabel.set(this.t('wishlist.share')); this.shareCopied.set(false); }, 2500);
  }

  async saveOptions(): Promise<void> {
    const v = this.view();
    if (!v) return;
    this.pixSaving.set(true);
    this.pixError.set('');
    try {
      const updated = await this.api.updateWishlistOptions(v.id, {
        pixKey: this.pixDraft.trim(),
        claimMode: this.claimModeDraft,
      });
      this.view.set(updated);
      this.syncOptionDrafts(updated);
    } catch {
      this.pixError.set('Could not save wishlist options.');
    } finally {
      this.pixSaving.set(false);
    }
  }

  protected optionsDirty(v: WishlistView): boolean {
    return this.pixDraft.trim() !== (v.pixKey ?? '').trim()
      || this.claimModeDraft !== v.claimMode;
  }

  private syncOptionDrafts(v: WishlistView): void {
    this.pixDraft = v.pixKey ?? '';
    this.claimModeDraft = v.claimMode;
  }


  private async reloadView(): Promise<void> {
    const v = this.view();
    if (!v) return;
    const fresh = await this.api.getWishlist(v.id);
    this.view.set(fresh);
    this.syncOptionDrafts(fresh);
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

  protected formatPriceIn(minor: number, source: WishlistCurrency, target: WishlistCurrency): string {
    if (source === target) return this.fmt(minor / 100, target);
    const brl = (minor / 100) * (this.rates[source] ?? 1);
    return this.fmt(this.fromBrl(brl, target), target);
  }

  protected cartTotalBrl(): number {
    let total = 0;
    for (const [itemId, qty] of this.cart()) {
      const it = this.itemById(itemId);
      if (it) total += (it.priceMinor / 100) * qty * (this.rates[it.currency] ?? 1);
    }
    return total;
  }

  protected formatTotal(brl: number, target: WishlistCurrency): string {
    return this.fmt(this.fromBrl(brl, target), target);
  }

  protected formatTotalCompact(brl: number, target: WishlistCurrency): string {
    const a = this.fromBrl(brl, target);
    const r = Math.round(a);
    const text = Math.abs(a - r) < 0.005 ? `${r}` : a.toFixed(2);
    return `${text} ${target}`;
  }

  private fromBrl(brl: number, target: WishlistCurrency): number {
    const f = this.rates[target] ?? 1;
    return f === 0 ? brl : brl / f;
  }
  private fmt(amount: number, cur: WishlistCurrency): string { return `${amount.toFixed(2)} ${cur}`; }

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
      let item = await this.api.createWishlistItem(v.id, {
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
    if (i.hasUploadedImage) {
      const v = this.imageVersions().get(i.id);
      const base = this.api.wishlistImageUrl(i.id);
      return v ? `${base}?v=${v}` : base;
    }
    if (i.imageUrl) return i.imageUrl;
    return null;
  }

  private bumpImageVersion(itemId: number): void {
    const next = new Map(this.imageVersions());
    next.set(itemId, Date.now());
    this.imageVersions.set(next);
  }

  async onItemImage(ev: Event, item: WishlistItem): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files.length ? input.files[0] : null;
    input.value = '';
    if (!file) return;
    try {
      const updated = await this.api.uploadWishlistImage(item.id, file);
      this.bumpImageVersion(updated.id);
      this.replaceItem(updated);
    } catch {
      this.addError.set('Could not upload image.');
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
