import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { InvitePickerComponent } from './invite-picker.component';
import { ChildPickerComponent } from './child-picker.component';
import { HubApi } from '../services/hub-api.service';
import { AuthService } from '../services/auth.service';
import { EVENT_TYPES, ChildEvent, EventDetail, EventSummary, EventType, Invite, UserSummary } from '../models';

@Component({
  selector: 'app-event-edit',
  imports: [FormsModule, NavbarComponent, InvitePickerComponent, ChildPickerComponent, RouterLink],
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
              <input name="title" [(ngModel)]="title" [disabled]="!ev.isOwner" (blur)="save()" />
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
          </div>
          <label class="block">Description
            <textarea name="description" rows="4" [(ngModel)]="description" [disabled]="!ev.isOwner" (blur)="save()"></textarea>
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
        </section>

        <section class="card">
          <h2>Invites</h2>
          @if (ev.isOwner) {
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
                  </div>
                  <span class="badge">{{ i.status }}</span>
                  @if (ev.isOwner) {
                    <button type="button" class="ghost small" (click)="removeInvite(i)">Remove</button>
                  }
                </li>
              }
            </ul>
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
    ul.children { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.4rem; }
    ul.children li { display:flex; align-items:center; gap:.75rem; padding:.4rem .65rem; background:#faf7f0; border-radius:.4rem; }
    a.child-link { flex:1; color:#2d2a24; text-decoration:none; }
    a.child-link:hover { text-decoration:underline; }
    .warn { color:#a23; margin:0; font-weight:600; }
    .check { flex-direction:row; align-items:center; gap:.5rem; font-size:.9rem; color:#2d2a24; }
    .check input { width:auto; }
    .small { font-size:.8rem; }
    .badge { background:#dfe6cf; padding:.15rem .5rem; border-radius:.25rem; font-size:.75rem; }
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
