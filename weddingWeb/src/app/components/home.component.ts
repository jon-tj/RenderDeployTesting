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
          <h1>Welcome back, {{ me.displayName || me.email }}</h1>
          <p>Click a day to schedule something, or click an event to open it.</p>
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
    .welcome h1 { margin:0 0 .25rem; }
    .welcome p { margin:0; color:#5a5347; }
    .error { color:#a23; }
  `],
})
export class HomeComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(HubApi);
  private readonly router = inject(Router);

  protected readonly events = signal<EventSummary[]>([]);
  protected readonly error = signal('');

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

  openEvent(e: EventSummary): void {
    this.router.navigate(['/event', e.id, 'edit']);
  }
}
