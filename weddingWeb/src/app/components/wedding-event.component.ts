import { Component, OnChanges, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EventImageComponent } from './event-image.component';
import { EventMarginsComponent, EventMarginBottomComponent } from './event-margins.component';
import { EventTileBackgroundComponent } from './event-tile-background.component';
import { ImageCarouselComponent } from './image-carousel.component';
import { MapViewComponent } from './map-view.component';
import { SaveTheDateComponent } from './save-the-date.component';
import { RsvpFormComponent } from './rsvp-form.component';
import { HubApi } from '../services/hub-api.service';
import { ChildEvent, EventDetail, EventImage } from '../models';
import { localeFor } from '../utils/i18n';
import { EventViewBase } from './event-view.base';

@Component({
  selector: 'app-wedding-event',
  imports: [FormsModule, RouterLink, EventImageComponent, EventMarginsComponent, EventMarginBottomComponent, EventTileBackgroundComponent, ImageCarouselComponent, MapViewComponent, SaveTheDateComponent, RsvpFormComponent],
  template: `
    @if (event(); as ev) {
      <app-event-margins [event]="ev" />
      <app-event-tile-background [event]="ev" [contentWidth]="780" />
      <div class="wedding">
        @if (ev.parentEventId !== null) {
          <a class="back-link" [routerLink]="['/event', ev.parentEventId]">← {{ ev.parentEventTitle || s('back') }}</a>
        }
        @if (ev.isOwner) {
          <div class="owner-tools">
            @if (ev.enableTranslations) {
              <select class="lang-switch" [ngModel]="lang()" (ngModelChange)="langOverride.set($event)" name="viewLang">
                @for (l of languages; track l.code) { <option [value]="l.code">{{ l.short }}</option> }
              </select>
            }
            <a class="edit-link icon-btn" [routerLink]="['/event', ev.id, 'edit']" [title]="s('edit')"><span class="material-icons">edit</span></a>
          </div>
        }
        @if (bannerImage(); as banner) {
          <div class="hero">
            <app-event-image [eventId]="ev.id" [imageId]="banner.id" [alt]="banner.description || tr(ev)" />
            <div class="hero-veil"></div>
            <div class="hero-text">
              <p class="kicker">{{ s('togetherWithFamilies') }}</p>
              <h1>{{ tr(ev) }}</h1>
              @if (!perChildRsvp()) { <p class="kicker">{{ formatLong(ev.startUtc) }}</p> }
            </div>
          </div>
        } @else {
          <header class="hero plain">
            <p class="kicker">{{ s('togetherWithFamilies') }}</p>
            <h1>{{ tr(ev) }}</h1>
            @if (!perChildRsvp()) { <p class="kicker">{{ formatLong(ev.startUtc) }}</p> }
          </header>
        }

        <div class="sections">
        @if (dr(ev)) { <section class="prose"><p>{{ dr(ev) }}</p></section> }

        @if (ev.dressCode) {
          <section class="dress">
            <p class="section-label">{{ s('dressCode') }}</p>
            <p class="script">{{ dc(ev) }}</p>
          </section>
        }

        @if (!perChildRsvp()) {
          <section class="rsvp-big">
            <p class="section-label">{{ s('rsvp') }}</p>
            @if (ev.collectChildRsvps && ev.children.length) { <p class="note">{{ s('replyAppliesToAll') }}</p> }
            <app-rsvp-form [event]="ev" [state]="parentRsvp()" [lang]="lang()" variant="wedding-big" (save)="onSaveRsvp()" />
          </section>
        }

        @if (ev.location) {
          <section class="map">
            <p class="section-label">{{ s('location') }}</p>
            <p class="loc-name">{{ locLabel(ev) }}</p>
            <app-map-view [location]="ev.location" [label]="locLabel(ev)" [lang]="lang()" />
          </section>
        }

        @if (ev.children.length) {
          <section class="map">
            <ol class="timeline">
              @for (c of ev.children; track c.id) {
                <li class="t-item">
                  <a class="t-link-block" [routerLink]="['/event', c.id]">
                    <div class="t-head">
                      <div class="t-time">
                        <span class="t-day">{{ formatDay(c.startUtc) }}</span>
                        <span class="t-hour">{{ formatHour(c.startUtc) }}</span>
                      </div>
                      <div style="flex:1 1 auto;min-width:0">
                        <h3 class="t-title">{{ tr(c) }}</h3>
                        @if (c.location) { <p class="t-where">{{ locLabel(c) }}</p> }
                      </div>
                    </div>
                    @if (perChildRsvp() && childState(c.id); as st) {
                      <p class="muted" style="margin:.5rem 0 0">{{ statusMessage(st.status) }}</p>
                    }
                  </a>
                </li>
              }
            </ol>
          </section>
        }

        @if (albumImages().length || ev.allowGuestAlbumUploads) {
          <section class="map">
            <p class="section-label">{{ s('moments') }}</p>
            @if (albumImages().length) {
              <app-image-carousel [eventId]="ev.id" [images]="albumImages()" variant="wedding" (open)="openAlbum($event)" />
            }
            @if (ev.allowGuestAlbumUploads) {
              <div class="album-upload">
                <input #albumFileInput type="file" accept="image/*" hidden (change)="onAlbumFile($event)" />
                <button type="button" class="soft" (click)="albumFileInput.click()">{{ s('addToAlbum') }}</button>
              </div>
              @if (albumError()) { <p class="error">{{ albumError() }}</p> }
            }
          </section>
        }

        @if (!perChildRsvp()) {
          <section class="save">
            <app-save-the-date [title]="tr(ev)" [startUtc]="ev.startUtc" [endUtc]="ev.endUtc"
              [location]="ev.location" [description]="dr(ev)" [lang]="lang()" />
          </section>
        }

        @if (ev.hasWishlist) {
          <section class="wishlist-section">
            <a href="javascript:void(0)" (click)="openWishlist(ev.id)" class="wl-btn">
              <span class="material-icons">card_giftcard</span>{{ s('wishlist') }}
            </a>
          </section>
        }
        </div>

        @if (albumFile) {
          <div class="album-modal-veil" (click)="cancelAlbumUpload()">
            <div class="album-modal" (click)="$event.stopPropagation()">
              <h3 class="script">{{ s('addToAlbum') }}</h3>
              @if (albumPreview()) { <img class="album-preview" [src]="albumPreview()" alt="" /> }
              <input type="text" [placeholder]="s('descriptionOptional')" [(ngModel)]="albumDescription" name="albumDescription" />
              <div class="album-modal-actions">
                <button type="button" class="soft" (click)="cancelAlbumUpload()" [disabled]="albumUploading()">{{ s('cancel') }}</button>
                <button type="button" class="soft" (click)="uploadAlbum()" [disabled]="albumUploading()">
                  {{ albumUploading() ? s('uploading') : s('addToAlbum') }}
                </button>
              </div>
              @if (albumError()) { <p class="error">{{ albumError() }}</p> }
            </div>
          </div>
        }
        <footer style="text-align:center;padding:3rem 0 0">
          <p class="script" style="font-size:1.6rem">{{ s('withLove') }}</p>
        </footer>
        <app-event-margin-bottom [event]="ev" />
      </div>
    }
  `,
  styles: [`
    :host { display:block; background:var(--wedding-bg); color:var(--wedding-ink); min-height:100vh; font-family:'Georgia',serif; }
    .wedding { max-width:780px; margin:0 auto; padding:0 0 4rem; position:relative; z-index:1; background:var(--wedding-bg); }
    .owner-tools { position:fixed; top:1rem; right:1rem; z-index:10; display:flex; gap:.4rem; }
    .back-link { position:fixed; top:1rem; left:1rem; z-index:10; background:rgba(255,255,255,.85);
      color:#4a3f2a; padding:.4rem .9rem; border-radius:999px; font-size:.78rem; letter-spacing:.05em;
      text-decoration:none; border:1px solid var(--gold-pale); }
    .back-link:hover { background:#faf2dd; }
    .edit-link, .lang-switch { background:rgba(255,255,255,.85); color:#4a3f2a; padding:.4rem .9rem; border-radius:999px;
      font-size:.78rem; text-transform:uppercase; text-decoration:none; border:1px solid var(--gold-pale); font:inherit; }
    .lang-switch { padding:.35rem .55rem; text-transform:none; }
    .script { font-family:var(--script); font-size:2.2rem; color:var(--gold); text-align:center; margin:2.2rem 0 1rem; }

    .hero { position:relative; height:50vh; overflow:hidden; background:var(--accent-soft); }
    .hero app-event-image { display:block; width:100%; height:100%; }
    .hero ::ng-deep img { width:100%; height:100%; object-fit:cover; }
    .hero-veil { position:absolute; inset:0; background:linear-gradient(180deg, transparent 35%, var(--wedding-bg) 100%); }
    .hero-text { position:absolute; left:0; right:0; bottom:1.5rem; text-align:center; padding:0 1rem; }
    .hero.plain { height:auto; padding:4rem 1rem 2rem; text-align:center; background:transparent; }
    .hero.plain .hero-text { position:static; }
    .hero h1 { font-family:var(--script); font-size:3.4rem; color:var(--wedding-ink); margin:.4rem 0; line-height:1; }
    .kicker { font-style:italic; color:#7a6a4a; letter-spacing:.18em; font-size:.85rem; margin:.2rem 0; }
    .where { font-style:italic; color:#5a4f37; margin:.3rem 0 0; }

    .save { display:flex; justify-content:center; padding:0 1rem; }
    .sections { display:flex; flex-direction:column; gap:2rem; margin-top:2rem; }
    .sections > section { margin:0; }
    .wishlist-section { text-align:center; }
    .prose { padding:0 1.5rem; text-align:center; line-height:1.7; color:#4a402d; }
    .map { padding:0 1.5rem; }
    .dress { padding:0 1.5rem; text-align:center; }
    .dress-label { color:#8a7a55; letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; margin:0; }
    .dress .script { font-size:2rem; margin:.2rem 0 0; }
    .section-label { color:#8a7a55; letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; margin:0 0 .6rem; text-align:center; }
    .loc-name { font-style:italic; color:#5a4f37; margin:0 0 .6rem; text-align:center; }

    .timeline { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:3rem; }
    .t-item { background:rgba(234,217,179,.18); border-radius:.8rem; padding:.9rem 1rem; min-width:0; overflow:hidden; }
    .t-head { display:flex; gap:1rem; align-items:flex-start; min-width:0; }
    .t-time { flex:0 0 7rem; text-align:right; padding-top:.25rem; border-right:1px solid #e0d2ad; padding-right:1rem; }
    .t-day { display:block; font-size:.7rem; letter-spacing:.18em; text-transform:uppercase; color:#a08755; }
    .t-hour { display:block; font-family:var(--script); font-size:1.8rem; color:var(--gold); line-height:1; margin-top:.2rem; }
    .t-title { font-family:var(--script); font-size:1.9rem; color:var(--wedding-ink); margin:0 0 .25rem; }
    .t-link { color:inherit; text-decoration:none; }
    .t-link-block { display:block; color:inherit; text-decoration:none; cursor:pointer; }
    .t-link-block:hover .t-title { color:var(--gold); }
    .t-where { font-style:italic; color:#7a6a4a; margin:0 0 .35rem; }

    .rsvp-big { margin:0 1.5rem; padding:0 1.5rem; align-items:center; text-align:center;
      display:flex; flex-direction:column; gap:.6rem; }
    .rsvp-big ::ng-deep .rsvp-grid { max-width:520px; }
    /* The form component uses .rsvp-grid for its select layout. */
    :host ::ng-deep .rsvp-grid { display:grid; grid-template-columns:auto 1fr; gap:.5rem .75rem; width:100%; align-items:center; margin-bottom:.9rem; }
    :host ::ng-deep .rsvp-grid label { display:contents; }
    :host ::ng-deep .rsvp-grid label > select { width:100%; min-width:0; padding:.55rem .7rem; border:1px solid var(--rule-soft); border-radius:.4rem; background:#fff; color:var(--wedding-ink); font:inherit; }
    :host ::ng-deep .rsvp-actions { display:flex; justify-content:center; }
    :host ::ng-deep .soft { font:inherit; background:var(--gold); color:var(--accent-ink); border:0; padding:.55rem 1.1rem; border-radius:999px; cursor:pointer; }
    :host ::ng-deep .soft.big { padding:.7rem 1.6rem; font-size:1rem; }
    :host ::ng-deep .soft:disabled { opacity:.6; cursor:default; }

    .note { font-style:italic; color:#7a6a4a; margin:0; }

    .album-upload { display:flex; justify-content:center; padding-top:.75rem; margin-top:.5rem; border-top:1px dashed var(--rule-soft); }

    .album-modal-veil { position:fixed; inset:0; background:rgba(0,0,0,.5); display:flex; align-items:center; justify-content:center; z-index:100; padding:1rem; }
    .album-modal { background:var(--wedding-bg); color:var(--wedding-ink); border:1px solid var(--gold-pale); border-radius:.6rem; padding:1.25rem; max-width:420px; width:100%; display:flex; flex-direction:column; gap:.75rem; }
    .album-modal h3 { margin:0; text-align:center; font-size:1.6rem; }
    .album-preview { max-width:100%; max-height:240px; object-fit:contain; align-self:center; border-radius:.4rem; }
    .album-modal input[type=text] { padding:.5rem .65rem; border:1px solid var(--rule-soft); background:#fff; color:var(--wedding-ink); border-radius:.4rem; font:inherit; }
    .album-modal-actions { display:flex; gap:.5rem; justify-content:flex-end; }

    .wl-btn { display:inline-flex; align-items:center; gap:.5rem; padding:.7rem 1.4rem; background:#fff; border:1px solid var(--gold-pale);
      border-radius:999px; color:#4a3f2a; text-decoration:none; }
    .wl-btn .material-icons { color:var(--gold); }

    @media (max-width: 560px) {
      .hero h1 { font-size:2.6rem; }
      .t-head { gap:.75rem; }
      .t-time { flex-basis:5rem; padding-right:.6rem; }
      .t-hour { font-size:1.4rem; }
      .rsvp-big { margin-left:0; margin-right:0; padding:0 1.1rem; }
    }
  `],
})
export class WeddingEventComponent extends EventViewBase implements OnChanges {
  private readonly router = inject(Router);

  readonly event = input.required<EventDetail>();
  readonly refresh = output<void>();

  protected currentEvent() { return this.event(); }

  protected readonly perChildRsvp = computed(() => {
    const ev = this.event();
    return !!ev && ev.children.length > 0 && !ev.collectChildRsvps;
  });

  ngOnChanges(): void { this.hydrateRsvp(this.event()); }

  protected formatLong(iso: string) {
    return new Date(iso).toLocaleDateString(localeFor(this.lang()), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  protected formatDay(iso: string) {
    return new Date(iso).toLocaleDateString(localeFor(this.lang()), { weekday: 'short', day: 'numeric', month: 'short' });
  }
  protected formatHour(iso: string) {
    return new Date(iso).toLocaleTimeString(localeFor(this.lang()), { hour: '2-digit', minute: '2-digit' });
  }

  protected async onSaveRsvp(): Promise<void> {
    const updated = await this.submitRsvp(this.event());
    if (updated === null) this.refresh.emit();
    else this.hydrateRsvp(updated);
  }
  protected async onSaveChildRsvp(child: ChildEvent): Promise<void> {
    if (await this.submitChildRsvp(this.event(), child)) this.refresh.emit();
  }
  protected openAlbum(img: EventImage) { this.router.navigate(['/event', this.event().id, 'album', img.id]); }

  protected albumFile: File | null = null;
  protected albumDescription = '';
  protected readonly albumUploading = signal(false);
  protected readonly albumError = signal('');
  protected readonly albumPreview = signal<string>('');
  protected onAlbumFile(e: Event) {
    const i = e.target as HTMLInputElement;
    this.albumFile = i.files?.[0] ?? null;
    this.albumDescription = '';
    this.albumError.set('');
    if (this.albumPreview()) { URL.revokeObjectURL(this.albumPreview()); }
    this.albumPreview.set(this.albumFile ? URL.createObjectURL(this.albumFile) : '');
    i.value = '';
  }
  protected cancelAlbumUpload() {
    if (this.albumUploading()) return;
    if (this.albumPreview()) URL.revokeObjectURL(this.albumPreview());
    this.albumFile = null; this.albumDescription = ''; this.albumPreview.set(''); this.albumError.set('');
  }
  protected async uploadAlbum(): Promise<void> {
    const ev = this.event();
    if (!this.albumFile) return;
    this.albumUploading.set(true); this.albumError.set('');
    try {
      await this.api.uploadImage(ev.id, this.albumFile, 'Album', this.albumDescription);
      if (this.albumPreview()) URL.revokeObjectURL(this.albumPreview());
      this.albumFile = null; this.albumDescription = ''; this.albumPreview.set('');
      this.refresh.emit();
    } catch (e: any) {
      this.albumError.set(e?.error ?? 'Could not upload image.');
    } finally { this.albumUploading.set(false); }
  }
  protected async openWishlist(eventId: number) {
    try { const v = await this.api.resolveWishlistForEvent(eventId); this.router.navigate(['/wishlist', v.id]); } catch { /* ignore */ }
  }
}
