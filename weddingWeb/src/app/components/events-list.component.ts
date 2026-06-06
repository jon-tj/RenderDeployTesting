import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { EventInfo, UserInfo } from '../services/wedding-api.service';
import { WeddingEventComponent } from './wedding-event.component';

@Component({
  selector: 'app-events-list',
  standalone: true,
  imports: [WeddingEventComponent],
  template: `
    @if (events.length === 0) {
      <p>No events available.</p>
    } @else {
      <div class="events-list">
        @for (eventItem of events; track eventItem.place; let i = $index) {
          <button
            type="button"
            class="event-chip"
            [class.active]="selectedEventIndex === i"
            (click)="selectEvent(i)"
          >
            {{ eventItem.place }}
          </button>
        }
      </div>


      <app-wedding-event
        [event]="events[selectedEventIndex]"
        [user]="user"
        [backendBaseUrl]="backendBaseUrl"
        (eventsUpdated)="onEventsUpdated($event)"
        (userUpdated)="userUpdated.emit($event)"
        (statusMessage)="statusMessage.emit($event)"
      ></app-wedding-event>
    }
  `,
  styles: [
    `
      .events-list {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        justify-content: center;
        margin-bottom: 1.5rem;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EventsListComponent implements OnChanges {
  @Input() events: EventInfo[] = [];
  @Input({ required: true }) user!: UserInfo;
  @Input() backendBaseUrl = '';

  @Output() eventsUpdated = new EventEmitter<EventInfo[]>();
  @Output() userUpdated = new EventEmitter<UserInfo>();
  @Output() statusMessage = new EventEmitter<string>();
  @Output() selectedEventChanged = new EventEmitter<EventInfo | null>();

  protected selectedEventIndex = 0;

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['events']) {
      return;
    }

    if (this.events.length === 0) {
      this.selectedEventIndex = 0;
      this.selectedEventChanged.emit(null);
      return;
    }

    if (this.selectedEventIndex >= this.events.length) {
      this.selectedEventIndex = 0;
    }

    this.selectedEventChanged.emit(this.events[this.selectedEventIndex]);
  }

  protected selectEvent(index: number) {
    this.selectedEventIndex = index;
    this.selectedEventChanged.emit(this.events[index] ?? null);
  }

  protected onEventsUpdated(updatedEvents: EventInfo[]) {
    this.eventsUpdated.emit(updatedEvents);
    const next = updatedEvents[this.selectedEventIndex] ?? updatedEvents[0] ?? null;
    this.selectedEventChanged.emit(next);
  }
}
