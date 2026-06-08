import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { EventImageComponent } from './event-image.component';
import { EventMarginsComponent, EventMarginBottomComponent } from './event-margins.component';
import { EventTileBackgroundComponent } from './event-tile-background.component';
import { ImageCarouselComponent } from './image-carousel.component';
import { WeddingEventComponent } from './wedding-event.component';
import { RsvpFormComponent } from './rsvp-form.component';
import { ChildEvent, EventDetail } from '../models';
import { localeFor } from '../utils/i18n';
import { isAlbumUploadOpen } from '../utils/album-uploads';
import { EventViewBase } from './event-view.base';

@Component({
  selector: 'app-event-detail',
  imports: [FormsModule, NavbarComponent, RouterLink, EventImageComponent, EventMarginsComponent, EventMarginBottomComponent, EventTileBackgroundComponent, ImageCarouselComponent, WeddingEventComponent, RsvpFormComponent],
  template: `
    @if (loading()) {
      <app-navbar /><main class="shell"><p>{{ s('loading') }}</p></main>
    } @else if (notFound()) {
      <app-navbar /><main class="shell"><p>{{ s('eventNotFound') }}</p></main>
    } @else if (event(); as ev) {
      @if (ev.type === 'Wedding') {
        <app-wedding-event [event]="ev" (refresh)="reload()" />
      } @else {
        <app-navbar />
        <app-event-margins [event]="ev" />
        <app-event-tile-background [event]="ev" [contentWidth]="900" />
        <main class="shell" style="position:relative;z-index:1">
          @if (bannerImage(); as banner) {
            <div class="banner"><app-event-image [eventId]="ev.id" [imageId]="banner.id" [alt]="banner.description || tr(ev)" /></div>
          }
          <header class="head">
            <div style="flex:1">
              <span class="chip">{{ typeLabel(ev.type) }}</span>
              <h1 style="margin:.15rem 0 0">{{ tr(ev) }}</h1>
              <p class="muted">{{ s('hostedBy') }} {{ ev.createdByDisplayName || '—' }}</p>
            </div>
            <div class="head-actions">
              <button type="button" class="ghost icon-btn" (click)="back()" [title]="ev.parentEventTitle || s('back')"><span class="material-icons">arrow_back</span></button>
              @if (ev.isOwner) {
                @if (ev.enableTranslations) {
                  <select class="ghost" style="padding:.4rem .6rem;font-size:.85rem" [ngModel]="lang()" (ngModelChange)="langOverride.set($event)" name="viewLang">
                    @for (l of languages; track l.code) { <option [value]="l.code">{{ l.short }}</option> }
                  </select>
                }
                <a class="primary icon-btn" [routerLink]="['/event', ev.id, 'edit']" [title]="s('edit')"><span class="material-icons">edit</span></a>
              }
            </div>
          </header>

          <section class="card">
            <h2>{{ s('whenAndWhere') }}</h2>
            <p><strong>{{ s('start') }}:</strong> {{ formatDate(ev.startUtc) }}</p>
            <p><strong>{{ s('end') }}:</strong> {{ formatDate(ev.endUtc) }}</p>
            @if (ev.location) { <p><strong>{{ s('location') }}:</strong> <a [href]="mapsUrl(ev.location)" target="_blank" rel="noopener">{{ locLabel(ev) }}</a></p> }
            @if (ev.dressCode) { <p><strong>{{ s('dressCode') }}:</strong> {{ dc(ev) }}</p> }
            @if (dr(ev)) { <p class="desc">{{ dr(ev) }}</p> }
          </section>

          @if (albumImages().length || canUploadAlbum(ev)) {
            <section class="card">
              <h2>{{ s('album') }} ({{ albumImages().length }})</h2>
              @if (albumImages().length) {
                <app-image-carousel [eventId]="ev.id" [images]="albumImages()" (open)="openAlbum($event)" />
              } @else { <p class="muted">{{ s('noAlbumImages') }}</p> }
              @if (canUploadAlbum(ev)) {
                <div class="album-upload">
                  <input type="file" accept="image/*" (change)="onAlbumFile($event)" />
                  <input type="text" [placeholder]="s('descriptionOptional')" [(ngModel)]="albumDescription" name="albumDescription" />
                  <button type="button" class="primary" (click)="uploadAlbum()" [disabled]="!albumFile || albumUploading()">
                    {{ albumUploading() ? s('uploading') : s('addToAlbum') }}
                  </button>
                </div>
                @if (albumError()) { <p class="error">{{ albumError() }}</p> }
              }
            </section>
          }

          @if (showParentRsvp(ev)) {
            <section class="card">
              <h2>{{ s('yourRsvp') }}</h2>
              @if (ev.children.length && ev.collectChildRsvps) { <p class="muted small">{{ s('responseAppliesToAll') }}</p> }
              <app-rsvp-form [event]="ev" [state]="parentRsvp()" [lang]="lang()" (save)="onSaveRsvp()" />
            </section>
          }

          @if (ev.children.length && !ev.collectChildRsvps) {
            @for (c of ev.children; track c.id) {
              <a class="card child-link" style="border-left:4px solid var(--rule-strong);text-decoration:none;color:inherit;display:block" [routerLink]="['/event', c.id]">
                <header style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
                  <span class="chip">{{ typeLabel(c.type) }}</span>
                  <h2 style="margin:0">{{ tr(c) }}</h2>
                </header>
                <p><strong>{{ s('start') }}:</strong> {{ formatDate(c.startUtc) }}</p>
                @if (c.location) { <p><strong>{{ s('location') }}:</strong> {{ locLabel(c) }}</p> }
                @if (c.dressCode) { <p><strong>{{ s('dressCode') }}:</strong> {{ dc(c) }}</p> }
                @if (dr(c)) { <p class="desc">{{ dr(c) }}</p> }
                @if (childState(c.id); as st) {
                  <p class="muted" style="margin:.5rem 0 0">{{ statusMessage(st.status) }}</p>
                }
              </a>
            }
          }

          @if (ev.isOwner || ev.showInviteesToGuests) {
            <section class="card">
              <h2>{{ s('invitees') }} ({{ ev.invites.length }})</h2>
              @if (!ev.invites.length) { <p class="muted">{{ s('noInvitees') }}</p> }
              @else {
                <ul class="invites">
                  @for (i of ev.invites; track i.id) {
                    <li>
                      <strong style="flex:1">{{ i.inviteeDisplayName || i.inviteeEmail }}</strong>
                      <span class="badge">{{ i.status }}</span>
                    </li>
                  }
                </ul>
              }
            </section>
          }
          <app-event-margin-bottom [event]="ev" />
        </main>
      }
    }
  `,
  styles: [`
    .banner { border-radius:.6rem; overflow:hidden; max-height:320px; }
    .banner ::ng-deep img { width:100%; max-height:320px; object-fit:cover; }
    .album-upload { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; padding-top:.75rem; border-top:1px dashed var(--rule); }
    .album-upload input[type=text] { flex:1; min-width:200px; padding:.4rem .6rem; border:1px solid var(--rule-soft); border-radius:.4rem; font:inherit; }
    .chip { display:inline-block; background:var(--accent-pale); padding:.15rem .55rem; border-radius:999px; font-size:.7rem; letter-spacing:.1em; text-transform:uppercase; }
    .desc { white-space:pre-wrap; color:var(--ink-soft); margin-top:.5rem; }
    .child-link { transition: background .15s ease; }
    .child-link:hover { background:var(--accent-pale); }
  `],
})
export class EventDetailComponent extends EventViewBase implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly event = signal<EventDetail | null>(null);
  readonly loading = signal(true);
  readonly notFound = signal(false);

  protected currentEvent() { return this.event(); }

  protected albumFile: File | null = null;
  protected albumDescription = '';
  protected readonly albumUploading = signal(false);
  protected readonly albumError = signal('');

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => void this.load(Number(p.get('eventId'))));
  }

  private async load(id: number): Promise<void> {
    if (!id) { this.notFound.set(true); this.loading.set(false); return; }
    if (!this.event()) this.loading.set(true);
    this.notFound.set(false);
    try {
      const ev = await this.api.getEvent(id);
      this.event.set(ev);
      this.hydrateRsvp(ev);
    } catch (e: any) {
      if (e?.status === 404 || e?.status === 403) this.notFound.set(true);
    } finally { this.loading.set(false); }
  }

  protected showParentRsvp(ev: EventDetail) { return !(ev.children.length && !ev.collectChildRsvps); }
  protected typeLabel(type: string) { return type === 'FamilyGathering' ? 'Family gathering' : type; }
  protected formatDate(iso: string) { return new Date(iso).toLocaleString(localeFor(this.lang())); }
  protected mapsUrl(loc: string) { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`; }
  protected back() {
    const ev = this.event();
    if (ev?.parentEventId !== null && ev?.parentEventId !== undefined) this.router.navigate(['/event', ev.parentEventId]);
    else this.router.navigate(['/']);
  }
  reload() { const id = this.event()?.id; if (id) void this.load(id); }

  protected async onSaveRsvp(): Promise<void> {
    const ev = this.event(); if (!ev) return;
    const updated = await this.submitRsvp(ev);
    if (updated === null) await this.load(ev.id);
    else { this.event.set(updated); this.hydrateRsvp(updated); }
  }
  protected async onSaveChildRsvp(child: ChildEvent): Promise<void> {
    const ev = this.event(); if (!ev) return;
    const updated = await this.submitChildRsvp(ev, child);
    if (updated) this.event.set(updated);
  }

  protected canUploadAlbum(ev: EventDetail) {
    return ev.isOwner || isAlbumUploadOpen(ev.albumUploadPolicy, ev.startUtc, ev.endUtc);
  }
  protected openAlbum(img: { id: number }) { const ev = this.event(); if (ev) this.router.navigate(['/event', ev.id, 'album', img.id]); }
  protected onAlbumFile(e: Event) { const i = e.target as HTMLInputElement; this.albumFile = i.files?.[0] ?? null; }

  protected async uploadAlbum(): Promise<void> {
    const ev = this.event(); if (!ev || !this.albumFile) return;
    this.albumUploading.set(true); this.albumError.set('');
    try {
      const img = await this.api.uploadImage(ev.id, this.albumFile, 'Album', this.albumDescription);
      this.event.set({ ...ev, images: [...ev.images, img] });
      this.albumFile = null; this.albumDescription = '';
      const input = document.querySelector<HTMLInputElement>('.album-upload input[type=file]');
      if (input) input.value = '';
    } catch (e: any) {
      this.albumError.set(e?.error ?? 'Could not upload image.');
    } finally { this.albumUploading.set(false); }
  }
}
