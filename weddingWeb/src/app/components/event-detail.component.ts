import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { HubApi } from '../services/hub-api.service';
import { EventDetail } from '../models';

@Component({
  selector: 'app-event-detail',
  imports: [NavbarComponent, RouterLink],
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
    .ghost { background:transparent; border:1px solid #c9b88a; padding:.4rem .8rem; border-radius:.4rem; cursor:pointer; font:inherit; text-decoration:none; color:#2d2a24; }
    .ghost:hover { background:#f1e0c2; }
    .primary { background:#6f7a5b; color:#faf5ea; border:0; padding:.5rem .9rem; border-radius:.4rem; cursor:pointer; font:inherit; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; }
    .muted { color:#8b8273; margin:0; }
    ul.invites { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:.4rem; }
    ul.invites li { display:flex; align-items:center; gap:.75rem; padding:.4rem .65rem; background:#faf7f0; border-radius:.4rem; }
    ul.invites li strong { flex:1; }
    .badge { background:#dfe6cf; padding:.15rem .5rem; border-radius:.25rem; font-size:.75rem; }
  `],
})
export class EventDetailComponent implements OnInit {
  private readonly api = inject(HubApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly event = signal<EventDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);

  async ngOnInit(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('eventId'));
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    try {
      this.event.set(await this.api.getEvent(id));
    } catch (e: any) {
      if (e?.status === 404 || e?.status === 403) this.notFound.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected typeLabel(t: string): string {
    return t === 'FamilyGathering' ? 'Family gathering' : t;
  }

  protected formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  back(): void {
    this.router.navigate(['/']);
  }
}
