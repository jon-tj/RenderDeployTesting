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
import { ALBUM_UPLOAD_POLICIES, AlbumUploadPolicy, EVENT_TYPES, EVENT_VISIBILITIES, ChildEvent, DEFAULT_LANGUAGE, EventDetail, EventImage, EventOwner, EventSummary, EventTranslation, EventType, EventVisibility, IMAGE_ROLES, ImageRole, Invite, InviteGroup, LANGUAGES, LanguageCode, UserSummary } from '../models';
import { printDiningPlan } from '../utils/dining-plan';

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
            <a class="ghost" href="javascript:void(0)" (click)="openWishlist(ev.id)">Wishlist</a>
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
                <input name="title" [ngModel]="getText('title')" (ngModelChange)="setText('title', $event)"
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
            <label>Location label
              <input name="locationLabel" [(ngModel)]="locationLabel" [disabled]="!ev.isOwner" (blur)="save()" placeholder="Optional readable name" />
            </label>
            <label>Dress code
              <div class="with-lang">
                <input name="dressCode" [ngModel]="getText('dressCode')" (ngModelChange)="setText('dressCode', $event)"
                  [disabled]="!ev.isOwner" (blur)="save()" placeholder="Optional" />
                @if (enableTranslations) {
                  <select class="lang-pill" [(ngModel)]="dressLang" name="dressLang" title="Editing language">
                    @for (l of languages; track l.code) {
                      <option [value]="l.code">{{ l.short }}</option>
                    }
                  </select>
                }
              </div>
            </label>
            <label>Start
              <input type="datetime-local" name="start" [(ngModel)]="startLocal" [disabled]="!ev.isOwner" (change)="save()" />
            </label>
            <label>End
              <input type="datetime-local" name="end" [(ngModel)]="endLocal" [disabled]="!ev.isOwner" (change)="save()" />
            </label>
            <label>Visibility
              <select name="visibility" [(ngModel)]="visibility" [disabled]="!ev.isOwner" (change)="savePatch({ visibility: this.visibility }, 'Could not update visibility setting.')">
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
              <textarea name="description" rows="4" [ngModel]="getText('description')" (ngModelChange)="setText('description', $event)"
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
          <h2>Invite groups</h2>
          <p class="muted small">Bundle invitees into groups. Each group can be limited to a subset of child events (e.g. evening reception only). Use the "Send emails" button per group to control when invitations go out.</p>
          @if (!ev.children.length) {
            <p class="muted small">Add child events first to control per-group visibility.</p>
          }
          @if (ev.groups.length) {
            <ul class="invites">
              @for (g of ev.groups; track g.id) {
                <li class="group-row">
                  <div class="group-fields">
                    <label class="field">
                      <span class="muted small">Name</span>
                      <input type="text" [(ngModel)]="g.name" name="grp-name-{{g.id}}" />
                    </label>
                  </div>
                  @if (ev.children.length) {
                    <div class="group-children">
                      <span class="muted small">Visible child events</span>
                      @for (c of ev.children; track c.id) {
                        <label class="check">
                          <input type="checkbox"
                            [checked]="g.visibleChildEventIds.includes(c.id)"
                            (change)="toggleGroupChild(g, c.id, $any($event.target).checked)" />
                          {{ c.title }}
                        </label>
                      }
                    </div>
                  }
                  <div class="group-actions">
                    <button type="button" class="ghost small" (click)="saveGroup(g)" [disabled]="savingGroupId() === g.id">
                      {{ savingGroupId() === g.id ? 'Saving…' : 'Save' }}
                    </button>
                    <button type="button" class="ghost small" (click)="sendGroupEmails(g)" [disabled]="sendingGroupId() === g.id || !groupPendingCount(g)">
                      {{ sendingGroupId() === g.id ? 'Sending…' : ('Send ' + groupPendingCount(g) + ' email(s)') }}
                    </button>
                    <button type="button" class="ghost small" (click)="deleteGroup(g)">Delete</button>
                  </div>
                </li>
              }
            </ul>
          }
          <div class="group-create">
            <input type="text" placeholder="New group name" [(ngModel)]="newGroupName" name="new-group-name" />
            <button type="button" class="ghost small" (click)="createGroup()" [disabled]="!newGroupName.trim() || creatingGroup()">
              {{ creatingGroup() ? 'Creating…' : 'Add group' }}
            </button>
          </div>
          @if (groupError()) {
            <p class="error small">{{ groupError() }}</p>
          }
        </section>

        <section class="card">
          <h2>Invites</h2>
          @if (ev.isOwner) {
            <label class="check">
              <input type="checkbox" name="showInvitees"
                [(ngModel)]="showInviteesToGuests"
                (change)="savePatch({ showInviteesToGuests: this.showInviteesToGuests }, 'Could not update invitee visibility setting.')" />
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
                  @if (ev.isOwner && ev.groups.length) {
                    <select class="ghost small" [ngModel]="i.inviteGroupId" name="invite-grp-{{i.id}}"
                      (ngModelChange)="setInviteGroup(i, $event)">
                      <option [ngValue]="null">— no group —</option>
                      @for (g of ev.groups; track g.id) {
                        <option [ngValue]="g.id">{{ g.name }}</option>
                      }
                    </select>
                  }
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
                (change)="savePatch({ inheritParentInvites: this.inheritParentInvites }, 'Could not update inheritance.')" />
              Inherit invites from parent event
            </label>
            <p class="muted small">When on, anyone invited to the parent (and its ancestors that opt in) can see this event too.</p>
          } @else {
            @if (ev.isOwner) {
              <app-child-picker [parentId]="ev.id" [parentType]="ev.type" (added)="onChildAdded($event)" />
            }
            @if (ev.children.length) {
              <label class="check">
                <input type="checkbox" name="collect"
                  [(ngModel)]="collectChildRsvps"
                  [disabled]="!ev.isOwner"
                  (change)="savePatch({ collectChildRsvps: this.collectChildRsvps }, 'Could not update RSVP collection.')" />
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
            <label>Album uploads
              <select name="albumUploadPolicy"
                [(ngModel)]="albumUploadPolicy"
                (change)="savePatch({ albumUploadPolicy: this.albumUploadPolicy }, 'Could not update album upload setting.')">
                @for (p of allAlbumPolicies; track p) {
                  <option [value]="p">{{ albumPolicyLabel(p) }}</option>
                }
              </select>
            </label>
            <p class="muted small">{{ albumPolicyHelp(albumUploadPolicy) }} Banner and icon uploads are always owner-only.</p>
          }
          @if (ev.isOwner && ev.type === 'Wedding') {
            <label class="check">
              <input type="checkbox" name="enableWishlist"
                [checked]="ev.hasWishlist" [disabled]="wishlistSaving()"
                (change)="toggleWishlist($any($event.target).checked)" />
              Enable wishlist
            </label>
            <p class="muted small">When on, guests see a wishlist button on the wedding page. Turning it off deletes the wishlist and all its items.</p>
            @if (wishlistError()) { <p class="error">{{ wishlistError() }}</p> }
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
                    <span class="badge thumb-badge">{{ img.role }}</span>
                  </div>
                  <div class="meta">
                    @if (img.canEdit) {
                      <textarea rows="3"
                        [ngModel]="img.description"
                        (ngModelChange)="setImageDescription(img, $event)"
                        (blur)="saveImageDescription(img)"
                        [name]="'imgDesc-' + img.id"
                        placeholder="Description"></textarea>
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

        <section class="card">
          <h2>Backup</h2>
          <p class="muted small">Download a full copy of this event (settings, children, images, invites, wishlist) as a ZIP. Use the New menu on the home page to upload a backup and recreate an event.</p>
          <div class="backup-actions">
            <button type="button" class="primary" (click)="exportBackup()" [disabled]="exporting()">
              {{ exporting() ? 'Preparing\u2026' : 'Download backup (.zip)' }}
            </button>
          </div>
          @if (backupError()) { <p class="error">{{ backupError() }}</p> }
        </section>
        }
      }
    </main>
  `,
  styles: [`
    .invites-actions { margin-top:.6rem; display:flex; justify-content:flex-end; }
    .group-row { flex-direction:column; align-items:stretch; gap:.5rem !important; }
    .group-fields { display:flex; gap:.75rem; flex-wrap:wrap; }
    .group-fields .field { flex:1; min-width:160px; display:flex; flex-direction:column; gap:.2rem; }
    .group-children { display:flex; flex-wrap:wrap; gap:.4rem 1rem; padding:.25rem 0; }
    .group-actions { display:flex; gap:.5rem; justify-content:flex-end; }
    .group-create { margin-top:.75rem; display:flex; gap:.5rem; }
    .group-create input { flex:1; }
    a.child-link { flex:1; color:var(--ink); text-decoration:none; }
    a.child-link:hover { text-decoration:underline; }
    .upload { display:flex; flex-wrap:wrap; gap:.5rem; align-items:flex-end; }
    .upload .grow { flex:1; min-width:180px; }
    .upload label.block { min-width:0; max-width:100%; }
    .upload input, .upload select { max-width:100%; box-sizing:border-box; }
    .upload input[type=file] { width:100%; }
    ul.images { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.5rem; }
    ul.images li { display:flex; gap:.75rem; align-items:flex-start; padding:.5rem .65rem; background:var(--bg); border-radius:var(--r); }
    ul.images .thumb { position:relative; width:96px; height:72px; flex:0 0 96px; overflow:hidden; border-radius:.3rem; background:var(--bg-card); display:flex; align-items:center; justify-content:center; }
    ul.images .thumb ::ng-deep img { width:100%; height:100%; object-fit:cover; }
    ul.images .thumb-badge { position:absolute; top:.2rem; left:.2rem; font-size:.65rem; padding:.05rem .35rem; background:rgba(0,0,0,.55); color:#fff; border-radius:.2rem; letter-spacing:.04em; }
    ul.images .meta { flex:1 1 0; min-width:0; display:flex; flex-direction:column; gap:.3rem; }
    ul.images .meta .row { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; min-width:0; }
    ul.images .meta .row .muted { word-break:break-all; min-width:0; }
    ul.images .meta input, ul.images .meta select, ul.images .meta textarea { width:100%; box-sizing:border-box; }
    ul.images .meta textarea { resize:vertical; font:inherit; padding:.4rem .5rem; border:1px solid var(--rule-soft); border-radius:.3rem; }
    .with-lang { position:relative; }
    .with-lang input, .with-lang textarea { width:100%; box-sizing:border-box; padding-right:3.5rem; }
    .with-lang .lang-pill { position:absolute; bottom:.25rem; right:.25rem; padding:.1rem .35rem; font-size:.7rem; background:var(--bg); border:1px solid var(--rule-soft); border-radius:.3rem; color:var(--ink-soft); }
    .opt-trans { margin-top:.5rem; padding-top:.75rem; border-top:1px dashed var(--rule); display:flex; flex-direction:column; gap:.75rem; }
    .opt-trans-head { display:flex; align-items:center; gap:.5rem; }
    .opt-trans-block h3 { margin:0 0 .35rem; font-size:.9rem; color:var(--ink-soft); }
    .opt-row { display:grid; grid-template-columns:minmax(120px,1fr) 2fr; gap:.5rem; align-items:center; margin-bottom:.35rem; }
    .opt-row .opt-src { font-size:.85rem; color:var(--ink-soft); }
    .dining-plan-actions { display:flex; gap:.5rem; align-items:center; margin-top:.75rem; flex-wrap:wrap; }
    .dining-plan-actions select { padding:.25rem .5rem; font-size:.8rem; }
    .dining-plan-actions button { flex:1; justify-content:center; }
    .backup-actions { display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; }
  `],
})
export class EventEditComponent implements OnInit {
  private readonly api = inject(HubApi);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Navigate to this event's wishlist, creating it if it doesn't exist yet.
  async openWishlist(eventId: number): Promise<void> {
    try {
      const v = await this.api.resolveWishlistForEvent(eventId);
      this.router.navigate(['/wishlist', v.id]);
    } catch { /* ignore */ }
  }

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

  protected readonly savingGroupId = signal<number | null>(null);
  protected readonly sendingGroupId = signal<number | null>(null);
  protected readonly creatingGroup = signal(false);
  protected readonly groupError = signal('');
  protected newGroupName = '';

  protected type: EventType = 'FamilyGathering';
  protected title = '';
  protected location = '';
  protected locationLabel = '';
  protected dressCode = '';
  protected description = '';
  protected startLocal = '';
  protected endLocal = '';
  protected mealOptionsText = '';
  protected drinkOptionsText = '';
  protected inheritParentInvites = false;
  protected collectChildRsvps = true;
  protected albumUploadPolicy: AlbumUploadPolicy = 'OwnersOnly';
  protected readonly allAlbumPolicies = ALBUM_UPLOAD_POLICIES;
  protected showInviteesToGuests = true;
  protected visibility: EventVisibility = 'Closed';
  protected readonly allVisibilities = EVENT_VISIBILITIES;

  protected enableTranslations = false;
  protected translations: Record<string, EventTranslation> = {};
  protected titleLang: LanguageCode = DEFAULT_LANGUAGE;
  protected descLang: LanguageCode = DEFAULT_LANGUAGE;
  protected dressLang: LanguageCode = DEFAULT_LANGUAGE;
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
    this.locationLabel = ev.locationLabel;
    this.dressCode = ev.dressCode;
    this.description = ev.description;
    this.startLocal = toLocalInput(ev.startUtc);
    this.endLocal = toLocalInput(ev.endUtc);
    this.mealOptionsText = ev.mealOptions.join('\n');
    this.drinkOptionsText = ev.drinkOptions.join('\n');
    this.inheritParentInvites = ev.inheritParentInvites;
    this.collectChildRsvps = ev.collectChildRsvps;
    this.albumUploadPolicy = ev.albumUploadPolicy;
    this.showInviteesToGuests = ev.showInviteesToGuests;
    this.visibility = ev.visibility;
    this.enableTranslations = ev.enableTranslations;
    this.translations = { ...(ev.translations ?? {}) };
  }

  private langFor(f: 'title' | 'description' | 'dressCode'): LanguageCode {
    return f === 'title' ? this.titleLang : f === 'description' ? this.descLang : this.dressLang;
  }
  protected getText(f: 'title' | 'description' | 'dressCode'): string {
    const l = this.langFor(f);
    if (l === DEFAULT_LANGUAGE) return this[f];
    return (this.translations[l]?.[f] as string) ?? '';
  }
  protected setText(f: 'title' | 'description' | 'dressCode', v: string): void {
    const l = this.langFor(f);
    if (l === DEFAULT_LANGUAGE) { this[f] = v; return; }
    const cur = this.translations[l] ?? { title: '', description: '' };
    this.translations = { ...this.translations, [l]: { ...cur, [f]: v } };
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

  protected printDiningPlan(ev: EventDetail): void {
    printDiningPlan(ev, this.planLang, this.mealOptionsList(), this.drinkOptionsList());
  }

  async save(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    try {
      const updated = await this.api.updateEvent(ev.id, {
        type: this.type,
        title: this.title,
        location: this.location,
        locationLabel: this.locationLabel,
        dressCode: this.dressCode,
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

  toggleGroupChild(g: InviteGroup, childId: number, checked: boolean): void {
    const set = new Set(g.visibleChildEventIds);
    if (checked) set.add(childId); else set.delete(childId);
    g.visibleChildEventIds = Array.from(set);
  }
  async createGroup(): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    const name = this.newGroupName.trim();
    if (!name) return;
    this.creatingGroup.set(true);
    this.groupError.set('');
    try {
      const grp = await this.api.createInviteGroup(ev.id, { name, visibleChildEventIds: [] });
      this.event.set({ ...ev, groups: [...ev.groups, grp] });
      this.newGroupName = '';
    } catch {
      this.groupError.set('Could not create group.');
    } finally {
      this.creatingGroup.set(false);
    }
  }
  async saveGroup(g: InviteGroup): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    this.savingGroupId.set(g.id);
    this.groupError.set('');
    try {
      const updated = await this.api.updateInviteGroup(ev.id, g.id, {
        name: g.name,
        visibleChildEventIds: g.visibleChildEventIds,
      });
      this.event.set({ ...ev, groups: ev.groups.map(x => x.id === updated.id ? updated : x) });
    } catch {
      this.groupError.set('Could not save group.');
    } finally {
      this.savingGroupId.set(null);
    }
  }
  groupPendingCount(g: InviteGroup): number {
    return this.event()?.invites.filter(i => i.inviteGroupId === g.id && !i.emailSentUtc).length ?? 0;
  }
  async sendGroupEmails(g: InviteGroup): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    this.sendingGroupId.set(g.id);
    this.groupError.set('');
    try {
      await this.api.sendGroupInviteEmails(ev.id, g.id);
      const fresh = await this.api.getEvent(ev.id);
      this.event.set(fresh);
    } catch {
      this.groupError.set('Could not send group emails.');
    } finally {
      this.sendingGroupId.set(null);
    }
  }
  async deleteGroup(g: InviteGroup): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    if (!confirm(`Delete group "${g.name}"? Invitees in this group will become ungrouped.`)) return;
    try {
      await this.api.deleteInviteGroup(ev.id, g.id);
      this.event.set({
        ...ev,
        groups: ev.groups.filter(x => x.id !== g.id),
        invites: ev.invites.map(i => i.inviteGroupId === g.id ? { ...i, inviteGroupId: null } : i),
      });
    } catch {
      this.groupError.set('Could not delete group.');
    }
  }
  async setInviteGroup(invite: Invite, groupId: number | null): Promise<void> {
    const ev = this.event();
    if (!ev) return;
    try {
      const updated = await this.api.setInviteGroup(ev.id, invite.id, groupId ?? null);
      this.event.set({ ...ev, invites: ev.invites.map(i => i.id === updated.id ? updated : i) });
    } catch {
      this.groupError.set('Could not change invitee group.');
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
      locationLabel: '',
      dressCode: '',
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

  protected async savePatch(patch: Record<string, unknown>, errorMsg: string): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    try {
      this.apply(await this.api.updateEvent(ev.id, patch as any));
      this.savedAt.set(Date.now());
    } catch { this.error.set(errorMsg); }
  }

  protected readonly wishlistSaving = signal(false);
  protected readonly wishlistError = signal('');
  protected async toggleWishlist(enable: boolean): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    if (!enable && ev.hasWishlist
      && !confirm('Disabling the wishlist will delete it and all its items. Continue?')) {
      this.apply({ ...ev });
      return;
    }
    this.wishlistError.set('');
    this.wishlistSaving.set(true);
    try {
      if (enable) await this.api.createWishlistForEvent(ev.id);
      else await this.api.deleteWishlistForEvent(ev.id);
      this.apply(await this.api.getEvent(ev.id));
    } catch {
      this.wishlistError.set(enable ? 'Could not create wishlist.' : 'Could not delete wishlist.');
    } finally {
      this.wishlistSaving.set(false);
    }
  }


  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  protected readonly exporting = signal(false);
  protected readonly backupError = signal('');

  protected async exportBackup(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.isOwner) return;
    this.backupError.set('');
    this.exporting.set(true);
    try {
      const blob = await this.api.exportEventBlob(ev.id);
      const safe = (ev.title || 'event').replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60) || 'event';
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safe}-${ev.id}-${stamp}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      this.backupError.set('Could not export event.');
    } finally {
      this.exporting.set(false);
    }
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

  protected albumPolicyLabel(p: AlbumUploadPolicy): string {
    switch (p) {
      case 'OwnersOnly': return 'Owners only';
      case 'AlwaysOpen': return 'Always open to guests';
      case 'OpenAfterEventStarted': return 'Open once the event starts';
      case 'OpenAfterEventConcluded': return 'Open once the event has concluded';
    }
  }

  protected albumPolicyHelp(p: AlbumUploadPolicy): string {
    switch (p) {
      case 'OwnersOnly': return 'Only owners can add to the album.';
      case 'AlwaysOpen': return 'Anyone who can see this event can add to the album right away.';
      case 'OpenAfterEventStarted': return 'Guests can add to the album from the event start time onward.';
      case 'OpenAfterEventConcluded': return 'Guests can add to the album once the event has ended.';
    }
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
