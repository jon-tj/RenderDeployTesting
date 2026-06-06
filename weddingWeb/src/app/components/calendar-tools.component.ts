import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-calendar-tools',
  standalone: true,
  template: `
    <article class="calendar-block">
      <h2 class="section-title">{{ i18n.t('calendar.title') }}</h2>
      <p class="calendar-help">{{ i18n.t('calendar.help') }}</p>

      <div class="calendar-options">
        <a class="calendar-card" [href]="googleLink" target="_blank" rel="noopener">
          <svg class="calendar-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M3 9h18" stroke="currentColor" stroke-width="1.5" />
            <path d="M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span class="calendar-label">{{ i18n.t('calendar.google') }}</span>
        </a>
        <a class="calendar-card" [href]="outlookLink" target="_blank" rel="noopener">
          <svg class="calendar-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M3 9h18" stroke="currentColor" stroke-width="1.5" />
            <path d="M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span class="calendar-label">{{ i18n.t('calendar.outlook') }}</span>
        </a>
      </div>

      <label for="calendarAddedCheckbox" class="calendar-checkbox" [class.checked]="addedToCalendar">
        <input
          id="calendarAddedCheckbox"
          type="checkbox"
          [checked]="addedToCalendar"
          (change)="toggleCalendarAdded($any($event.target).checked)"
          [disabled]="isWorking"
        />
        <span class="checkbox-box" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="checkbox-text">{{ i18n.t('calendar.saved') }}</span>
      </label>
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .calendar-block {
        margin-top: 2.5rem;
        padding-top: 1.5rem;
        text-align: center;
      }

      .calendar-help {
        margin: 0 auto 1.5rem;
        max-width: 42ch;
        color: #8b8273;
      }

      .calendar-options {
        display: flex;
        gap: 1rem;
        justify-content: center;
        flex-wrap: wrap;
      }

      .calendar-card {
        display: inline-flex;
        align-items: center;
        gap: 0.7rem;
        padding: 0.85rem 1.6rem;
        border-radius: 999px;
        border: 1px solid #d8cfb8;
        background: #faf5ea;
        color: #2d2a24;
        text-decoration: none;
        font-family: "Montserrat", sans-serif;
        font-size: 0.75rem;
        font-weight: 500;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        transition: background-color 150ms ease, border-color 150ms ease, transform 120ms ease;
      }

      .calendar-card:hover {
        background: #f0e7d0;
        border-color: #c9b88a;
        transform: translateY(-1px);
      }

      .calendar-icon {
        width: 18px;
        height: 18px;
        color: #6f7a5b;
        flex-shrink: 0;
      }

      .calendar-checkbox {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        margin: 1.5rem auto 0;
        padding: 0;
        cursor: pointer;
        font-family: "Montserrat", sans-serif;
        font-size: 0.72rem;
        font-weight: 500;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: #8b8273;
        transition: color 150ms ease;
        user-select: none;
      }

      .calendar-checkbox.checked {
        color: #6f7a5b;
      }

      .calendar-checkbox input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
        width: 0;
        height: 0;
      }

      .checkbox-box {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        border: 1px solid #c9b88a;
        background: #faf5ea;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: transparent;
        transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
      }

      .checkbox-box svg {
        width: 14px;
        height: 14px;
      }

      .calendar-checkbox.checked .checkbox-box {
        background: #6f7a5b;
        border-color: #6f7a5b;
        color: #faf5ea;
      }

      .calendar-checkbox input:focus-visible + .checkbox-box {
        outline: 2px solid #c9b88a;
        outline-offset: 2px;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CalendarToolsComponent {
  protected readonly i18n = inject(I18nService);

  @Input() fullName = '';
  @Input() backendBaseUrl = '';
  @Input() outlookLink = '#';
  @Input() googleLink = '#';
  @Input() addedToCalendar = false;

  @Output() addedToCalendarUpdated = new EventEmitter<boolean>();
  @Output() statusMessage = new EventEmitter<string>();

  protected isWorking = false;

  protected async toggleCalendarAdded(added: boolean) {
    this.isWorking = true;

    try {
      const response = await fetch(`${this.backendBaseUrl}/calendar/added`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fullName: this.fullName,
          added
        })
      });

      if (!response.ok) {
        this.statusMessage.emit('Could not update calendar status.');
        return;
      }

      this.addedToCalendarUpdated.emit(added);
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
    } finally {
      this.isWorking = false;
    }
  }
}
