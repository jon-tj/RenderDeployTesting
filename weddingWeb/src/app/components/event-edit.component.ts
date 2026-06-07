import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { InvitePickerComponent } from './invite-picker.component';
import { ChildPickerComponent } from './child-picker.component';
import { EventImageComponent } from './event-image.component';
import { HubApi } from '../services/hub-api.service';
import { AuthService } from '../services/auth.service';
import { EVENT_TYPES, EVENT_VISIBILITIES, ChildEvent, DEFAULT_LANGUAGE, EventDetail, EventImage, EventOwner, EventSummary, EventTranslation, EventType, EventVisibility, IMAGE_ROLES, ImageRole, Invite, LANGUAGES, LanguageCode, UserSummary } from '../models';
import { localizedOption, localizedTitle, t } from '../utils/i18n';

@Component({
  selector: 'app-event-edit',
  imports: [FormsModule, NavbarComponent, InvitePickerComponent, ChildPickerComponent, EventImageComponent, RouterLink, DatePipe],
  template: `
    <app-navbar />
    <main class="shell">
      @if (loading()) {
        <p>Loading…</p>
      } @else if (notFound()) {
        <p>Event not found.</p>
      } @else if (event(); as ev) {
        @if (!ev.isOwner) {
          <section class="card">
            <h2>{{ ev.title }}</h2>
            <p class="error">You do not have rights to edit this event.</p>
            <div class="head-actions">
              <a class="primary" [routerLink]="['/event', ev.id]">View event</a>
            </div>
          </section>
        } @else {
        <header class="head">
          <h1>{{ ev.isOwner ? 'Edit event' : ev.title }}</h1>
          <div class="head-actions">
            <a class="ghost" [routerLink]="['/event', ev.id]">View</a>
            @if (ev.isOwner) {
              <button type="button" class="danger" (click)="remove()">Delete</button>
            }
          </div>
        </header>

        @if (error()) { <p class="error">{{ error() }}</p> }
        @if (savedAt()) { <p class="saved">Saved.</p> }

        <section class="card">
          <h2>Details</h2>
          <div class="grid">
            <label>Type
              <select [(ngModel)]="type" name="type" [disabled]="!ev.isOwner" (change)="save()">
                @for (t of allowedTypes(); track t) {
                  <option [value]="t">{{ t === 'FamilyGathering' ? 'Family gathering' : t }}</option>
                }
              </select>
            </label>
            <label>Title
              <div class="with-lang">
                <input name="title" [ngModel]="titleText()" (ngModelChange)="setTitleText($event)"
                  [disabled]="!ev.isOwner" (blur)="save()" />
                @if (enableTranslations) {
                  <select class="lang-pill" [(ngModel)]="titleLang" name="titleLang" title="Editing language">
                    @for (l of languages; track l.code) {
                      <option [value]="l.code">{{ l.short }}</option>
                    }
                  </select>
                }
              </div>
            </label>
            <label>Location
              <input name="location" [(ngModel)]="location" [disabled]="!ev.isOwner" (blur)="save()" />
            </label>
            <label>Start
              <input type="datetime-local" name="start" [(ngModel)]="startLocal" [disabled]="!ev.isOwner" (change)="save()" />
            </label>
            <label>End
              <input type="datetime-local" name="end" [(ngModel)]="endLocal" [disabled]="!ev.isOwner" (change)="save()" />
            </label>
            <label>Visibility
              <select name="visibility" [(ngModel)]="visibility" [disabled]="!ev.isOwner" (change)="saveVisibility()">
                @for (v of allVisibilities; track v) {
                  <option [value]="v">{{ visibilityLabel(v) }}</option>
                }
              </select>
            </label>
          </div>
          @if (ev.isOwner) {
            <p class="muted small">{{ visibilityHelp(visibility) }}</p>
          }
          @if (ev.isOwner) {
            <label class="check">
              <input type="checkbox" name="enableTranslations"
                [(ngModel)]="enableTranslations" (change)="save()" />
              Enable translations
            </label>
            <p class="muted small">When on, you can write the title and description for multiple languages. Guests see the version that matches their preferred language, falling back to English.</p>
          }
          <label class="block">Description
            <div class="with-lang">
              <textarea name="description" rows="4" [ngModel]="descriptionText()" (ngModelChange)="setDescriptionText($event)"
                [disabled]="!ev.isOwner" (blur)="save()"></textarea>
              @if (enableTranslations) {
                <select class="lang-pill" [(ngModel)]="descLang" name="descLang" title="Editing language">
                  @for (l of languages; track l.code) {
                    <option [value]="l.code">{{ l.short }}</option>
                  }
                </select>
              }
            </div>
          </label>
        </section>

        <section class="card">
          <h2>Food &amp; drink options</h2>
          <p class="muted">One option per line. Invitees pick from these when they RSVP.</p>
          <div class="grid">
            <label class="block">Meal options
              <textarea name="mealOptions" rows="5" placeholder="e.g. Chicken&#10;Beef&#10;Vegetarian"
                [(ngModel)]="mealOptionsText" [disabled]="!ev.isOwner" (blur)="save()"></textarea>
            </label>
            <label class="block">Drink options
              <textarea name="drinkOptions" rows="5" placeholder="e.g. Red wine&#10;White wine&#10;Soft drink"
                [(ngModel)]="drinkOptionsText" [disabled]="!ev.isOwner" (blur)="save()"></textarea>
            </label>
          </div>
          @if (ev.isOwner && (mealOptionsList().length || drinkOptionsList().length)) {
            <div class="dining-plan-actions">
              <select name="planLang" [(ngModel)]="planLang" [attr.aria-label]="'Language'">
                @for (l of languages; track l.code) {
                  <option [value]="l.code">{{ l.label }}</option>
                }
              </select>
              <button type="button" class="ghost small" (click)="printDiningPlan(ev)">Print dining plan</button>
            </div>
          }
          @if (enableTranslations && (mealOptionsList().length || drinkOptionsList().length)) {
            <div class="opt-trans">
              <div class="opt-trans-head">
                <span class="muted small">Translate options for</span>
                <select name="optLang" [(ngModel)]="optionLang">
                  @for (l of nonDefaultLanguages; track l.code) {
                    <option [value]="l.code">{{ l.label }}</option>
                  }
                </select>
              </div>
              @if (mealOptionsList().length) {
                <div class="opt-trans-block">
                  <h3>Meal</h3>
                  @for (m of mealOptionsList(); track m) {
                    <label class="opt-row">
                      <span class="opt-src">{{ m }}</span>
                      <input type="text" [name]="'mt-' + m"
                        [ngModel]="optionTranslation('meal', m)"
                        (ngModelChange)="setOptionTranslation('meal', m, $event)"
                        (blur)="save()"
                        [placeholder]="m" />
                    </label>
                  }
                </div>
              }
              @if (drinkOptionsList().length) {
                <div class="opt-trans-block">
                  <h3>Drink</h3>
                  @for (d of drinkOptionsList(); track d) {
                    <label class="opt-row">
                      <span class="opt-src">{{ d }}</span>
                      <input type="text" [name]="'dt-' + d"
                        [ngModel]="optionTranslation('drink', d)"
                        (ngModelChange)="setOptionTranslation('drink', d, $event)"
                        (blur)="save()"
                        [placeholder]="d" />
                    </label>
                  }
                </div>
              }
            </div>
          }
        </section>

        <section class="card">
          <h2>Invites</h2>
          @if (ev.isOwner) {
            <label class="check">
              <input type="checkbox" name="showInvitees"
                [(ngModel)]="showInviteesToGuests"
                (change)="saveShowInviteesToGuests()" />
              Show invitee list to participants
            </label>
            <p class="muted small">When off, only you (the owner) can see who else is invited. Participants still see their own RSVP.</p>
            <app-invite-picker [nextPath]="'/event/' + ev.id" (picked)="addInvite($event)" />
          }
          @if (!ev.invites.length) {
            <p class="muted">No invites yet.</p>
          } @else {
            <ul class="invites">
              @for (i of ev.invites; track i.id) {
                <li>
                  <div>
                    <strong>{{ i.inviteeDisplayName || i.inviteeEmail }}</strong>
                    <span class="muted"> · {{ i.inviteeEmail }}</span>
                    @if (i.emailSentUtc) {
                      <span class="muted small"> · emailed {{ i.emailSentUtc | date:'short' }}</span>
                    }
                  </div>
                  <span class="badge" [class.warn]="!i.isOnboarded">{{ !i.isOnboarded ? 'Not onboarded' : i.status }}</span>
                  @if (ev.isOwner) {
                    <button type="button" class="ghost small"
                      [disabled]="sendingInviteId() === i.id"
                      (click)="sendInviteEmail(i)">
                      {{ sendingInviteId() === i.id ? 'Sending…' : (i.emailSentUtc ? 'Resend email' : 'Send email') }}
                    </button>
                    <button type="button" class="ghost small" (click)="removeInvite(i)">Remove</button>
                  }
                </li>
              }
            </ul>
            @if (ev.isOwner && pendingEmailCount() > 0) {
              <div class="invites-actions">
                <button type="button" class="ghost small"
                  [disabled]="sendingPending()"
                  (click)="sendPendingInviteEmails()">
                  {{ sendingPending() ? 'Sending…' : 'Email ' + pendingEmailCount() + ' new invitee(s)' }}
                </button>
              </div>
            }
            @if (inviteEmailError()) {
              <p class="error small">{{ inviteEmailError() }}</p>
            }
          }
        </section>

        <section class="card">
          <h2>Owners</h2>
          <ul class="invites">
            <li>
              <div>
                <strong>{{ ev.createdByDisplayName || ev.createdById }}</strong>
                <span class="muted"> · creator</span>
              </div>
              <span class="badge">Owner</span>
            </li>
            @for (o of ev.coOwners; track o.userId) {
              <li>
                <div>
                  <strong>{{ o.displayName || o.email }}</strong>
                  <span class="muted"> · {{ o.email }}</span>
                </div>
                <span class="badge">Co-owner</span>
                @if (ev.isOwner) {
                  <button type="button" class="ghost small" (click)="removeCoOwner(o)">Remove</button>
                }
              </li>
            }
          </ul>
          @if (ev.isOwner) {
            <p class="muted small">Co-owners can edit, delete, and manage this event the same as you.</p>
            <app-invite-picker [nextPath]="'/event/' + ev.id" (picked)="addCoOwner($event)" />
          }
        </section>

        <section class="card">
          <h2>Child events</h2>
          @if (ev.parentEventId !== null) {
            <p class="warn">Recursive event depth can not exceed 1.</p>
            @if (ev.parentEventTitle) {
              <p class="muted">This event is a child of
                <a [routerLink]="['/event', ev.parentEventId, 'edit']">{{ ev.parentEventTitle }}</a>.
              </p>
            }
            <label class="check">
              <input type="checkbox" name="inherit"
                [(ngModel)]="inheritParentInvites"
                [disabled]="!ev.isOwner"
                (change)="saveInheritance()" />
              Inherit invites from parent event
            </label>
            <p class="muted small">When on, anyone invited to the parent (and its ancestors that opt in) can see this event too.</p>
          } @else {
            @if (ev.isOwner) {
              <app-child-picker [parentId]="ev.id" (added)="onChildAdded($event)" />
            }
            @if (ev.children.length) {
              <label class="check">
                <input type="checkbox" name="collect"
                  [(ngModel)]="collectChildRsvps"
                  [disabled]="!ev.isOwner"
                  (change)="saveCollectChildRsvps()" />
                Collect RSVPs across all child events
              </label>
              <p class="muted small">When on, invitees give one RSVP on this event and it applies to every child. When off, the view page hides this event's RSVP and asks for one per child event.</p>
            }
            @if (!ev.children.length) {
              <p class="muted">No child events yet.</p>
            } @else {
              <ul class="children">
                @for (c of ev.children; track c.id) {
                  <li>
                    <a [routerLink]="['/event', c.id, 'edit']" class="child-link">
                      <strong>{{ c.title }}</strong>
                      <span class="muted"> · {{ formatDate(c.startUtc) }}</span>
                    </a>
                    @if (ev.isOwner) {
                      <button type="button" class="ghost small" (click)="detachChild(c)">Detach</button>
                    }
                  </li>
                }
              </ul>
            }
          }
        </section>

        <section class="card">
          <h2>Images</h2>
          @if (ev.isOwner) {
            <label class="check">
              <input type="checkbox" name="guestAlbum"
                [(ngModel)]="allowGuestAlbumUploads"
                (change)="saveAllowGuestAlbumUploads()" />
              Let invitees upload to the album
            </label>
            <p class="muted small">When on, anyone who can see this event can add to the album. Banner and icon are always owner-only.</p>
          }

          <div class="upload">
            <label class="block small">Role
              <select name="newImageRole" [(ngModel)]="newImageRole" [disabled]="!ev.isOwner">
                @for (r of allowedImageRoles(ev); track r) {
                  <option [value]="r">{{ r }}</option>
                }
              </select>
            </label>
            <label class="block small">File
              <input type="file" accept="image/*" (change)="onImageFile($event)" />
            </label>
            <label class="block small grow">Description
              <input type="text" name="newImageDesc" [(ngModel)]="newImageDescription" placeholder="Optional" />
            </label>
            <button type="button" class="primary" (click)="uploadImage()" [disabled]="!newImageFile || imageUploading()">
              {{ imageUploading() ? 'Uploading\u2026' : 'Upload' }}
            </button>
          </div>
          @if (imageError()) { <p class="error">{{ imageError() }}</p> }

          @if (!ev.images.length) {
            <p class="muted">No images yet.</p>
          } @else {
            <ul class="images">
              @for (img of ev.images; track img.id) {
                <li>
                  <div class="thumb">
                    <app-event-image [eventId]="ev.id" [imageId]="img.id" [alt]="img.description || img.fileName" />
                  </div>
                  <div class="meta">
                    <div class="row">
                      <span class="badge">{{ img.role }}</span>
                      <span class="muted small">{{ img.fileName }}</span>
                    </div>
                    @if (img.canEdit) {
                      <input type="text"
                        [ngModel]="img.description"
                        (ngModelChange)="setImageDescription(img, $event)"
                        (blur)="saveImageDescription(img)"
                        [name]="'imgDesc-' + img.id"
                        placeholder="Description" />
                      @if (ev.isOwner) {
                        <select [ngModel]="img.role" (ngModelChange)="setImageRole(img, $event)"
                          (change)="saveImageRole(img)" [name]="'imgRole-' + img.id">
                          @for (r of allImageRoles; track r) {
                            <option [value]="r">{{ r }}</option>
                          }
                        </select>
                      }
                    } @else {
                      <p class="muted small">{{ img.description || '\u2014' }}</p>
                    }
                  </div>
                  @if (img.canEdit) {
                    <button type="button" class="ghost small" (click)="deleteImage(img)">Delete</button>
                  }
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
    .head { display:flex; align-items:center; gap:1rem; }
    .head h1 { flex:1; margin:0; }
    .head-actions { display:flex; gap:.5rem; }
    .card { background:#fff; border:1px solid #e6e1d4; border-radius:.6rem; padding:1rem 1.25rem; display:flex; flex-direction:column; gap:.75rem; }
    .card h2 { margin:0 0 .25rem; font-size:1.05rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:.75rem; }
    label { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; color:#5a5347; }
    label.block { display:flex; flex-direction:column; gap:.25rem; }
    input, select, textarea { padding:.5rem .65rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; }
    .ghost { background:transparent; border:1px solid #c9b88a; padding:.4rem .8rem; border-radius:.4rem; cursor:pointer; font:inherit; text-decoration:none; color:#2d2a24; display:inline-flex; align-items:center; }
    .ghost:hover { background:#f1e0c2; }
    .ghost.small { padding:.25rem .6rem; font-size:.8rem; }
    .danger { background:#a23; color:#fff; border:0; padding:.4rem .8rem; border-radius:.4rem; cursor:pointer; }
    .error { color:#a23; }
    .saved { color:#3a7a3a; }
    .muted { color:#8b8273; }
    ul.invites { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.5rem; }
    ul.invites li { display:flex; align-items:center; gap:.75rem; padding:.5rem .65rem; background:#faf7f0; border-radius:.4rem; }
    ul.invites li > div { flex:1; }
    .invites-actions { margin-top:.6rem; display:flex; justify-content:flex-end; }
    ul.children { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.4rem; }
    ul.children li { display:flex; align-items:center; gap:.75rem; padding:.4rem .65rem; background:#faf7f0; border-radius:.4rem; }
    a.child-link { flex:1; color:#2d2a24; text-decoration:none; }
    a.child-link:hover { text-decoration:underline; }
    .warn { color:#a23; margin:0; font-weight:600; }
    .check { flex-direction:row; align-items:center; gap:.5rem; font-size:.9rem; color:#2d2a24; }
    .check input { width:auto; }
    .small { font-size:.8rem; }
    .badge { background:#dfe6cf; padding:.15rem .5rem; border-radius:.25rem; font-size:.75rem; }
    .badge.warn { background:#f4d8a8; color:#6b4a17; }
    .upload { display:flex; flex-wrap:wrap; gap:.5rem; align-items:flex-end; }
    .upload .grow { flex:1; min-width:180px; }
    ul.images { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.5rem; }
    ul.images li { display:flex; gap:.75rem; align-items:flex-start; padding:.5rem .65rem; background:#faf7f0; border-radius:.4rem; }
    ul.images .thumb { width:96px; height:72px; flex:0 0 96px; overflow:hidden; border-radius:.3rem; background:#fff; display:flex; align-items:center; justify-content:center; }
    ul.images .thumb ::ng-deep img { width:100%; height:100%; object-fit:cover; }
    ul.images .meta { flex:1; display:flex; flex-direction:column; gap:.3rem; }
    ul.images .meta .row { display:flex; gap:.5rem; align-items:center; }
    .with-lang { position:relative; }
    .with-lang input, .with-lang textarea { width:100%; box-sizing:border-box; padding-right:3.5rem; }
    .with-lang .lang-pill { position:absolute; bottom:.25rem; right:.25rem; padding:.1rem .35rem; font-size:.7rem; background:#faf7f0; border:1px solid #d8cfb8; border-radius:.3rem; color:#5a5347; }
    .opt-trans { margin-top:.5rem; padding-top:.75rem; border-top:1px dashed #e6e1d4; display:flex; flex-direction:column; gap:.75rem; }
    .opt-trans-head { display:flex; align-items:center; gap:.5rem; }
    .opt-trans-block h3 { margin:0 0 .35rem; font-size:.9rem; color:#5a5347; }
    .opt-row { display:grid; grid-template-columns:minmax(120px,1fr) 2fr; gap:.5rem; align-items:center; margin-bottom:.35rem; }
    .opt-row .opt-src { font-size:.85rem; color:#5a5347; }
    .dining-plan-actions { display:flex; gap:.5rem; align-items:center; margin-top:.75rem; flex-wrap:wrap; }
    .dining-plan-actions select { padding:.25rem .5rem; font-size:.8rem; }
    .dining-plan-actions button { flex:1; justify-content:center; }
  `],
})
export class EventEditComponent implements OnInit {
  private readonly api = inject(HubApi);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly event = signal<EventDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly error = signal('');
  protected readonly savedAt = signal(0);
  protected readonly sendingInviteId = signal<number | null>(null);
  protected readonly sendingPending = signal(false);
  protected readonly inviteEmailError = signal('');
  protected readonly pendingEmailCount = computed(() =>
    this.event()?.invites.filter(i => !i.emailSentUtc).length ?? 0);

  protected type: EventType = 'FamilyGathering';
  protected title = '';
  protected location = '';
  protected description = '';
  protected startLocal = '';
  protected endLocal = '';
  protected mealOptionsText = '';
  protected drinkOptionsText = '';
  protected inheritParentInvites = false;
  protected collectChildRsvps = true;
  protected allowGuestAlbumUploads = false;
  protected showInviteesToGuests = true;
  protected visibility: EventVisibility = 'Closed';
  protected readonly allVisibilities = EVENT_VISIBILITIES;

  protected enableTranslations = false;
  protected translations: Record<string, EventTranslation> = {};
  protected titleLang: LanguageCode = DEFAULT_LANGUAGE;
  protected descLang: LanguageCode = DEFAULT_LANGUAGE;
  protected optionLang: LanguageCode = 'nb';
  protected planLang: LanguageCode = 'nb';
  protected readonly languages = LANGUAGES;
  protected readonly nonDefaultLanguages = LANGUAGES.filter(l => l.code !== DEFAULT_LANGUAGE);

  // New-image upload form
  protected newImageRole: ImageRole = 'Album';
  protected newImageDescription = '';
  protected newImageFile: File | null = null;
  protected readonly imageUploading = signal(false);
  protected readonly imageError = signal('');
  protected readonly allImageRoles = IMAGE_ROLES;

  async ngOnInit(): Promise<void> {
    // Subscribe so navigating between two /event/:id/edit URLs (e.g. via the
    // parent/child links) reloads the page instead of leaving stale state.
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
    this.error.set('');
    this.savedAt.set(0);
    try {
      const ev = await this.api.getEvent(id);
      this.apply(ev);
    } catch (e: any) {
      if (e?.status === 404 || e?.status === 403) this.notFound.set(true);
      else this.error.set('Could not load event.');
    } finally {
      this.loading.set(false);
    }
  }

  protected allowedTypes(): EventType[] {
    const me = this.auth.me();
    return EVENT_TYPES.filter(t => {
      if (t === 'Wedding') return !!me?.permissions.canCreateWeddingEvent;
      return !!(me?.permissions.canCreateFamilyGathering || me?.permissions.canCreateWeddingEvent);
    });
  }

  private apply(ev: EventDetail): void {
    this.event.set(ev);
    this.type = ev.type;
    this.title = ev.title;
    this.location = ev.location;
    this.description = ev.description;
    this.startLocal = toLocalInput(ev.startUtc);
    this.endLocal = toLocalInput(ev.endUtc);
    this.mealOptionsText = ev.mealOptions.join('\n');
    this.drinkOptionsText = ev.drinkOptions.join('\n');
    this.inheritParentInvites = ev.inheritParentInvites;
    this.collectChildRsvps = ev.collectChildRsvps;
    this.allowGuestAlbumUploads = ev.allowGuestAlbumUploads;
    this.showInviteesToGuests = ev.showInviteesToGuests;
    this.visibility = ev.visibility;
    this.enableTranslations = ev.enableTranslations;
    this.translations = { ...(ev.translations ?? {}) };
  }

  protected titleText(): string {
    if (this.titleLang === DEFAULT_LANGUAGE) return this.title;
    return this.translations[this.titleLang]?.title ?? '';
  }

  protected setTitleText(value: string): void {
    if (this.titleLang === DEFAULT_LANGUAGE) {
      this.title = value;
      return;
    }
    const cur = this.translations[this.titleLang] ?? { title: '', description: '' };
    this.translations = {
      ...this.translations,
      [this.titleLang]: { ...cur, title: value },
    };
  }

  protected descriptionText(): string {
    if (this.descLang === DEFAULT_LANGUAGE) return this.description;
    return this.translations[this.descLang]?.description ?? '';
  }

  protected setDescriptionText(value: string): void {
    if (this.descLang === DEFAULT_LANGUAGE) {
      this.description = value;
      return;
    }
    const cur = this.translations[this.descLang] ?? { title: '', description: '' };
    this.translations = {
      ...this.translations,
      [this.descLang]: { ...cur, description: value },
    };
  }

  protected mealOptionsList(): string[] {
    return parseOptionsText(this.mealOptionsText);
  }

  protected drinkOptionsList(): string[] {
    return parseOptionsText(this.drinkOptionsText);
  }

  protected optionTranslation(kind: 'meal' | 'drink', value: string): string {
    const entry = this.translations[this.optionLang];
    const map = kind === 'meal' ? entry?.mealOptions : entry?.drinkOptions;
    return map?.[value] ?? '';
  }

  protected setOptionTranslation(kind: 'meal' | 'drink', value: string, text: string): void {
    const cur = this.translations[this.optionLang] ?? { title: '', description: '' };
    const map = { ...(kind === 'meal' ? cur.mealOptions ?? {} : cur.drinkOptions ?? {}) };
    const trimmed = text?.trim() ?? '';
    if (trimmed) map[value] = trimmed;
    else delete map[value];
    this.translations = {
      ...this.translations,
      [this.optionLang]: {
        ...cur,
        ...(kind === 'meal' ? { mealOptions: map } : { drinkOptions: map }),
      },
    };
  }

  protected tr(key: Parameters<typeof t>[0], ...args: string[]): string {
    return t(key, this.planLang, ...args);
  }

  protected printDiningPlan(ev: EventDetail): void {
    const lang = this.planLang;
    const accepted = ev.invites.filter(i => i.status === 'Accepted');
    const acceptedCount = accepted.length;
    const buildSection = (kind: 'meal' | 'drink', options: string[]): string => {
      if (!options.length) return '';
      const counts = new Map<string, number>();
      options.forEach(o => counts.set(o, 0));
      let unspecified = 0;
      for (const inv of accepted) {
        const raw = (kind === 'meal' ? inv.mealChoice : inv.drinkChoice)?.trim() ?? '';
        if (raw && counts.has(raw)) counts.set(raw, counts.get(raw)! + 1);
        else unspecified += 1;
      }
      const specifiedTotal = options.reduce((s, o) => s + counts.get(o)!, 0);
      // Largest-remainder allocation so the "to order" column sums to acceptedCount.
      const toOrder = new Map<string, number>();
      const remainders: { opt: string; rem: number }[] = [];
      let assigned = 0;
      for (const o of options) {
        const requested = counts.get(o)!;
        const share = specifiedTotal > 0
          ? unspecified * (requested / specifiedTotal)
          : unspecified / options.length;
        const raw = requested + share;
        const floor = Math.floor(raw);
        toOrder.set(o, floor);
        remainders.push({ opt: o, rem: raw - floor });
        assigned += floor;
      }
      let leftover = Math.max(0, acceptedCount - assigned);
      remainders.sort((a, b) => b.rem - a.rem);
      for (const r of remainders) {
        if (leftover <= 0) break;
        toOrder.set(r.opt, toOrder.get(r.opt)! + 1);
        leftover -= 1;
      }
      const heading = this.tr(kind === 'meal' ? 'meal' : 'drink');
      const rows = options.map(o => {
        const label = escapeHtml(localizedOption(ev, lang, kind, o));
        return `<tr><td>${label}</td><td class="num">${counts.get(o)}</td><td class="num">${toOrder.get(o)}</td></tr>`;
      }).join('');
      const unspecRow = `<tr class="unspec"><td>${escapeHtml(this.tr('unspecified'))}</td><td class="num">${unspecified}</td><td class="num">0</td></tr>`;
      const totalOrdered = options.reduce((s, o) => s + toOrder.get(o)!, 0);
      const totalReq = specifiedTotal + unspecified;
      const totalRow = `<tr class="total"><td>${escapeHtml(this.tr('total'))}</td><td class="num">${totalReq}</td><td class="num">${totalOrdered}</td></tr>`;
      return `<section><h2>${escapeHtml(heading)}</h2><table>
        <thead><tr><th>${escapeHtml(this.tr('option'))}</th><th class="num">${escapeHtml(this.tr('requested'))}</th><th class="num">${escapeHtml(this.tr('toOrder'))}</th></tr></thead>
        <tbody>${rows}${unspecRow}${totalRow}</tbody></table></section>`;
    };
    const evTitle = escapeHtml(localizedTitle(ev, lang));
    const heading = escapeHtml(this.tr('diningPlan'));
    const sub = acceptedCount === 0
      ? escapeHtml(this.tr('noAcceptedInvitees'))
      : escapeHtml(this.tr('basedOnAccepted', String(acceptedCount)));
    const meals = buildSection('meal', this.mealOptionsList());
    const drinks = buildSection('drink', this.drinkOptionsList());
    const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
      <title>${heading} — ${evTitle}</title>
      <style>
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:#222; padding:2rem; max-width:720px; margin:0 auto; }
        h1 { margin:0 0 .25rem; font-size:1.5rem; }
        h2 { margin:1.5rem 0 .5rem; font-size:1.1rem; }
        .sub { color:#666; margin:0 0 1rem; font-size:.9rem; }
        table { width:100%; border-collapse:collapse; }
        th, td { padding:.45rem .6rem; border-bottom:1px solid #ddd; text-align:left; }
        th.num, td.num { text-align:right; font-variant-numeric:tabular-nums; }
        tr.unspec td { color:#666; font-style:italic; }
        tr.total td { font-weight:600; border-top:2px solid #222; border-bottom:none; }
        .toolbar { display:flex; justify-content:flex-end; margin-bottom:1rem; }
        .toolbar button { font:inherit; padding:.5rem 1rem; border:1px solid #222; background:#222; color:#fff; border-radius:.4rem; cursor:pointer; }
        .toolbar button:hover { background:#000; }
        @media print { body { padding:0; } .toolbar { display:none; } }
      </style></head><body>
      <div class="toolbar"><button type="button" onclick="window.print()">Print dining plan</button></div>
      <h1>${heading}</h1>
      <p class="sub">${evTitle} · ${sub}</p>
      ${meals}${drinks}
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  async save(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    try {
      const updated = await this.api.updateEvent(ev.id, {
        type: this.type,
        title: this.title,
        location: this.location,
        description: this.description,
        startUtc: fromLocalInput(this.startLocal),
        endUtc: fromLocalInput(this.endLocal),
        mealOptions: parseOptionsText(this.mealOptionsText),
        drinkOptions: parseOptionsText(this.drinkOptionsText),
        enableTranslations: this.enableTranslations,
        translations: this.translations,
      });
      this.apply(updated);
      this.savedAt.set(Date.now());
    } catch (e: any) {
      this.error.set('Could not save changes.');
    }
  }

  async addInvite(user: UserSummary): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    try {
      const invite = await this.api.addInvite(ev.id, user.id);
      const next: EventDetail = {
        ...ev,
        invites: [...ev.invites.filter(i => i.id !== invite.id), invite],
      };
      this.event.set(next);
    } catch (e: any) {
      this.error.set('Could not add invite.');
    }
  }

  async removeInvite(invite: Invite): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    try {
      await this.api.removeInvite(ev.id, invite.id);
      this.event.set({ ...ev, invites: ev.invites.filter(i => i.id !== invite.id) });
    } catch (e: any) {
      this.error.set('Could not remove invite.');
    }
  }

  async sendInviteEmail(invite: Invite): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    this.inviteEmailError.set('');
    this.sendingInviteId.set(invite.id);
    try {
      const updated = await this.api.sendInviteEmail(ev.id, invite.id);
      this.event.set({
        ...ev,
        invites: ev.invites.map(i => i.id === updated.id ? updated : i),
      });
    } catch {
      this.inviteEmailError.set('Could not send invitation email.');
    } finally {
      this.sendingInviteId.set(null);
    }
  }

  async sendPendingInviteEmails(): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    this.inviteEmailError.set('');
    this.sendingPending.set(true);
    try {
      await this.api.sendPendingInviteEmails(ev.id);
      const fresh = await this.api.getEvent(ev.id);
      this.event.set(fresh);
    } catch {
      this.inviteEmailError.set('Could not send pending invitation emails.');
    } finally {
      this.sendingPending.set(false);
    }
  }

  async addCoOwner(user: UserSummary): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    // The creator is implicitly an owner, so adding them is a no-op.
    if (user.id === ev.createdById) return;
    try {
      const owner = await this.api.addCoOwner(ev.id, user.id);
      const next: EventDetail = {
        ...ev,
        coOwners: ev.coOwners.some(o => o.userId === owner.userId)
          ? ev.coOwners
          : [...ev.coOwners, owner],
      };
      this.event.set(next);
    } catch (e: any) {
      this.error.set('Could not add co-owner.');
    }
  }

  async removeCoOwner(owner: EventOwner): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    try {
      await this.api.removeCoOwner(ev.id, owner.userId);
      this.event.set({ ...ev, coOwners: ev.coOwners.filter(o => o.userId !== owner.userId) });
    } catch (e: any) {
      this.error.set('Could not remove co-owner.');
    }
  }

  onChildAdded(child: EventSummary): void {
    const ev = this.event();
    if (!ev) return;
    const asChild: ChildEvent = {
      id: child.id,
      type: child.type,
      title: child.title,
      description: '',
      location: child.location,
      startUtc: child.startUtc,
      endUtc: child.endUtc,
      isOwner: child.isOwner,
      mealOptions: [],
      drinkOptions: [],
      enableTranslations: false,
      translations: {},
      myInvite: null,
    };
    const next: EventDetail = {
      ...ev,
      children: [...ev.children.filter(c => c.id !== asChild.id), asChild]
        .sort((a, b) => a.startUtc.localeCompare(b.startUtc)),
    };
    this.event.set(next);
  }

  async detachChild(child: ChildEvent): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    try {
      await this.api.updateEvent(child.id, { parentEventId: null });
      this.event.set({ ...ev, children: ev.children.filter(c => c.id !== child.id) });
    } catch (e: any) {
      this.error.set('Could not detach child event.');
    }
  }

  async saveInheritance(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    try {
      const updated = await this.api.updateEvent(ev.id, { inheritParentInvites: this.inheritParentInvites });
      this.apply(updated);
      this.savedAt.set(Date.now());
    } catch (e: any) {
      this.error.set('Could not update inheritance.');
    }
  }

  async saveCollectChildRsvps(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    try {
      const updated = await this.api.updateEvent(ev.id, { collectChildRsvps: this.collectChildRsvps });
      this.apply(updated);
      this.savedAt.set(Date.now());
    } catch (e: any) {
      this.error.set('Could not update RSVP collection.');
    }
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  async remove(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    if (!confirm('Delete this event?')) return;
    try {
      await this.api.deleteEvent(ev.id);
      this.router.navigate(['/']);
    } catch (e: any) {
      this.error.set('Could not delete event.');
    }
  }

  async saveAllowGuestAlbumUploads(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    try {
      const updated = await this.api.updateEvent(ev.id, { allowGuestAlbumUploads: this.allowGuestAlbumUploads });
      this.apply(updated);
      this.savedAt.set(Date.now());
    } catch (e: any) {
      this.error.set('Could not update album upload setting.');
    }
  }

  async saveShowInviteesToGuests(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    try {
      const updated = await this.api.updateEvent(ev.id, { showInviteesToGuests: this.showInviteesToGuests });
      this.apply(updated);
      this.savedAt.set(Date.now());
    } catch (e: any) {
      this.error.set('Could not update invitee visibility setting.');
    }
  }

  async saveVisibility(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    try {
      const updated = await this.api.updateEvent(ev.id, { visibility: this.visibility });
      this.apply(updated);
      this.savedAt.set(Date.now());
    } catch (e: any) {
      this.error.set('Could not update visibility setting.');
    }
  }

  protected visibilityLabel(v: EventVisibility): string {
    switch (v) {
      case 'Open': return 'Open — everyone can view';
      case 'Closed': return 'Closed — invitees only';
      case 'Private': return 'Private — owners only';
    }
  }

  protected visibilityHelp(v: EventVisibility): string {
    switch (v) {
      case 'Open': return 'Any signed-in user can view this event without an invite.';
      case 'Closed': return 'Only people you invite (and ancestors that opt to inherit) can view.';
      case 'Private': return 'Hidden from everyone except you and your co-owners. Invitees won’t see it until you change this back.';
    }
  }

  protected allowedImageRoles(ev: EventDetail): ImageRole[] {
    return ev.isOwner ? IMAGE_ROLES : ['Album'];
  }

  protected onImageFile(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.newImageFile = input.files && input.files[0] ? input.files[0] : null;
  }

  async uploadImage(): Promise<void> {
    const ev = this.event();
    if (!ev || !this.newImageFile) return;
    this.imageUploading.set(true);
    this.imageError.set('');
    try {
      const img = await this.api.uploadImage(ev.id, this.newImageFile, this.newImageRole, this.newImageDescription);
      // Banner and Icon are singletons — drop any existing one of the same role.
      const filtered = (this.newImageRole === 'Banner' || this.newImageRole === 'Icon')
        ? ev.images.filter(i => i.role !== this.newImageRole)
        : ev.images;
      this.event.set({ ...ev, images: [...filtered, img] });
      this.newImageFile = null;
      this.newImageDescription = '';
      const fileInput = document.querySelector<HTMLInputElement>('.upload input[type=file]');
      if (fileInput) fileInput.value = '';
    } catch (e: any) {
      this.imageError.set(e?.error ?? 'Could not upload image.');
    } finally {
      this.imageUploading.set(false);
    }
  }

  protected setImageDescription(img: EventImage, value: string): void {
    const ev = this.event();
    if (!ev) return;
    this.event.set({
      ...ev,
      images: ev.images.map(i => i.id === img.id ? { ...i, description: value } : i),
    });
  }

  protected setImageRole(img: EventImage, value: ImageRole): void {
    const ev = this.event();
    if (!ev) return;
    this.event.set({
      ...ev,
      images: ev.images.map(i => i.id === img.id ? { ...i, role: value } : i),
    });
  }

  async saveImageDescription(img: EventImage): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    const current = ev.images.find(i => i.id === img.id);
    if (!current) return;
    try {
      const updated = await this.api.updateImage(ev.id, img.id, { description: current.description });
      this.event.set({ ...ev, images: ev.images.map(i => i.id === img.id ? updated : i) });
    } catch (e: any) {
      this.imageError.set(e?.error ?? 'Could not update description.');
    }
  }

  async saveImageRole(img: EventImage): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    const current = ev.images.find(i => i.id === img.id);
    if (!current) return;
    try {
      const updated = await this.api.updateImage(ev.id, img.id, { role: current.role });
      // Banner and Icon are singletons — server may have evicted siblings.
      const filtered = (updated.role === 'Banner' || updated.role === 'Icon')
        ? ev.images.filter(i => i.id === updated.id || i.role !== updated.role)
        : ev.images;
      this.event.set({
        ...ev,
        images: filtered.map(i => i.id === updated.id ? updated : i),
      });
    } catch (e: any) {
      this.imageError.set(e?.error ?? 'Could not update role.');
    }
  }

  async deleteImage(img: EventImage): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    if (!confirm('Delete this image?')) return;
    try {
      await this.api.deleteImage(ev.id, img.id);
      this.event.set({ ...ev, images: ev.images.filter(i => i.id !== img.id) });
    } catch (e: any) {
      this.imageError.set(e?.error ?? 'Could not delete image.');
    }
  }
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseOptionsText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
