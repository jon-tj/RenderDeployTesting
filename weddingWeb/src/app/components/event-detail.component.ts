import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { HubApi } from '../services/hub-api.service';
import { EventDetail, InviteStatus } from '../models';

const RSVP_STATUSES: InviteStatus[] = ['Pending', 'Accepted', 'Declined', 'Maybe'];

@Component({
  selector: 'app-event-detail',
  imports: [FormsModule, NavbarComponent, RouterLink],
  template: `
    <app-navbar />
    <main class="shell">
      @if (loading()) {
        <p>Loading…</p>
      } @else if (notFound()) {
        <p>Event not found.</p>
      } @else if (event(); as ev) {
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

        @if (ev.myInvite) {
          <section class="card">
            <h2>Your RSVP</h2>
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
    </main>
  `,
  styles: [`
    .shell { max-width:900px; margin:0 auto; padding:1.25rem; display:flex; flex-direction:column; gap:1rem; }
    .head { display:flex; align-items:flex-start; gap:1rem; }
    .head .title { flex:1; }
    .head h1 { margin:.15rem 0 0; }
    .head-actions { display:flex; gap:.5rem; }
    .kind { display:inline-block; background:#dfe6cf; color:#2d2a24; padding:.15rem .55rem; border-radius:999px; font-size:.7rem; letter-spacing:.1em; text-transform:uppercase; }
    .kind.wedding { background:#f1e0c2; }
    .card { background:#fff; border:1px solid #e6e1d4; border-radius:.6rem; padding:1rem 1.25rem; display:flex; flex-direction:column; gap:.5rem; }
    .card h2 { margin:0 0 .25rem; font-size:1.05rem; }
    .card p { margin:0; }
    .desc { white-space:pre-wrap; color:#5a5347; margin-top:.5rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:.75rem; }
    label { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; color:#5a5347; }
    select { padding:.5rem .65rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; background:#fff; }
    .actions { display:flex; justify-content:flex-end; margin-top:.25rem; }
    .ghost { background:transparent; border:1px solid #c9b88a; padding:.4rem .8rem; border-radius:.4rem; cursor:pointer; font:inherit; text-decoration:none; color:#2d2a24; }
    .ghost:hover { background:#f1e0c2; }
    .primary { background:#6f7a5b; color:#faf5ea; border:0; padding:.5rem .9rem; border-radius:.4rem; cursor:pointer; font:inherit; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; }
    .primary:disabled { opacity:.6; cursor:default; }
    .muted { color:#8b8273; margin:0; }
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

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('eventId'));
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
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
  }

  protected typeLabel(t: string): string {
    return t === 'FamilyGathering' ? 'Family gathering' : t;
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  async saveRsvp(): Promise<void> {
    const ev = this.event();
    if (!ev || !ev.myInvite) return;
    this.rsvpSaving.set(true);
    this.rsvpError.set('');
    try {
      const updated = await this.api.rsvp(ev.id, {
        status: this.status,
        mealChoice: ev.mealOptions.length ? this.mealChoice : undefined,
        drinkChoice: ev.drinkOptions.length ? this.drinkChoice : undefined,
      });
      const next: EventDetail = {
        ...ev,
        myInvite: updated,
        invites: ev.invites.map(i => (i.id === updated.id ? updated : i)),
      };
      this.applyEvent(next);
      this.rsvpSavedAt.set(Date.now());
    } catch (e: any) {
      this.rsvpError.set(e?.error ?? 'Could not save RSVP.');
    } finally {
      this.rsvpSaving.set(false);
    }
  }

  back(): void {
    this.router.navigate(['/']);
  }
}
