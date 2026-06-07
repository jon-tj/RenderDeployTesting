import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { EventImageComponent } from './event-image.component';
import { EventMarginsComponent, EventMarginBottomComponent } from './event-margins.component';
import { EventTileBackgroundComponent } from './event-tile-background.component';
import { ImageCarouselComponent } from './image-carousel.component';
import { WeddingEventComponent } from './wedding-event.component';
import { HubApi } from '../services/hub-api.service';
import { AuthService } from '../services/auth.service';
import { ChildEvent, DEFAULT_LANGUAGE, EventDetail, EventImage, InviteStatus, LANGUAGES, LanguageCode } from '../models';
import { localizedDescription, localizedDressCode, localizedOption, localizedTitle, localeFor, t, translateStatus } from '../utils/i18n';

const RSVP_STATUSES: InviteStatus[] = ['Pending', 'Accepted', 'Declined', 'Maybe'];

interface ChildRsvpState {
  status: InviteStatus;
  mealChoice: string;
  drinkChoice: string;
  saving: boolean;
  error: string;
  savedAt: number;
}

@Component({
  selector: 'app-event-detail',
  imports: [FormsModule, NavbarComponent, RouterLink, EventImageComponent, EventMarginsComponent, EventMarginBottomComponent, EventTileBackgroundComponent, ImageCarouselComponent, WeddingEventComponent],
  template: `
    @if (loading()) {
      <app-navbar />
      <main class="shell"><p>{{ s('loading') }}</p></main>
    } @else if (notFound()) {
      <app-navbar />
      <main class="shell"><p>{{ s('eventNotFound') }}</p></main>
    } @else if (event(); as ev) {
      @if (ev.type === 'Wedding') {
        <app-wedding-event [event]="ev" (refresh)="reload()" />
      } @else {
        <app-navbar />
        <app-event-margins [event]="ev" />
        <app-event-tile-background [event]="ev" [contentWidth]="900" />
        <main class="shell">
          @if (bannerImage(); as banner) {
            <div class="banner">
              <app-event-image [eventId]="ev.id" [imageId]="banner.id" [alt]="banner.description || tr(ev)" />
            </div>
          }
          <header class="head">
            <div class="title">
              <span class="kind">{{ typeLabel(ev.type) }}</span>
              <h1>{{ tr(ev) }}</h1>
              <p class="muted">{{ s('hostedBy') }} {{ ev.createdByDisplayName || '—' }}</p>
            </div>
            <div class="head-actions">
              <button type="button" class="ghost icon-btn" (click)="back()" [title]="s('back')" [attr.aria-label]="s('back')"><span class="material-icons">arrow_back</span></button>
              @if (ev.isOwner) {
                @if (ev.enableTranslations) {
                  <select class="ghost lang-switch" [ngModel]="lang()" (ngModelChange)="langOverride.set($event)" name="viewLang">
                    @for (l of languages; track l.code) {
                      <option [value]="l.code">{{ l.short }}</option>
                    }
                  </select>
                }
                <a class="primary icon-btn" [routerLink]="['/event', ev.id, 'edit']" [title]="s('edit')" [attr.aria-label]="s('edit')"><span class="material-icons">edit</span></a>
              }
            </div>
          </header>

        <section class="card">
          <h2>{{ s('whenAndWhere') }}</h2>
          <p><strong>{{ s('start') }}:</strong> {{ formatDate(ev.startUtc) }}</p>
          <p><strong>{{ s('end') }}:</strong> {{ formatDate(ev.endUtc) }}</p>
          @if (ev.location) {
            <p><strong>{{ s('location') }}:</strong> <a [href]="mapsUrl(ev.location)" target="_blank" rel="noopener">{{ ev.location }}</a></p>
          }
          @if (ev.dressCode) {
            <p><strong>{{ s('dressCode') }}:</strong> {{ dc(ev) }}</p>
          }
          @if (ev.description || (ev.enableTranslations && dr(ev))) {
            <p class="desc">{{ dr(ev) }}</p>
          }
        </section>

        @if (albumImages().length || canUploadAlbum(ev)) {
          <section class="card">
            <h2>{{ s('album') }} ({{ albumImages().length }})</h2>
            @if (albumImages().length) {
              <app-image-carousel [eventId]="ev.id" [images]="albumImages()" (open)="openAlbum($event)" />
            } @else {
              <p class="muted">{{ s('noAlbumImages') }}</p>
            }

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
            @if (ev.children.length && ev.collectChildRsvps) {
              <p class="muted small">{{ s('responseAppliesToAll') }}</p>
            }
            @if (rsvpError()) { <p class="error">{{ rsvpError() }}</p> }
            @if (rsvpSavedAt()) { <p class="saved">{{ s('saved') }}</p> }
            <div class="grid">
              <label>{{ s('attending') }}
                <select name="status" [(ngModel)]="status">
                  @for (st of statuses; track st) {
                    <option [value]="st">{{ statusLabel(st) }}</option>
                  }
                </select>
              </label>
              @if (ev.mealOptions.length) {
                <label>{{ s('meal') }}
                  <select name="meal" [(ngModel)]="mealChoice">
                    <option [ngValue]="''">{{ s('noPreference') }}</option>
                    @for (m of ev.mealOptions; track m) {
                      <option [ngValue]="m">{{ optLabel(ev, 'meal', m) }}</option>
                    }
                  </select>
                </label>
              }
              @if (ev.drinkOptions.length) {
                <label>{{ s('drink') }}
                  <select name="drink" [(ngModel)]="drinkChoice">
                    <option [ngValue]="''">{{ s('noPreference') }}</option>
                    @for (d of ev.drinkOptions; track d) {
                      <option [ngValue]="d">{{ optLabel(ev, 'drink', d) }}</option>
                    }
                  </select>
                </label>
              }
            </div>
            <div class="actions">
              <button type="button" class="primary" (click)="saveRsvp()" [disabled]="rsvpSaving()">
                {{ rsvpSaving() ? s('saving') : s('saveRsvp') }}
              </button>
            </div>
          </section>
        }

        @if (ev.children.length && !ev.collectChildRsvps) {
          @for (c of ev.children; track c.id) {
            <section class="card child">
              <header class="child-head">
                <span class="kind">{{ typeLabel(c.type) }}</span>
                <h2>{{ tr(c) }}</h2>
              </header>
              <p><strong>Start:</strong> {{ formatDate(c.startUtc) }}</p>
              <p><strong>End:</strong> {{ formatDate(c.endUtc) }}</p>
              @if (c.location) { <p><strong>Location:</strong> <a [href]="mapsUrl(c.location)" target="_blank" rel="noopener">{{ c.location }}</a></p> }
              @if (c.dressCode) { <p><strong>{{ s('dressCode') }}:</strong> {{ dc(c) }}</p> }
              @if (dr(c)) { <p class="desc">{{ dr(c) }}</p> }

              @if (childState(c.id); as st) {
                <div class="rsvp-block">
                  <h3>{{ s('yourRsvp') }}</h3>
                  @if (st.error) { <p class="error">{{ st.error }}</p> }
                  @if (st.savedAt) { <p class="saved">{{ s('saved') }}</p> }
                  <div class="grid">
                    <label>{{ s('attending') }}
                      <select [name]="'cstatus-' + c.id" [(ngModel)]="st.status">
                        @for (st2 of statuses; track st2) {
                          <option [value]="st2">{{ statusLabel(st2) }}</option>
                        }
                      </select>
                    </label>
                    @if (c.mealOptions.length) {
                      <label>{{ s('meal') }}
                        <select [name]="'cmeal-' + c.id" [(ngModel)]="st.mealChoice">
                          <option [ngValue]="''">{{ s('noPreference') }}</option>
                          @for (m of c.mealOptions; track m) {
                            <option [ngValue]="m">{{ optLabel(c, 'meal', m) }}</option>
                          }
                        </select>
                      </label>
                    }
                    @if (c.drinkOptions.length) {
                      <label>{{ s('drink') }}
                        <select [name]="'cdrink-' + c.id" [(ngModel)]="st.drinkChoice">
                          <option [ngValue]="''">{{ s('noPreference') }}</option>
                          @for (d of c.drinkOptions; track d) {
                            <option [ngValue]="d">{{ optLabel(c, 'drink', d) }}</option>
                          }
                        </select>
                      </label>
                    }
                  </div>
                  <div class="actions">
                    <button type="button" class="primary" (click)="saveChildRsvp(c)" [disabled]="st.saving">
                      {{ st.saving ? s('saving') : s('saveRsvp') }}
                    </button>
                  </div>
                </div>
              }
            </section>
          }
        }

        @if (ev.isOwner || ev.showInviteesToGuests) {
          <section class="card">
            <h2>{{ s('invitees') }} ({{ ev.invites.length }})</h2>
            @if (!ev.invites.length) {
              <p class="muted">{{ s('noInvitees') }}</p>
            } @else {
              <ul class="invites">
                @for (i of ev.invites; track i.id) {
                  <li>
                    <strong>{{ i.inviteeDisplayName || i.inviteeEmail }}</strong>
                    <span class="badge">{{ statusLabel(i.status) }}</span>
                    @if (i.mealChoice) { <span class="chip">{{ s('mealLabel') }} {{ optLabel(ev, 'meal', i.mealChoice) }}</span> }
                    @if (i.drinkChoice) { <span class="chip">{{ s('drinkLabel') }} {{ optLabel(ev, 'drink', i.drinkChoice) }}</span> }
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
    .shell { max-width:900px; margin:0 auto; padding:1.25rem; display:flex; flex-direction:column; gap:1rem; position:relative; z-index:1; }
    .head { display:flex; align-items:flex-start; gap:1rem; }
    .head .title { flex:1; }
    .head h1 { margin:.15rem 0 0; }
    .banner { border-radius:.6rem; overflow:hidden; max-height:320px; background:#f1e0c2; display:flex; align-items:center; justify-content:center; }
    .banner ::ng-deep img { width:100%; height:100%; max-height:320px; object-fit:cover; }
    .caption { margin:0; text-align:center; }
    .album-upload { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; margin-top:.5rem; padding-top:.75rem; border-top:1px dashed #e6e1d4; }
    .album-upload input[type=text] { flex:1; min-width:200px; padding:.4rem .6rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; }
    .head-actions { display:flex; gap:.5rem; }
    .lang-switch { padding:.4rem .6rem; font-size:.85rem; }
    .kind { display:inline-block; background:#dfe6cf; color:#2d2a24; padding:.15rem .55rem; border-radius:999px; font-size:.7rem; letter-spacing:.1em; text-transform:uppercase; }
    .kind.wedding { background:#f1e0c2; }
    .card { background:#fff; border:1px solid #e6e1d4; border-radius:.6rem; padding:1rem 1.25rem; display:flex; flex-direction:column; gap:.5rem; }
    .card h2 { margin:0 0 .25rem; font-size:1.05rem; }
    .card p { margin:0; }
    .card.child { border-left:4px solid #c9b88a; }
    .child-head { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; }
    .child-head h2 { margin:0; }
    .desc { white-space:pre-wrap; color:#5a5347; margin-top:.5rem; }
    .rsvp-block { margin-top:.5rem; padding-top:.75rem; border-top:1px dashed #e6e1d4; display:flex; flex-direction:column; gap:.5rem; }
    .rsvp-block h3 { margin:0; font-size:.95rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:.75rem; }
    label { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; color:#5a5347; }
    select { padding:.5rem .65rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; background:#fff; }
    .actions { display:flex; justify-content:flex-end; margin-top:.25rem; }
    .ghost { background:transparent; border:1px solid #c9b88a; padding:.4rem .8rem; border-radius:.4rem; cursor:pointer; font:inherit; text-decoration:none; color:#2d2a24; }
    .ghost:hover { background:#f1e0c2; }
    .primary { background:#6f7a5b; color:#faf5ea; border:0; padding:.5rem .9rem; border-radius:.4rem; cursor:pointer; font:inherit; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; }
    .primary:disabled { opacity:.6; cursor:default; }
    .icon-btn { padding:.35rem; display:inline-flex; align-items:center; justify-content:center; line-height:1; }
    .icon-btn .material-icons { font-size:1.25rem; }
    .muted { color:#8b8273; margin:0; }
    .small { font-size:.8rem; }
    .error { color:#a23; margin:0; }
    .saved { color:#3a7a3a; margin:0; }
    ul.invites { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.4rem; }
    ul.invites li { display:flex; align-items:center; gap:.5rem; flex-wrap:wrap; padding:.4rem .65rem; background:#faf7f0; border-radius:.4rem; }
    ul.invites li strong { flex:1; }
    .badge { background:#dfe6cf; padding:.15rem .5rem; border-radius:.25rem; font-size:.75rem; }
    .chip { background:#f1e0c2; color:#5a5347; padding:.15rem .5rem; border-radius:.25rem; font-size:.75rem; }
  `],
})
export class EventDetailComponent implements OnInit {
  private readonly api = inject(HubApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly event = signal<EventDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  protected readonly lang = computed<LanguageCode>(() =>
    this.langOverride() ?? (this.auth.me()?.preferredLanguage as LanguageCode) ?? DEFAULT_LANGUAGE);
  protected readonly langOverride = signal<LanguageCode | null>(null);
  protected readonly languages = LANGUAGES;

  protected tr(ev: EventDetail | ChildEvent): string {
    return localizedTitle(ev, this.lang());
  }
  protected dr(ev: EventDetail | ChildEvent): string {
    return localizedDescription(ev, this.lang());
  }
  protected dc(ev: EventDetail | ChildEvent): string {
    return localizedDressCode(ev, this.lang());
  }
  protected s(key: Parameters<typeof t>[0]): string {
    return t(key, this.lang());
  }
  protected statusLabel(status: InviteStatus): string {
    return translateStatus(status, this.lang());
  }
  protected optLabel(ev: EventDetail | ChildEvent, kind: 'meal' | 'drink', value: string): string {
    return localizedOption(ev, this.lang(), kind, value);
  }

  protected readonly statuses = RSVP_STATUSES;
  protected status: InviteStatus = 'Pending';
  protected mealChoice = '';
  protected drinkChoice = '';
  protected readonly rsvpSaving = signal(false);
  protected readonly rsvpError = signal('');
  protected readonly rsvpSavedAt = signal(0);

  // Per-child RSVP form state, keyed by child event id. Plain object so the
  // template can ngModel-bind into it without an extra signal per field.
  private readonly childStates = signal(new Map<number, ChildRsvpState>());

  // Album upload form (only used when the user has rights to add images).
  protected albumFile: File | null = null;
  protected albumDescription = '';
  protected readonly albumUploading = signal(false);
  protected readonly albumError = signal('');

  private readonly carousel = viewChild(ImageCarouselComponent);

  protected readonly bannerImage = computed<EventImage | null>(() =>
    this.event()?.images.find(i => i.role === 'Banner') ?? null);
  protected readonly albumImages = computed<EventImage[]>(() =>
    this.event()?.images.filter(i => i.role === 'Album') ?? []);

  async ngOnInit(): Promise<void> {
    this.route.paramMap.subscribe(params => {
      const id = Number(params.get('eventId'));
      void this.load(id);
    });
  }

  private async load(id: number): Promise<void> {
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.notFound.set(false);
    this.rsvpError.set('');
    this.rsvpSavedAt.set(0);
    try {
      const ev = await this.api.getEvent(id);
      this.applyEvent(ev);
    } catch (e: any) {
      if (e?.status === 404 || e?.status === 403) this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  private applyEvent(ev: EventDetail): void {
    this.event.set(ev);
    if (ev.myInvite) {
      this.status = ev.myInvite.status;
      this.mealChoice = ev.myInvite.mealChoice ?? '';
      this.drinkChoice = ev.myInvite.drinkChoice ?? '';
    }
    const next = new Map<number, ChildRsvpState>();
    for (const c of ev.children) {
      next.set(c.id, {
        status: c.myInvite?.status ?? 'Pending',
        mealChoice: c.myInvite?.mealChoice ?? '',
        drinkChoice: c.myInvite?.drinkChoice ?? '',
        saving: false,
        error: '',
        savedAt: 0,
      });
    }
    this.childStates.set(next);
  }

  protected childState(id: number): ChildRsvpState | undefined {
    return this.childStates().get(id);
  }

  // Hide the event's own RSVP only when it has children in individual mode
  // (those are rendered per-child below). Otherwise show it — the backend
  // lazy-creates the invite if the user is visible via inheritance.
  protected showParentRsvp(ev: EventDetail): boolean {
    if (ev.children.length && !ev.collectChildRsvps) return false;
    return true;
  }

  protected typeLabel(t: string): string {
    return t === 'FamilyGathering' ? 'Family gathering' : t;
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString(localeFor(this.lang()));
  }

  protected mapsUrl(location: string): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  }

  async saveRsvp(): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    this.rsvpSaving.set(true);
    this.rsvpError.set('');
    try {
      const updated = await this.api.rsvp(ev.id, {
        status: this.status,
        mealChoice: ev.mealOptions.length ? this.mealChoice : undefined,
        drinkChoice: ev.drinkOptions.length ? this.drinkChoice : undefined,
      });
      // If the server rippled to children, reload to pick up their statuses.
      if (ev.children.length && ev.collectChildRsvps) {
        await this.load(ev.id);
      } else {
        const next: EventDetail = {
          ...ev,
          myInvite: updated,
          invites: ev.invites.some(i => i.id === updated.id)
            ? ev.invites.map(i => (i.id === updated.id ? updated : i))
            : [...ev.invites, updated],
        };
        this.applyEvent(next);
      }
      this.rsvpSavedAt.set(Date.now());
    } catch (e: any) {
      this.rsvpError.set(e?.error ?? 'Could not save RSVP.');
    } finally {
      this.rsvpSaving.set(false);
    }
  }

  async saveChildRsvp(child: ChildEvent): Promise<void> {
    const state = this.childStates().get(child.id);
    if (!state) return;
    state.saving = true;
    state.error = '';
    try {
      const updated = await this.api.rsvp(child.id, {
        status: state.status,
        mealChoice: child.mealOptions.length ? state.mealChoice : undefined,
        drinkChoice: child.drinkOptions.length ? state.drinkChoice : undefined,
      });
      const ev = this.event();
      if (ev) {
        const next: EventDetail = {
          ...ev,
          children: ev.children.map(c => c.id === child.id ? { ...c, myInvite: updated } : c),
        };
        this.event.set(next);
      }
      state.savedAt = Date.now();
    } catch (e: any) {
      state.error = e?.error ?? 'Could not save RSVP.';
    } finally {
      state.saving = false;
    }
  }

  back(): void {
    this.router.navigate(['/']);
  }

  reload(): void {
    const id = this.event()?.id;
    if (id) void this.load(id);
  }

  protected openAlbum(img: EventImage): void {
    this.router.navigate(['/event', this.event()?.id, 'album', img.id]);
  }

  // Owner can always upload Album images. Non-owners can if the event opted
  // in. Banner and Icon stay owner-only and live in the edit page manager.
  protected canUploadAlbum(ev: EventDetail): boolean {
    return ev.isOwner || ev.allowGuestAlbumUploads;
  }

  protected onAlbumFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.albumFile = input.files && input.files[0] ? input.files[0] : null;
  }

  async uploadAlbum(): Promise<void> {
    const ev = this.event();
    if (!ev || !this.albumFile) return;
    this.albumUploading.set(true);
    this.albumError.set('');
    try {
      const img = await this.api.uploadImage(ev.id, this.albumFile, 'Album', this.albumDescription);
      const next: EventDetail = { ...ev, images: [...ev.images, img] };
      this.event.set(next);
      this.albumFile = null;
      this.albumDescription = '';
      // Reset the file input element.
      const fileInput = document.querySelector<HTMLInputElement>('.album-upload input[type=file]');
      if (fileInput) fileInput.value = '';
      // Jump to the newly added image.
      this.carousel()?.jumpTo(this.albumImages().length - 1);
    } catch (e: any) {
      this.albumError.set(e?.error ?? 'Could not upload image.');
    } finally {
      this.albumUploading.set(false);
    }
  }
}
