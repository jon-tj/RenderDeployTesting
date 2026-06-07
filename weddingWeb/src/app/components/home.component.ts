import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { CalendarComponent } from './calendar.component';
import { HubApi } from '../services/hub-api.service';
import { AuthService } from '../services/auth.service';
import { EventSummary } from '../models';

@Component({
  selector: 'app-home',
  imports: [NavbarComponent, CalendarComponent],
  template: `
    <app-navbar />
    <main class="shell">
      @if (auth.me(); as me) {
        <header class="welcome">
          <div>
            <h1>Welcome back, {{ me.displayName || me.email }}</h1>
            <p>Click a day to schedule something, or click an event to open it.</p>
          </div>
          <div class="create-wrap" (document:click)="onDocClick($event)">
            <button type="button" class="create-btn" (click)="toggleMenu($event)">
              <span class="material-icons">add</span>
              New
              <span class="material-icons caret">arrow_drop_down</span>
            </button>
            @if (menuOpen()) {
              <div class="create-menu" role="menu">
                <button type="button" role="menuitem" (click)="createEvent()">
                  <span class="material-icons">event</span>
                  <div>
                    <strong>Event</strong>
                    <span class="muted small">Calendar entry, RSVPs, invites…</span>
                  </div>
                </button>
              </div>
            }
          </div>
        </header>
      }
      @if (error()) { <p class="error">{{ error() }}</p> }
      <app-calendar
        [events]="events()"
        (dayClick)="createOnDay($event)"
        (eventClick)="openEvent($event)"
      />
    </main>
  `,
  styles: [`
    .shell { max-width:1100px; margin:0 auto; padding:1.25rem; display:flex; flex-direction:column; gap:1rem; }
    .welcome { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap; }
    .welcome h1 { margin:0 0 .25rem; }
    .welcome p { margin:0; color:#5a5347; }
    .create-wrap { position:relative; }
    .create-btn { display:inline-flex; align-items:center; gap:.4rem; padding:.6rem 1rem; border:1px solid #ead9b3; background:#fff; border-radius:999px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.08); font:inherit; }
    .create-btn:hover { background:#fdf6e3; }
    .create-btn .caret { margin-left:-.25rem; }
    .create-menu { position:absolute; right:0; top:calc(100% + .4rem); min-width:260px; background:#fff; border:1px solid #ead9b3; border-radius:.5rem; box-shadow:0 4px 12px rgba(0,0,0,.12); padding:.35rem; display:flex; flex-direction:column; z-index:10; }
    .create-menu button { display:flex; align-items:center; gap:.65rem; padding:.55rem .7rem; border:none; background:none; text-align:left; cursor:pointer; border-radius:.35rem; font:inherit; }
    .create-menu button:hover { background:#faf3e1; }
    .create-menu .muted { color:#6b6450; }
    .create-menu .small { font-size:.8rem; display:block; }
    .error { color:#a23; }
  `],
})
export class HomeComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(HubApi);
  private readonly router = inject(Router);

  protected readonly events = signal<EventSummary[]>([]);
  protected readonly error = signal('');
  protected readonly menuOpen = signal(false);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.events.set(await this.api.listEvents());
    } catch (e: any) {
      this.error.set('Could not load events.');
    }
  }

  protected toggleMenu(ev: MouseEvent): void {
    ev.stopPropagation();
    this.menuOpen.update(o => !o);
  }

  protected onDocClick(ev: Event): void {
    if (!this.menuOpen()) return;
    const target = ev.target as HTMLElement;
    if (!target.closest('.create-wrap')) this.menuOpen.set(false);
  }

  async createEvent(): Promise<void> {
    this.menuOpen.set(false);
    const me = this.auth.me();
    if (!me) return;
    if (!me.permissions.canCreateFamilyGathering && !me.permissions.canCreateWeddingEvent) {
      this.error.set('You do not have permission to create events.');
      return;
    }
    const start = new Date();
    start.setHours(12, 0, 0, 0);
    try {
      const ev = await this.api.createEvent({ startUtc: start.toISOString(), title: 'New event' });
      this.router.navigate(['/event', ev.id, 'edit']);
    } catch {
      this.error.set('Could not create event.');
    }
  }

  openEvent(e: EventSummary): void {
    this.router.navigate(['/event', e.id]);
  }

  async createOnDay(date: Date): Promise<void> {
    const me = this.auth.me();
    if (!me) return;
    if (!me.permissions.canCreateFamilyGathering && !me.permissions.canCreateWeddingEvent) {
      this.error.set('You do not have permission to create events.');
      return;
    }
    // Default to noon local time on the clicked day, expressed as UTC ISO.
    const start = new Date(date);
    start.setHours(12, 0, 0, 0);
    try {
      const ev = await this.api.createEvent({
        startUtc: start.toISOString(),
        title: 'New event',
      });
      this.router.navigate(['/event', ev.id, 'edit']);
    } catch (e: any) {
      this.error.set('Could not create event.');
    }
  }
}
