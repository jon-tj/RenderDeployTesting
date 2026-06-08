import { Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
  imports: [CommonModule, FormsModule, NavbarComponent, DatePipe, RouterLink],
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
                <button type="submit" [disabled]="pixSaving() || !optionsDirty(v)">
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
                <button type="submit" [disabled]="!draftName.trim() || saving()">{{ saving() ? 'Saving…' : 'Add item' }}</button>
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
    .page { max-width:780px; margin:0 auto; padding:1rem; padding-bottom:5rem; }
    .page-head h1 { margin:0 0 .25rem; }
    .head-row { display:flex; align-items:center; gap:.75rem; justify-content:space-between; flex-wrap:wrap; }
    .head-actions { display:inline-flex; align-items:center; gap:.4rem; }
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
    .add-form .field-row.no-qty { grid-template-columns:1fr auto; }
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
    ul.items { list-style:none; margin:1rem 0 0; padding:0; display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:.6rem; }
    .items-toolbar { display:flex; justify-content:flex-end; margin:1rem 0 .35rem; }
    .currency-toggle { position:relative; display:inline-flex; align-items:center; gap:.4rem; padding:.35rem .55rem .35rem .65rem; background:#fff; border:1px solid #e3d6b3; border-radius:999px; box-shadow:0 1px 2px rgba(0,0,0,.04); color:#6b5a32; font-size:.85rem; line-height:1; cursor:pointer; transition:border-color .15s, box-shadow .15s; }
    .currency-toggle:hover, .currency-toggle:focus-within { border-color:#c9b87a; box-shadow:0 2px 6px rgba(0,0,0,.08); }
    .currency-toggle .material-icons { font-size:1rem; color:#8a6f3a; }
    .currency-toggle .chev { margin-left:-.15rem; }
    .currency-toggle-label { color:#6b5a32; }
    .currency-value { color:#3b2f10; font-weight:600; }
    .currency-toggle select { position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; border:0; padding:0; margin:0; font:inherit; }
    .item { display:flex; flex-direction:column; padding:0; background:#fff; border-radius:.5rem; overflow:hidden; border:1px solid #eee3c8; box-shadow:0 1px 2px rgba(0,0,0,.05); position:relative; }
    .item-img-wrap { position:relative; width:100%; aspect-ratio:1/1; background:#eee; display:flex; align-items:center; justify-content:center; cursor:default; }
    .item-img-wrap.empty, .item-img-wrap.placeholder { background:#f1e7cd; }
    .item-img-wrap.empty { cursor:pointer; color:#8a6f3a; border-bottom:1px dashed #d9cfb8; }
    .item-img-wrap.empty:hover { background:#e9dab2; }
    .big-plus { font-size:3rem !important; opacity:.7; }
    .item-img { width:100%; height:100%; object-fit:cover; display:block; }
    .img-edit { position:absolute; bottom:.35rem; right:.35rem; background:rgba(255,255,255,.92); border-radius:50%; width:1.85rem; height:1.85rem; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.2); color:#5a5347; }
    .img-edit:hover { background:#fff; }
    .img-edit .material-icons { font-size:1.05rem; }
    .item-body { padding:.7rem .85rem .45rem; display:flex; flex-direction:column; gap:.3rem; flex:1; min-width:0; }
    .item-name { font-size:.95rem; line-height:1.2; overflow-wrap:anywhere; }
    .item-name a { color:#8a6f3a; text-decoration:none; }
    .item-name a:hover { text-decoration:underline; }
    .item-meta { display:flex; flex-wrap:wrap; gap:.5rem; }
    .item-body .desc { margin:.15rem 0 0; }
    .item.taken .item-name { text-decoration:line-through; opacity:.55; }
    .item-actions { padding:.5rem .85rem .85rem; display:flex; flex-direction:column; gap:.4rem; align-items:stretch; }
    .item-actions .primary-btn { display:inline-flex; align-items:center; justify-content:center; gap:.35rem; height:2.15rem; padding:0 .6rem; background:#6f7a5b; color:#faf5ea; border:0; border-radius:999px; cursor:pointer; font:inherit; font-weight:600; box-sizing:border-box; }
    .primary-btn { display:inline-flex; align-items:center; justify-content:center; gap:.4rem; padding:.55rem 1rem; background:#6f7a5b; color:#faf5ea; border:0; border-radius:.4rem; cursor:pointer; font:inherit; font-weight:600; }
    .primary-btn:disabled { opacity:.6; cursor:default; }
    .cart-lines { list-style:none; margin:0 0 .5rem; padding:0; display:flex; flex-direction:column; gap:.3rem; }
    .cart-lines li { display:grid; grid-template-columns:2.25rem 1fr auto; gap:.5rem; align-items:baseline; padding:.25rem 0; }
    .cart-qty { font-weight:600; color:#6f7a5b; text-align:right; }
    .cart-name { overflow-wrap:anywhere; }
    .cart-total-row { display:flex; justify-content:space-between; align-items:baseline; padding:.55rem .25rem .25rem; border-top:1px dashed #e4d8b5; margin-top:.25rem; font-size:1.05rem; }
    .pix-pill { display:flex; align-items:center; gap:.6rem; padding:.55rem .75rem; background:#fff; border:1px dashed #d9cfb8; border-radius:.4rem; margin:.5rem 0; }
    .pix-pill .material-icons { font-size:1.8rem; color:#6f7a5b; }
    .pix-pill code { background:transparent; padding:0; font-size:.95rem; }
    .cart-form { margin-top:.25rem; }
    .item-actions .primary-btn:disabled { opacity:.6; cursor:default; }
    .item-actions button { display:inline-flex; align-items:center; justify-content:center; gap:.3rem; }
    .remove-btn { position:absolute; top:.4rem; left:.4rem; width:1.85rem; height:1.85rem; padding:0; background:rgba(255,255,255,.92); border:0; border-radius:50%; color:#9b6b6b; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,.2); z-index:2; }
    .remove-btn:hover { background:#fff; color:#b03030; }
    .remove-btn .material-icons { font-size:1.1rem; }
    .cart-controls { display:flex; align-items:center; justify-content:space-between; gap:.4rem; height:2.15rem; box-sizing:border-box; background:#f5f5f5; border:0; border-radius:999px; padding:.15rem .35rem; }
    .cart-controls button { flex:0 0 auto; width:1.85rem; height:1.85rem; padding:0; border:0; background:transparent; color:#5a5347; border-radius:50%; cursor:pointer; font-size:1.05rem; line-height:1; display:inline-flex; align-items:center; justify-content:center; }
    .cart-controls button:hover:not(:disabled) { background:rgba(0,0,0,.06); }
    .cart-controls button:disabled { opacity:.35; cursor:default; }
    .qty { min-width:1.4rem; text-align:center; font-weight:600; }
    .cart-header { display:flex; justify-content:space-between; align-items:baseline; gap:1rem; }
    .cart-summary { background:#fff; }
    .cart-summary.empty { background:#fff; }
    .field { display:flex; flex-direction:column; gap:.2rem; margin:.5rem 0; }
    .check { display:flex; align-items:center; gap:.5rem; margin:0; padding:.25rem 0; cursor:pointer; }
    .check input[type="checkbox"] { width:auto; margin:0; }
    .cart-form .form-actions { justify-content:center; }
    @media (max-width:520px) {
      .cart-form .form-actions { justify-content:stretch; }
      .cart-form .form-actions .primary-btn { width:100%; }
    }
    .claims { list-style:disc; margin:.25rem 0 0 1.25rem; padding:0; }
    .claim-row { display:flex; align-items:center; gap:.5rem; justify-content:space-between; }
    .error { color:#b03030; }
    .small { font-size:.85rem; }
    .muted { color:#6b6450; }
    code { background:#eee; padding:0 .25rem; border-radius:.2rem; }
    .cart-fab { position:fixed; right:1rem; bottom:1rem; display:inline-flex; align-items:center; gap:.5rem; padding:.7rem 1.2rem; background:#8a6f3a; color:#fff; border:0; border-radius:2rem; font:inherit; font-weight:600; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.18); z-index:60; white-space:nowrap; }
    .cart-fab:hover { background:#6f5a2f; }
    .fab-count { background:#fff; color:#8a6f3a; min-width:1.3rem; height:1.3rem; padding:0 .35rem; border-radius:1rem; display:inline-flex; align-items:center; justify-content:center; font-size:.8rem; }
    .fab-total { white-space:nowrap; }
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
  protected draftPix = '';
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
    let path = '/wishlist';
    if (v.eventId) path = `/wishlist/event/${v.eventId}`;
    else if (v.ownerUserId) path = `/wishlist/user/${encodeURIComponent(v.ownerUserId)}`;
    const url = `${window.location.origin}${path}`;
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
      const updated = await this.api.updateWishlistPayment({
        eventId: v.eventId ?? undefined,
        ownerUserId: v.ownerUserId ?? undefined,
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
      this.syncOptionDrafts(fresh);
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

  protected formatPriceIn(minor: number, source: WishlistCurrency, target: WishlistCurrency): string {
    const major = minor / 100;
    if (source === target) return `${major.toFixed(2)} ${target}`;
    const srcRate = this.rates[source] ?? 1;
    const tgtRate = this.rates[target] ?? 1;
    const brl = major * srcRate;
    const amount = tgtRate === 0 ? brl : brl / tgtRate;
    return `${amount.toFixed(2)} ${target}`;
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

  protected formatTotalCompact(brlAmount: number, target: WishlistCurrency): string {
    const factor = this.rates[target] ?? 1;
    const amount = factor === 0 ? brlAmount : brlAmount / factor;
    const rounded = Math.round(amount);
    const text = Math.abs(amount - rounded) < 0.005 ? `${rounded}` : amount.toFixed(2);
    return `${text} ${target}`;
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

  async removeItemImage(item: WishlistItem): Promise<void> {
    try {
      const updated = await this.api.deleteWishlistImage(item.id);
      this.bumpImageVersion(updated.id);
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
