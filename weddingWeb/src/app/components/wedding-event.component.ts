import { Component, OnChanges, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EventImageComponent } from './event-image.component';
import { EventMarginsComponent, EventMarginBottomComponent } from './event-margins.component';
import { EventTileBackgroundComponent } from './event-tile-background.component';
import { ImageCarouselComponent } from './image-carousel.component';
import { MapViewComponent } from './map-view.component';
import { SaveTheDateComponent } from './save-the-date.component';
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
  selector: 'app-wedding-event',
  imports: [FormsModule, RouterLink, EventImageComponent, EventMarginsComponent, EventMarginBottomComponent, EventTileBackgroundComponent, ImageCarouselComponent, MapViewComponent, SaveTheDateComponent],
  template: `
    @if (event(); as ev) {
      <app-event-margins [event]="ev" />
      <app-event-tile-background [event]="ev" [contentWidth]="780" />
      <div class="wedding">
        @if (ev.isOwner) {
          <div class="owner-tools">
            @if (ev.enableTranslations) {
              <select class="lang-switch" [ngModel]="lang()" (ngModelChange)="langOverride.set($event)" name="viewLang" [title]="s('edit')">
                @for (l of languages; track l.code) {
                  <option [value]="l.code">{{ l.short }}</option>
                }
              </select>
            }
            <a class="edit-link icon-btn" [routerLink]="['/event', ev.id, 'edit']" [title]="s('edit')" [attr.aria-label]="s('edit')"><span class="material-icons">edit</span></a>
          </div>
        }
        @if (bannerImage(); as banner) {
          <div class="hero">
            <app-event-image [eventId]="ev.id" [imageId]="banner.id" [alt]="banner.description || tr(ev)" />
            <div class="hero-veil"></div>
            <div class="hero-text">
              <p class="kicker">{{ s('togetherWithFamilies') }}</p>
              <h1>{{ tr(ev) }}</h1>
              @if (!perChildRsvp()) {
                <p class="kicker">{{ formatLong(ev.startUtc) }}</p>
              }
              @if (ev.location) {
                <p class="where">{{ ev.location }}</p>
              }
            </div>
          </div>
        } @else {
          <header class="hero plain">
            <p class="kicker">{{ s('togetherWithFamilies') }}</p>
            <h1>{{ tr(ev) }}</h1>
            @if (!perChildRsvp()) {
              <p class="kicker">{{ formatLong(ev.startUtc) }}</p>
            }
            @if (ev.location) { <p class="where">{{ ev.location }}</p> }
          </header>
        }

        <section class="save">
          @if (!perChildRsvp()) {
            <app-save-the-date
              [title]="tr(ev)"
              [startUtc]="ev.startUtc"
              [endUtc]="ev.endUtc"
              [location]="ev.location"
              [description]="dr(ev)"
              [lang]="lang()" />
          }
        </section>

        @if (dr(ev)) {
          <section class="prose">
            <p>{{ dr(ev) }}</p>
          </section>
        }

        @if (ev.location) {
          <section class="map">
            <app-map-view [location]="ev.location" [lang]="lang()" />
          </section>
        }

        @if (ev.dressCode) {
          <section class="dress">
            <p class="label">{{ s('dressCode') }}</p>
            <p class="script">{{ dc(ev) }}</p>
          </section>
        }

        @if (ev.children.length) {
          <section class="schedule">
            <ol class="timeline">
              @for (c of ev.children; track c.id) {
                <li class="t-item">
                  <div class="t-head">
                    <div class="t-time">
                      <span class="t-day">{{ formatDay(c.startUtc) }}</span>
                      <span class="t-hour">{{ formatHour(c.startUtc) }}</span>
                    </div>
                    <div class="t-body">
                      <h3><a class="t-link" [routerLink]="['/event', c.id]">{{ tr(c) }}</a></h3>
                      @if (c.location) {
                        <p class="t-where">{{ locLabel(c) }}</p>
                      }
                      <app-save-the-date
                        [title]="tr(c)"
                        [startUtc]="c.startUtc"
                        [endUtc]="c.endUtc"
                        [location]="c.location"
                        [description]="dr(c)"
                        [compact]="true"
                        [lang]="lang()" />
                    </div>
                  </div>

                  @if (perChildRsvp() && childState(c.id); as st) {
                    <div class="rsvp t-rsvp">
                      @if (st.error) { <p class="error">{{ st.error }}</p> }
                      @if (st.savedAt) { <p class="saved">{{ s('thankYou') }}</p> }
                      <div class="rsvp-grid">
                        <label>{{ s('rsvp') }}
                          <select [name]="'cs-' + c.id" [(ngModel)]="st.status">
                            @for (st2 of statuses; track st2) {
                              <option [value]="st2">{{ statusLabel(st2) }}</option>
                            }
                          </select>
                        </label>
                        @if (c.mealOptions.length) {
                          <label>{{ s('meal') }}
                            <select [name]="'cm-' + c.id" [(ngModel)]="st.mealChoice">
                              <option [ngValue]="''">{{ s('noPreference') }}</option>
                              @for (m of c.mealOptions; track m) {
                                <option [ngValue]="m">{{ optLabel(c, 'meal', m) }}</option>
                              }
                            </select>
                          </label>
                        }
                        @if (c.drinkOptions.length) {
                          <label>{{ s('drink') }}
                            <select [name]="'cd-' + c.id" [(ngModel)]="st.drinkChoice">
                              <option [ngValue]="''">{{ s('noPreference') }}</option>
                              @for (d of c.drinkOptions; track d) {
                                <option [ngValue]="d">{{ optLabel(c, 'drink', d) }}</option>
                              }
                            </select>
                          </label>
                        }
                      </div>
                      <div class="rsvp-actions">
                        <button type="button" class="soft" (click)="saveChildRsvp(c, st)" [disabled]="st.saving">
                          {{ st.saving ? s('saving') : s('reply') }}
                        </button>
                      </div>
                    </div>
                  }
                </li>
              }
            </ol>
          </section>
        }

        @if (!perChildRsvp()) {
          <section class="rsvp-big">
            <h2 class="script">{{ s('rsvp') }}</h2>
            @if (ev.collectChildRsvps && ev.children.length) {
              <p class="note">{{ s('replyAppliesToAll') }}</p>
            }
            @if (rsvpError()) { <p class="error">{{ rsvpError() }}</p> }
            @if (rsvpSavedAt()) { <p class="saved">{{ s('thankYou') }}</p> }
            <div class="rsvp-grid">
              <label>{{ s('rsvp') }}
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
            <div class="rsvp-actions">
              <button type="button" class="soft big" (click)="saveRsvp()" [disabled]="rsvpSaving()">
                {{ rsvpSaving() ? s('saving') : s('reply') }}
              </button>
            </div>
          </section>
        }

        @if (albumImages().length) {
          <section class="album">
            <h2 class="script">{{ s('moments') }}</h2>
            <app-image-carousel [eventId]="ev.id" [images]="albumImages()" (open)="openAlbum($event)" />
          </section>
        }

        <section class="wishlist-link">
          <a [routerLink]="['/wishlist', ev.id]" class="wl-btn">
            <span class="material-icons">card_giftcard</span>
            {{ s('wishlist') }}
          </a>
        </section>

        <footer class="foot">
          <p class="script">{{ s('withLove') }}</p>
        </footer>
        <app-event-margin-bottom [event]="ev" />
      </div>
    }
  `,
  styles: [`
    :host { display:block; background:#fbf6ec; color:#3a3327; min-height:100vh; font-family:'Georgia', 'Cormorant Garamond', serif; }
    .wedding { max-width:780px; margin:0 auto; padding:0 0 4rem; position:relative; z-index:1; background:#fbf6ec; }
    .edit-link, .lang-switch { background:rgba(255,255,255,.85); color:#4a3f2a; padding:.4rem .9rem; border-radius:999px; font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; text-decoration:none; border:1px solid #ead9b3; font:inherit; }
    .edit-link:hover { background:#fff; }
    .icon-btn { padding:.4rem; display:inline-flex; align-items:center; justify-content:center; line-height:1; }
    .icon-btn .material-icons { font-size:1.25rem; }
    .owner-tools { position:fixed; top:1rem; right:1rem; z-index:10; display:flex; gap:.4rem; }
    .lang-switch { padding:.35rem .55rem; text-transform:none; letter-spacing:0; }
    .script { font-family:'Parisienne','Brush Script MT','Apple Chancery',cursive; font-weight:400; font-size:2.2rem; color:#8a6f3a; text-align:center; margin:2.2rem 0 1rem; }
    .hero { position:relative; height:50vh; overflow:hidden; background:#f1e0c2; }
    .hero app-event-image { display:block; width:100%; height:100%; }
    .hero ::ng-deep img { width:100%; height:100%; object-fit:cover; display:block; max-width:none; }
    .hero-veil { position:absolute; inset:0; background:linear-gradient(180deg, rgba(251,246,236,0) 35%, rgba(251,246,236,.85) 100%); }
    .hero-text { position:absolute; left:0; right:0; bottom:1.5rem; text-align:center; padding:0 1rem; }
    .hero.plain { position:relative; height:auto; padding:4rem 1rem 2rem; text-align:center; background:transparent; }
    .hero.plain .hero-text { position:static; }
    .hero h1 { font-family:'Parisienne','Brush Script MT','Apple Chancery',cursive; font-weight:400; font-size:3.4rem; color:#3a3327; margin:.4rem 0; line-height:1; letter-spacing:.02em; }
    .kicker { font-style:italic; color:#7a6a4a; letter-spacing:.18em; text-transform:lowercase; font-size:.85rem; margin:.2rem 0; }
    .where { font-style:italic; color:#5a4f37; margin:.3rem 0 0; }

    .save { display:flex; justify-content:center; margin-top:1.5rem; padding:0 1rem; }
    .prose { padding:1rem 1.5rem; text-align:center; line-height:1.7; color:#4a402d; font-size:1.05rem; }
    .map { padding:0 1.5rem; }
    .album { padding:0 1.5rem; }
    .dress { padding:1.25rem 1.5rem 0; text-align:center; }
    .dress .label { font-family:'Georgia', serif; color:#8a7a55; letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; margin:0; }
    .dress .script { font-family:'Parisienne','Brush Script MT','Apple Chancery',cursive; font-size:2rem; color:#8a6f3a; margin:.2rem 0 0; }

    .schedule { padding:0 1.5rem; }
    .timeline { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:3rem; counter-reset:t; }
    .t-item { display:flex; flex-direction:column; gap:.75rem; background:rgba(234,217,179,.18); border-radius:.8rem; padding:.9rem 1rem; min-width:0; overflow:hidden; }
    .t-head { display:flex; gap:1rem; align-items:flex-start; min-width:0; }
    .t-time { flex:0 0 7rem; text-align:right; padding-top:.25rem; border-right:1px solid #e0d2ad; padding-right:1rem; }
    .t-body { flex:1 1 auto; min-width:0; }
    .t-day { display:block; font-size:.7rem; letter-spacing:.18em; text-transform:uppercase; color:#a08755; }
    .t-hour { display:block; font-family:'Parisienne','Brush Script MT','Apple Chancery',cursive; font-size:1.8rem; color:#8a6f3a; line-height:1; margin-top:.2rem; }
    .t-body h3 { font-family:'Parisienne','Brush Script MT','Apple Chancery',cursive; font-weight:400; font-size:1.9rem; color:#3a3327; margin:0 0 .25rem; }
    .t-link { color:inherit; text-decoration:none; }
    .t-link:hover { color:#8a6f3a; }
    .t-where { font-style:italic; color:#7a6a4a; margin:0 0 .35rem; }
    .t-desc { margin:0 0 .75rem; line-height:1.6; color:#4a402d; }
    .t-map { margin:0; }

    .rsvp, .rsvp-big { background:transparent; border:0; border-radius:.8rem; padding:1rem 1.25rem; display:flex; flex-direction:column; gap:.6rem; margin-top:.75rem; }
    .t-rsvp { margin-top:0; gap:.35rem; padding:0; }
    .rsvp-big { margin:1.5rem 1.5rem 0; padding:1.5rem; align-items:center; text-align:center; }
    .rsvp h4 { margin:0; font-family:'Parisienne','Brush Script MT','Apple Chancery',cursive; font-size:1.3rem; color:#8a6f3a; font-weight:400; }
    .rsvp-grid { display:grid; grid-template-columns:auto 1fr; gap:.5rem .75rem; width:100%; align-items:center; }
    .rsvp-grid label { display:contents; }
    .rsvp-grid label > select { width:100%; min-width:0; }
    .rsvp-big .rsvp-grid { max-width:520px; }
    label { display:flex; flex-direction:column; gap:.2rem; font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; color:#8a7a55; }
    select { padding:.55rem .7rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; background:#fff; color:#3a3327; }
    .rsvp-actions { display:flex; justify-content:center; }
    .rsvp-big .rsvp-actions { justify-content:center; }
    .soft { font:inherit; background:#8a6f3a; color:#faf5ea; border:0; padding:.55rem 1.1rem; border-radius:999px; cursor:pointer; letter-spacing:.06em; }
    .soft:hover { background:#6f5a2f; }
    .soft.big { padding:.7rem 1.6rem; font-size:1rem; }
    .soft:disabled { opacity:.6; cursor:default; }
    .note { font-style:italic; color:#7a6a4a; margin:0; }
    .error { color:#a23; margin:0; }
    .saved { color:#3a7a3a; margin:0; font-style:italic; }

    .foot { text-align:center; padding:3rem 0 0; }
    .foot .script { font-size:1.6rem; }
    .wishlist-link { text-align:center; padding:1.5rem 0 0; }
    .wl-btn { display:inline-flex; align-items:center; gap:.5rem; padding:.7rem 1.4rem; background:#fff; border:1px solid #ead9b3; border-radius:999px; color:#4a3f2a; text-decoration:none; font-family:'Georgia',serif; letter-spacing:.06em; }
    .wl-btn:hover { background:#fdf6e3; }
    .wl-btn .material-icons { color:#8a6f3a; }

    @media (max-width: 560px) {
      .hero h1 { font-size:2.6rem; }
      .t-item { padding:.75rem .8rem; }
      .t-head { gap:.75rem; }
      .t-time { flex-basis:5rem; padding-right:.6rem; }
      .t-hour { font-size:1.4rem; }
      .rsvp-big { margin-left:0; margin-right:0; padding:1.1rem; align-items:stretch; text-align:left; }
      .rsvp-big .rsvp-grid { max-width:none; }
      .rsvp-big .rsvp-actions { justify-content:stretch; }
      .rsvp-big .rsvp-actions .soft { width:100%; }
    }
  `],
})
export class WeddingEventComponent implements OnChanges {
  private readonly api = inject(HubApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly event = input.required<EventDetail>();
  readonly refresh = output<void>();

  protected readonly statuses = RSVP_STATUSES;
  protected readonly languages = LANGUAGES;
  protected readonly langOverride = signal<LanguageCode | null>(null);
  protected readonly lang = computed<LanguageCode>(() =>
    this.langOverride() ?? (this.auth.me()?.preferredLanguage as LanguageCode) ?? DEFAULT_LANGUAGE);

  protected tr(ev: EventDetail | ChildEvent): string {
    return localizedTitle(ev, this.lang());
  }
  protected dr(ev: EventDetail | ChildEvent): string {
    return localizedDescription(ev, this.lang());
  }
  protected dc(ev: EventDetail | ChildEvent): string {
    return localizedDressCode(ev, this.lang());
  }
  protected locLabel(ev: EventDetail | ChildEvent): string {
    return (ev.locationLabel ?? '').trim() || ev.location;
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
  protected status: InviteStatus = 'Pending';
  protected mealChoice = '';
  protected drinkChoice = '';
  protected readonly rsvpSaving = signal(false);
  protected readonly rsvpError = signal('');
  protected readonly rsvpSavedAt = signal(0);

  private readonly childStates = signal(new Map<number, ChildRsvpState>());

  protected readonly bannerImage = computed<EventImage | null>(() =>
    this.event()?.images.find(i => i.role === 'Banner') ?? null);
  protected readonly albumImages = computed<EventImage[]>(() =>
    this.event()?.images.filter(i => i.role === 'Album') ?? []);

  // True when each child event collects its own RSVP. In that mode we hide
  // the parent-level date in the hero, the parent Save-the-Date, and the
  // big parent RSVP card — guests reply per child instead.
  protected readonly perChildRsvp = computed(() => {
    const ev = this.event();
    return !!ev && ev.children.length > 0 && !ev.collectChildRsvps;
  });

  ngOnChanges(): void {
    const ev = this.event();
    if (!ev) return;
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

  protected formatLong(iso: string): string {
    return new Date(iso).toLocaleDateString(localeFor(this.lang()), {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  protected formatDay(iso: string): string {
    return new Date(iso).toLocaleDateString(localeFor(this.lang()), { weekday: 'short', day: 'numeric', month: 'short' });
  }

  protected formatHour(iso: string): string {
    return new Date(iso).toLocaleTimeString(localeFor(this.lang()), { hour: '2-digit', minute: '2-digit' });
  }

  protected openAlbum(img: EventImage): void {
    this.router.navigate(['/event', this.event().id, 'album', img.id]);
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
      await this.api.rsvp(ev.id, {
        status: this.status,
        mealChoice: ev.mealOptions.length ? this.mealChoice : undefined,
        drinkChoice: ev.drinkOptions.length ? this.drinkChoice : undefined,
      });
      this.rsvpSavedAt.set(Date.now());
      this.refresh.emit();
    } catch (e: any) {
      this.rsvpError.set(e?.error ?? 'Could not save RSVP.');
    } finally {
      this.rsvpSaving.set(false);
    }
  }

  async saveChildRsvp(child: ChildEvent, state: ChildRsvpState): Promise<void> {
    state.saving = true;
    state.error = '';
    try {
      await this.api.rsvp(child.id, {
        status: state.status,
        mealChoice: child.mealOptions.length ? state.mealChoice : undefined,
        drinkChoice: child.drinkOptions.length ? state.drinkChoice : undefined,
      });
      state.savedAt = Date.now();
    } catch (e: any) {
      state.error = e?.error ?? 'Could not save RSVP.';
    } finally {
      state.saving = false;
    }
  }
}
