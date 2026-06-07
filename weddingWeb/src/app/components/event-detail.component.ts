import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { EventImageComponent } from './event-image.component';
import { ImageCarouselComponent } from './image-carousel.component';
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
  selector: 'app-event-detail',
  imports: [FormsModule, NavbarComponent, RouterLink, EventImageComponent, ImageCarouselComponent],
  template: `
    <app-navbar />
    <main class="shell">
      @if (loading()) {
        <p>Loading…</p>
      } @else if (notFound()) {
        <p>Event not found.</p>
      } @else if (event(); as ev) {
        @if (bannerImage(); as banner) {
          <div class="banner">
            <app-event-image [eventId]="ev.id" [imageId]="banner.id" [alt]="banner.description || ev.title" />
          </div>
        }
        <header class="head">
          <div class="title">
            <span class="kind" [class.wedding]="ev.type === 'Wedding'">{{ typeLabel(ev.type) }}</span>
            <h1>{{ ev.title }}</h1>
            <p class="muted">Hosted by {{ ev.createdByDisplayName || '—' }}</p>
          </div>
          <div class="head-actions">
            <button type="button" class="ghost" (click)="back()">Back</button>
            @if (ev.isOwner) {
              <a class="primary" [routerLink]="['/event', ev.id, 'edit']">Edit</a>
            }
          </div>
        </header>

        <section class="card">
          <h2>When &amp; where</h2>
          <p><strong>Start:</strong> {{ formatDate(ev.startUtc) }}</p>
          <p><strong>End:</strong> {{ formatDate(ev.endUtc) }}</p>
          @if (ev.location) {
            <p><strong>Location:</strong> {{ ev.location }}</p>
          }
          @if (ev.description) {
            <p class="desc">{{ ev.description }}</p>
          }
        </section>

        @if (albumImages().length || canUploadAlbum(ev)) {
          <section class="card">
            <h2>Album ({{ albumImages().length }})</h2>
            @if (albumImages().length) {
              <app-image-carousel [eventId]="ev.id" [images]="albumImages()" (open)="openAlbum($event)" />
            } @else {
              <p class="muted">No album images yet.</p>
            }

            @if (canUploadAlbum(ev)) {
              <div class="album-upload">
                <input type="file" accept="image/*" (change)="onAlbumFile($event)" />
                <input type="text" placeholder="Description (optional)" [(ngModel)]="albumDescription" name="albumDescription" />
                <button type="button" class="primary" (click)="uploadAlbum()" [disabled]="!albumFile || albumUploading()">
                  {{ albumUploading() ? 'Uploading…' : 'Add to album' }}
                </button>
              </div>
              @if (albumError()) { <p class="error">{{ albumError() }}</p> }
            }
          </section>
        }

        @if (showParentRsvp(ev)) {
          <section class="card">
            <h2>Your RSVP</h2>
            @if (ev.children.length && ev.collectChildRsvps) {
              <p class="muted small">This response also applies to all child events.</p>
            }
            @if (rsvpError()) { <p class="error">{{ rsvpError() }}</p> }
            @if (rsvpSavedAt()) { <p class="saved">Saved.</p> }
            <div class="grid">
              <label>Attending
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
            <div class="actions">
              <button type="button" class="primary" (click)="saveRsvp()" [disabled]="rsvpSaving()">
                {{ rsvpSaving() ? 'Saving…' : 'Save RSVP' }}
              </button>
            </div>
          </section>
        }

        @if (ev.children.length && !ev.collectChildRsvps) {
          @for (c of ev.children; track c.id) {
            <section class="card child">
              <header class="child-head">
                <span class="kind" [class.wedding]="c.type === 'Wedding'">{{ typeLabel(c.type) }}</span>
                <h2>{{ c.title }}</h2>
              </header>
              <p><strong>Start:</strong> {{ formatDate(c.startUtc) }}</p>
              <p><strong>End:</strong> {{ formatDate(c.endUtc) }}</p>
              @if (c.location) { <p><strong>Location:</strong> {{ c.location }}</p> }
              @if (c.description) { <p class="desc">{{ c.description }}</p> }

              @if (childState(c.id); as st) {
                <div class="rsvp-block">
                  <h3>Your RSVP</h3>
                  @if (st.error) { <p class="error">{{ st.error }}</p> }
                  @if (st.savedAt) { <p class="saved">Saved.</p> }
                  <div class="grid">
                    <label>Attending
                      <select [name]="'cstatus-' + c.id" [(ngModel)]="st.status">
                        @for (s of statuses; track s) {
                          <option [value]="s">{{ s }}</option>
                        }
                      </select>
                    </label>
                    @if (c.mealOptions.length) {
                      <label>Meal
                        <select [name]="'cmeal-' + c.id" [(ngModel)]="st.mealChoice">
                          <option [ngValue]="''">— No preference —</option>
                          @for (m of c.mealOptions; track m) {
                            <option [ngValue]="m">{{ m }}</option>
                          }
                        </select>
                      </label>
                    }
                    @if (c.drinkOptions.length) {
                      <label>Drink
                        <select [name]="'cdrink-' + c.id" [(ngModel)]="st.drinkChoice">
                          <option [ngValue]="''">— No preference —</option>
                          @for (d of c.drinkOptions; track d) {
                            <option [ngValue]="d">{{ d }}</option>
                          }
                        </select>
                      </label>
                    }
                  </div>
                  <div class="actions">
                    <button type="button" class="primary" (click)="saveChildRsvp(c)" [disabled]="st.saving">
                      {{ st.saving ? 'Saving…' : 'Save RSVP' }}
                    </button>
                  </div>
                </div>
              }
            </section>
          }
        }

        @if (ev.isOwner || ev.showInviteesToGuests) {
          <section class="card">
            <h2>Invitees ({{ ev.invites.length }})</h2>
            @if (!ev.invites.length) {
              <p class="muted">No invitees yet.</p>
            } @else {
              <ul class="invites">
                @for (i of ev.invites; track i.id) {
                  <li>
                    <strong>{{ i.inviteeDisplayName || i.inviteeEmail }}</strong>
                    <span class="badge">{{ i.status }}</span>
                    @if (i.mealChoice) { <span class="chip">Meal: {{ i.mealChoice }}</span> }
                    @if (i.drinkChoice) { <span class="chip">Drink: {{ i.drinkChoice }}</span> }
                  </li>
                }
              </ul>
            }
          </section>
        }
      }
    </main>
  `,
  styles: [`
    .shell { max-width:900px; margin:0 auto; padding:1.25rem; display:flex; flex-direction:column; gap:1rem; }
    .head { display:flex; align-items:flex-start; gap:1rem; }
    .head .title { flex:1; }
    .head h1 { margin:.15rem 0 0; }
    .banner { border-radius:.6rem; overflow:hidden; max-height:320px; background:#f1e0c2; display:flex; align-items:center; justify-content:center; }
    .banner ::ng-deep img { width:100%; height:100%; max-height:320px; object-fit:cover; }
    .caption { margin:0; text-align:center; }
    .album-upload { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; margin-top:.5rem; padding-top:.75rem; border-top:1px dashed #e6e1d4; }
    .album-upload input[type=text] { flex:1; min-width:200px; padding:.4rem .6rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; }
    .head-actions { display:flex; gap:.5rem; }
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

  protected readonly event = signal<EventDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

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
    return new Date(iso).toLocaleString();
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
