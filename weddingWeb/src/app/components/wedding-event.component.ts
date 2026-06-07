import { Component, OnChanges, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EventImageComponent } from './event-image.component';
import { EventMarginsComponent } from './event-margins.component';
import { ImageCarouselComponent } from './image-carousel.component';
import { MapViewComponent } from './map-view.component';
import { SaveTheDateComponent } from './save-the-date.component';
import { HubApi } from '../services/hub-api.service';
import { ChildEvent, EventDetail, EventImage, InviteStatus } from '../models';

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
  imports: [FormsModule, RouterLink, EventImageComponent, EventMarginsComponent, ImageCarouselComponent, MapViewComponent, SaveTheDateComponent],
  template: `
    @if (event(); as ev) {
      <app-event-margins [event]="ev" />
      <div class="wedding">
        @if (ev.isOwner) {
          <a class="edit-link" [routerLink]="['/event', ev.id, 'edit']" title="Edit">Edit</a>
        }
        @if (bannerImage(); as banner) {
          <div class="hero">
            <app-event-image [eventId]="ev.id" [imageId]="banner.id" [alt]="banner.description || ev.title" />
            <div class="hero-veil"></div>
            <div class="hero-text">
              <p class="kicker">together with their families</p>
              <h1>{{ ev.title }}</h1>
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
            <p class="kicker">together with their families</p>
            <h1>{{ ev.title }}</h1>
            @if (!perChildRsvp()) {
              <p class="kicker">{{ formatLong(ev.startUtc) }}</p>
            }
            @if (ev.location) { <p class="where">{{ ev.location }}</p> }
          </header>
        }

        <section class="save">
          @if (!perChildRsvp()) {
            <app-save-the-date
              [title]="ev.title"
              [startUtc]="ev.startUtc"
              [endUtc]="ev.endUtc"
              [location]="ev.location"
              [description]="ev.description" />
          }
        </section>

        @if (ev.description) {
          <section class="prose">
            <p>{{ ev.description }}</p>
          </section>
        }

        @if (ev.location) {
          <section class="map">
            <app-map-view [location]="ev.location" />
          </section>
        }

        @if (albumImages().length) {
          <section class="album">
            <h2 class="script">Moments</h2>
            <app-image-carousel [eventId]="ev.id" [images]="albumImages()" (open)="openAlbum($event)" />
          </section>
        }

        @if (ev.children.length) {
          <section class="schedule">
            <h2 class="script">The day</h2>
            <ol class="timeline">
              @for (c of ev.children; track c.id) {
                <li class="t-item">
                  <div class="t-time">
                    <span class="t-day">{{ formatDay(c.startUtc) }}</span>
                    <span class="t-hour">{{ formatHour(c.startUtc) }}</span>
                  </div>
                  <div class="t-body">
                    <h3>{{ c.title }}</h3>
                    @if (c.location) {
                      <p class="t-where">
                        <a [href]="mapsUrl(c.location)" target="_blank" rel="noopener">{{ c.location }}</a>
                      </p>
                    }
                    @if (c.description) {
                      <p class="t-desc">{{ c.description }}</p>
                    }
                    <app-save-the-date
                      [title]="c.title"
                      [startUtc]="c.startUtc"
                      [endUtc]="c.endUtc"
                      [location]="c.location"
                      [description]="c.description"
                      [compact]="true" />
                    @if (c.location) {
                      <div class="t-map">
                        <app-map-view [location]="c.location" />
                      </div>
                    }

                    @if (perChildRsvp() && childState(c.id); as st) {
                      <div class="rsvp">
                        <h4>Will you be there?</h4>
                        @if (st.error) { <p class="error">{{ st.error }}</p> }
                        @if (st.savedAt) { <p class="saved">Thank you ♥</p> }
                        <div class="rsvp-grid">
                          <label>Reply
                            <select [name]="'cs-' + c.id" [(ngModel)]="st.status">
                              @for (s of statuses; track s) {
                                <option [value]="s">{{ s }}</option>
                              }
                            </select>
                          </label>
                          @if (c.mealOptions.length) {
                            <label>Meal
                              <select [name]="'cm-' + c.id" [(ngModel)]="st.mealChoice">
                                <option [ngValue]="''">— No preference —</option>
                                @for (m of c.mealOptions; track m) {
                                  <option [ngValue]="m">{{ m }}</option>
                                }
                              </select>
                            </label>
                          }
                          @if (c.drinkOptions.length) {
                            <label>Drink
                              <select [name]="'cd-' + c.id" [(ngModel)]="st.drinkChoice">
                                <option [ngValue]="''">— No preference —</option>
                                @for (d of c.drinkOptions; track d) {
                                  <option [ngValue]="d">{{ d }}</option>
                                }
                              </select>
                            </label>
                          }
                        </div>
                        <div class="rsvp-actions">
                          <button type="button" class="soft" (click)="saveChildRsvp(c, st)" [disabled]="st.saving">
                            {{ st.saving ? 'Saving…' : 'Save reply' }}
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                </li>
              }
            </ol>
          </section>
        }

        @if (!perChildRsvp()) {
          <section class="rsvp-big">
            <h2 class="script">RSVP</h2>
            @if (ev.collectChildRsvps && ev.children.length) {
              <p class="note">Your reply will apply to every part of the day.</p>
            }
            @if (rsvpError()) { <p class="error">{{ rsvpError() }}</p> }
            @if (rsvpSavedAt()) { <p class="saved">Thank you ♥</p> }
            <div class="rsvp-grid">
              <label>Reply
                <select name="status" [(ngModel)]="status">
                  @for (s of statuses; track s) {
                    <option [value]="s">{{ s }}</option>
                  }
                </select>
              </label>
              @if (ev.mealOptions.length) {
                <label>Meal
                  <select name="meal" [(ngModel)]="mealChoice">
                    <option [ngValue]="''">— No preference —</option>
                    @for (m of ev.mealOptions; track m) {
                      <option [ngValue]="m">{{ m }}</option>
                    }
                  </select>
                </label>
              }
              @if (ev.drinkOptions.length) {
                <label>Drink
                  <select name="drink" [(ngModel)]="drinkChoice">
                    <option [ngValue]="''">— No preference —</option>
                    @for (d of ev.drinkOptions; track d) {
                      <option [ngValue]="d">{{ d }}</option>
                    }
                  </select>
                </label>
              }
            </div>
            <div class="rsvp-actions">
              <button type="button" class="soft big" (click)="saveRsvp()" [disabled]="rsvpSaving()">
                {{ rsvpSaving() ? 'Saving…' : 'Send reply' }}
              </button>
            </div>
          </section>
        }

        <footer class="foot">
          <p class="script">with love</p>
        </footer>
      </div>
    }
  `,
  styles: [`
    :host { display:block; background:#fbf6ec; color:#3a3327; min-height:100vh; font-family:'Georgia', 'Cormorant Garamond', serif; }
    .wedding { max-width:780px; margin:0 auto; padding:0 0 4rem; position:relative; }
    .edit-link { position:fixed; top:1rem; right:1rem; z-index:10; background:rgba(255,255,255,.85); color:#4a3f2a; padding:.4rem .9rem; border-radius:999px; font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; text-decoration:none; border:1px solid #ead9b3; }
    .edit-link:hover { background:#fff; }
    .script { font-family:'Brush Script MT','Apple Chancery',cursive; font-weight:400; font-size:2.2rem; color:#8a6f3a; text-align:center; margin:2.2rem 0 1rem; }
    .hero { position:relative; height:50vh; overflow:hidden; background:#f1e0c2; }
    .hero app-event-image { display:block; width:100%; height:100%; }
    .hero ::ng-deep img { width:100%; height:100%; object-fit:cover; display:block; max-width:none; }
    .hero-veil { position:absolute; inset:0; background:linear-gradient(180deg, rgba(251,246,236,0) 35%, rgba(251,246,236,.85) 100%); }
    .hero-text { position:absolute; left:0; right:0; bottom:1.5rem; text-align:center; padding:0 1rem; }
    .hero.plain { position:relative; height:auto; padding:4rem 1rem 2rem; text-align:center; background:transparent; }
    .hero.plain .hero-text { position:static; }
    .hero h1 { font-family:'Brush Script MT','Apple Chancery',cursive; font-weight:400; font-size:3.4rem; color:#3a3327; margin:.4rem 0; line-height:1; letter-spacing:.02em; }
    .kicker { font-style:italic; color:#7a6a4a; letter-spacing:.18em; text-transform:lowercase; font-size:.85rem; margin:.2rem 0; }
    .where { font-style:italic; color:#5a4f37; margin:.3rem 0 0; }

    .save { display:flex; justify-content:center; margin-top:1.5rem; padding:0 1rem; }
    .prose { padding:1rem 1.5rem; text-align:center; line-height:1.7; color:#4a402d; font-size:1.05rem; }
    .map { padding:0 1.5rem; }
    .album { padding:0 1.5rem; }

    .schedule { padding:0 1.5rem; }
    .timeline { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:1.5rem; counter-reset:t; }
    .t-item { display:grid; grid-template-columns:7rem 1fr; gap:1rem; align-items:flex-start; }
    .t-time { text-align:right; padding-top:.25rem; border-right:1px solid #e0d2ad; padding-right:1rem; }
    .t-day { display:block; font-size:.7rem; letter-spacing:.18em; text-transform:uppercase; color:#a08755; }
    .t-hour { display:block; font-family:'Brush Script MT','Apple Chancery',cursive; font-size:1.8rem; color:#8a6f3a; line-height:1; margin-top:.2rem; }
    .t-body h3 { font-family:'Brush Script MT','Apple Chancery',cursive; font-weight:400; font-size:1.9rem; color:#3a3327; margin:0 0 .25rem; }
    .t-where { font-style:italic; color:#7a6a4a; margin:0 0 .35rem; }
    .t-desc { margin:0 0 .75rem; line-height:1.6; color:#4a402d; }
    .t-map { margin:.75rem 0; }

    .rsvp, .rsvp-big { background:#fff; border:1px solid #ead9b3; border-radius:.8rem; padding:1rem 1.25rem; display:flex; flex-direction:column; gap:.6rem; margin-top:.75rem; }
    .rsvp-big { margin:1.5rem 1.5rem 0; padding:1.5rem; align-items:center; text-align:center; }
    .rsvp h4 { margin:0; font-family:'Brush Script MT','Apple Chancery',cursive; font-size:1.3rem; color:#8a6f3a; font-weight:400; }
    .rsvp-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px,1fr)); gap:.6rem; width:100%; }
    .rsvp-big .rsvp-grid { max-width:520px; }
    label { display:flex; flex-direction:column; gap:.2rem; font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; color:#8a7a55; }
    select { padding:.55rem .7rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; background:#fff; color:#3a3327; }
    .rsvp-actions { display:flex; justify-content:flex-end; }
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

    @media (max-width: 560px) {
      .hero h1 { font-size:2.6rem; }
      .t-item { grid-template-columns:5rem 1fr; }
      .t-hour { font-size:1.4rem; }
      .rsvp-big { margin-left:1rem; margin-right:1rem; padding:1.1rem; }
    }
  `],
})
export class WeddingEventComponent implements OnChanges {
  private readonly api = inject(HubApi);
  private readonly router = inject(Router);

  readonly event = input.required<EventDetail>();
  readonly refresh = output<void>();

  protected readonly statuses = RSVP_STATUSES;
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
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  protected formatDay(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  protected formatHour(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
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
