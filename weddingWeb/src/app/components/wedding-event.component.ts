import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarToolsComponent } from './calendar-tools.component';
import { VenueMapComponent } from './venue-map.component';
import { MealDrinkPickerComponent } from './meal-drink-picker.component';
import { I18nService } from '../services/i18n.service';
import { EventInfo, UserInfo, WeddingApiService } from '../services/wedding-api.service';

const ALLERGY_OPTIONS = [
  'peanuts',
  'treeNuts',
  'dairy',
  'eggs',
  'gluten',
  'soy',
  'fish',
  'shellfish',
  'sesame',
  'vegetarian',
  'vegan'
] as const;

type AllergyKey = (typeof ALLERGY_OPTIONS)[number];

@Component({
  selector: 'app-wedding-event',
  standalone: true,
  imports: [VenueMapComponent, CalendarToolsComponent, FormsModule, MealDrinkPickerComponent],
  template: `
    <article class="event-block">
      <div class="event-info">
        <div class="info-col">
          <svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M3 9h18" stroke="currentColor" stroke-width="1.5" />
            <path d="M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span class="info-label">{{ i18n.t('event.date') }}</span>
          <span class="info-value">{{ eventDate() }}</span>
        </div>
        <div class="info-col">
          <svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <span class="info-label">{{ i18n.t('event.time') }}</span>
          <span class="info-value">{{ eventTime() }}</span>
          @if (eventTimeSecondary(); as secondary) {
            <span class="info-secondary">({{ secondary }})</span>
          }
        </div>
        <div class="info-col">
          <svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            <circle cx="12" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
          <span class="info-label">{{ i18n.t('event.venue') }}</span>
          <span class="info-value">{{ eventPlaceLabel() }}</span>
        </div>
        <div class="info-col">
          <svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3l4 3 4-3 4 4-3 3v11H7V10L4 7l4-4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
          </svg>
          <span class="info-label">{{ i18n.t('event.dressCode') }}</span>
          <span class="info-value">{{ event.dressCode || i18n.t('event.placeholder') }}</span>
        </div>
      </div>

      <app-venue-map
        [mapQuery]="event.mapQuery"
        [venueName]="event.venueName"
        [place]="event.place"
      ></app-venue-map>
    </article>

    <article class="rsvp-block">
      <h2 class="section-title">{{ i18n.t('rsvp.title') }}</h2>
      <p class="rsvp-help">{{ i18n.t('rsvp.help') }}</p>

      <app-meal-drink-picker
        [mealOptions]="event.mealOptions"
        [drinkOptions]="drinkOptions"
        [currency]="event.currency"
        [selectedMeal]="currentChoice().meal"
        [selectedDrink]="currentChoice().drink"
        (mealChange)="persistChoice({ meal: $event })"
        (drinkChange)="persistChoice({ drink: $event })"
      ></app-meal-drink-picker>

      <div class="allergy-row">
        <button type="button" class="secondary" (click)="openAllergies()">
          {{ i18n.t('allergy.button') }}
        </button>
      </div>

      <div class="actions-row">
        <select #rsvpSel (change)="selectedRsvp.set(rsvpSel.value)">
          <option value="yes" [selected]="selectedRsvp() === 'yes'">{{ i18n.t('rsvp.option.yes') }}</option>
          <option value="maybe" [selected]="selectedRsvp() === 'maybe'">{{ i18n.t('rsvp.option.maybe') }}</option>
          <option value="no" [selected]="selectedRsvp() === 'no'">{{ i18n.t('rsvp.option.no') }}</option>
        </select>
        <button type="button" class="primary" (click)="saveRsvp()" [disabled]="isWorking">{{ i18n.t('rsvp.save') }}</button>
      </div>

      @if (allergiesOpen()) {
        <div class="allergy-backdrop" (click)="closeAllergies()"></div>
        <div class="allergy-dialog" role="dialog" [attr.aria-label]="i18n.t('allergy.title')">
          <h3 class="allergy-dialog-title">{{ i18n.t('allergy.title') }}</h3>
          <p class="allergy-dialog-help">{{ i18n.t('allergy.help') }}</p>
          <div class="allergy-options">
            @for (key of allergyOptions; track key) {
              <label class="allergy-option">
                <input
                  type="checkbox"
                  [checked]="isAllergyChecked(key)"
                  (change)="toggleAllergy(key, $any($event.target).checked)"
                />
                <span>{{ i18n.t('allergy.option.' + key) }}</span>
              </label>
            }
          </div>
          <label class="allergy-other">
            <span>{{ i18n.t('allergy.other.label') }}</span>
            <input
              type="text"
              [(ngModel)]="otherAllergies"
              [placeholder]="i18n.t('allergy.other.placeholder')"
            />
          </label>
          <div class="allergy-actions">
            <button type="button" class="secondary" (click)="closeAllergies()">{{ i18n.t('allergy.cancel') }}</button>
            <button type="button" class="primary" (click)="saveAllergies()" [disabled]="isSavingAllergies">{{ i18n.t('allergy.save') }}</button>
          </div>
        </div>
      }
    </article>

    <app-calendar-tools
      [fullName]="user.fullName"
      [backendBaseUrl]="backendBaseUrl"
      [outlookLink]="calendarLink('outlook')"
      [googleLink]="calendarLink('google')"
      [addedToCalendar]="user.addedToCalendar"
      (addedToCalendarUpdated)="onCalendarAddedUpdated($event)"
      (statusMessage)="statusMessage.emit($event)"
    ></app-calendar-tools>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .event-block,
      .rsvp-block {
        margin-top: 2.5rem;
        padding-top: 1.5rem;
      }

      .event-info {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 0;
        margin: 1.5rem 0 2rem;
      }

      .info-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.6rem;
        padding: 0.5rem 1rem;
        text-align: center;
        border-right: 1px solid #d8cfb8;
      }

      .info-col:last-child {
        border-right: none;
      }

      .info-icon {
        width: 28px;
        height: 28px;
        color: #6f7a5b;
      }

      .info-label {
        font-family: "Montserrat", sans-serif;
        font-size: 0.72rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.24em;
        color: #5a5347;
      }

      .info-value {
        font-family: "Cormorant Garamond", Georgia, serif;
        font-weight: 500;
        font-size: 1.05rem;
        line-height: 1.4;
        color: #2d2a24;
        word-break: break-word;
      }

      .info-secondary {
        font-family: "Cormorant Garamond", Georgia, serif;
        font-size: 1rem;
        line-height: 0.3;
        color: #8b8273;
        font-style: italic;
      }

      .rsvp-help {
        margin: 0 0 1rem;
        text-align: center;
        color: #8b8273;
      }

      .actions-row {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        flex-wrap: wrap;
        justify-content: center;
      }

      .actions-row select {
        flex: 0 1 200px;
      }

      select,
      button {
        font: inherit;
      }

      select {
        box-sizing: border-box;
        padding: 0.85rem 1rem;
        border-radius: 4px;
        border: 1px solid #d8cfb8;
        background: #faf5ea;
        color: #2d2a24;
      }

      @media (max-width: 600px) {
        .event-info {
          grid-template-columns: 1fr;
        }

        .info-col {
          border-right: none;
          border-bottom: 1px solid #d8cfb8;
          padding: 1.25rem 0.5rem;
        }

        .info-col:last-child {
          border-bottom: none;
        }
      }

      .allergy-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 0.75rem 1.25rem;
        margin: 0 0 1rem;
        font-size: 0.85rem;
        color: #5a5347;
      }

      .allergy-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(45, 42, 36, 0.45);
        z-index: 50;
      }

      .allergy-dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 51;
        width: min(420px, calc(100vw - 2rem));
        max-height: calc(100vh - 2rem);
        overflow-y: auto;
        background: #faf5ea;
        border: 1px solid #d8cfb8;
        border-radius: 8px;
        padding: 1.5rem 1.5rem 1.25rem;
        box-shadow: 0 18px 48px rgba(45, 42, 36, 0.35);
      }

      .allergy-dialog-title {
        margin: 0 0 0.25rem;
        font-family: "Cormorant Garamond", Georgia, serif;
        font-weight: 500;
        font-size: 1.4rem;
        color: #2d2a24;
      }

      .allergy-dialog-help {
        margin: 0 0 1rem;
        color: #8b8273;
        font-size: 0.85rem;
      }

      .allergy-options {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1rem;
        margin-bottom: 1rem;
      }

      .allergy-option {
        flex: 0 0 calc((100% - 1rem) / 2);
        display: flex;
        align-items: center;
        justify-content: flex-start;
        text-align: left;
        gap: 0.5rem;
        font-size: 0.9rem;
        color: #2d2a24;
        cursor: pointer;
      }

      .allergy-option input {
        width: fit-content;
        accent-color: #6f7a5b;
      }

      .allergy-other {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        margin-bottom: 1rem;
        font-size: 0.85rem;
        color: #5a5347;
      }

      .allergy-other input {
        padding: 0.6rem 0.75rem;
        border-radius: 4px;
        border: 1px solid #d8cfb8;
        background: #fff;
        color: #2d2a24;
        font: inherit;
      }

      .allergy-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }

      @media (max-width: 480px) {
        .allergy-option {
          flex: 0 0 100%;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WeddingEventComponent implements OnChanges {
  private readonly api = inject(WeddingApiService);
  protected readonly i18n = inject(I18nService);

  @Input({ required: true }) event!: EventInfo;
  @Input({ required: true }) user!: UserInfo;
  @Input() backendBaseUrl = '';

  @Output() eventsUpdated = new EventEmitter<EventInfo[]>();
  @Output() userUpdated = new EventEmitter<UserInfo>();
  @Output() statusMessage = new EventEmitter<string>();

  protected selectedRsvp = signal('yes');
  protected isWorking = false;
  protected readonly allergyOptions = ALLERGY_OPTIONS;
  protected readonly drinkOptions = ['water', 'soda', 'alcohol'];
  protected readonly allergiesOpen = signal(false);
  protected readonly checkedAllergies = signal<Set<AllergyKey>>(new Set());
  protected otherAllergies = '';
  protected isSavingAllergies = false;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['event'] || changes['user']) {
      this.syncSelectedRsvp();
    }
    if (changes['user']) {
      this.syncAllergiesFromUser();
    }
  }

  protected onCalendarAddedUpdated(added: boolean) {
    this.userUpdated.emit({
      ...this.user,
      addedToCalendar: added
    });
  }

  protected async saveRsvp() {
    this.isWorking = true;
    this.statusMessage.emit('Saving RSVP...');

    try {
      const updatedEvents = await this.api.saveRsvp({
        fullName: this.user.fullName,
        eventPlace: this.event.place,
        status: this.selectedRsvp()
      });

      if (!updatedEvents) {
        this.statusMessage.emit('Could not update RSVP.');
        return;
      }

      this.eventsUpdated.emit(updatedEvents);
      this.statusMessage.emit('RSVP updated.');
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
    } finally {
      this.isWorking = false;
    }
  }

  protected calendarLink(provider: 'outlook' | 'google') {
    const start = this.toUtcCalendarTime(this.event.time);
    const end = this.toUtcCalendarTime(
      new Date(new Date(this.event.time).getTime() + 4 * 60 * 60 * 1000).toISOString()
    );
    const title = encodeURIComponent('Majori Wedding Celebration');
    const location = encodeURIComponent(this.event.place);

    if (provider === 'outlook') {
      return `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${title}&startdt=${encodeURIComponent(new Date(this.event.time).toISOString())}&enddt=${encodeURIComponent(new Date(new Date(this.event.time).getTime() + 4 * 60 * 60 * 1000).toISOString())}&location=${location}`;
    }

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&location=${location}`;
  }

  protected eventDate() {
    return this.i18n.formatDate(
      this.event?.time ?? '',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
      this.i18n.timeZoneForPlace(this.event?.place)
    );
  }

  protected eventTime() {
    const eventRegion = this.i18n.regionForPlace(this.event?.place);
    const tz = eventRegion ? this.i18n.timeZoneForRegion(eventRegion) : undefined;
    const time = this.i18n.formatDate(
      this.event?.time ?? '',
      { hour: '2-digit', minute: '2-digit' },
      tz
    );
    if (!eventRegion || !this.event?.time) {
      return time;
    }
    return `${time} ${this.i18n.regionTimeSuffix(eventRegion)}`;
  }

  protected eventTimeSecondary(): string | null {
    if (!this.event?.time) {
      return null;
    }
    const eventRegion = this.i18n.regionForPlace(this.event.place);
    const userRegion = this.i18n.regionForLocale();
    // Only show a secondary time for Norway/Brazil viewers when the event is in the other region.
    if (!eventRegion || eventRegion === userRegion || userRegion === 'uk') {
      return null;
    }
    const time = this.i18n.formatDate(
      this.event.time,
      { hour: '2-digit', minute: '2-digit' },
      this.i18n.timeZoneForRegion(userRegion)
    );
    return `${time} ${this.i18n.regionTimeSuffix(userRegion)}`;
  }

  protected eventPlaceLabel() {
    return this.event.venueName ? `${this.event.venueName}, ${this.event.place}` : this.event.place;
  }

  private syncSelectedRsvp() {
    this.selectedRsvp.set(this.event.rsvp[this.user.fullName] ?? 'yes');
  }

  private syncAllergiesFromUser() {
    const known = new Set<AllergyKey>();
    const others: string[] = [];
    const knownLabelMap = new Map<string, AllergyKey>();
    for (const key of ALLERGY_OPTIONS) {
      knownLabelMap.set(key.toLowerCase(), key);
      knownLabelMap.set(this.i18n.t('allergy.option.' + key).toLowerCase(), key);
    }
    for (const entry of this.user?.allergies ?? []) {
      const match = knownLabelMap.get(entry.toLowerCase());
      if (match) {
        known.add(match);
      } else {
        others.push(entry);
      }
    }
    this.checkedAllergies.set(known);
    this.otherAllergies = others.join(', ');
  }

  protected isAllergyChecked(key: AllergyKey): boolean {
    return this.checkedAllergies().has(key);
  }

  protected toggleAllergy(key: AllergyKey, checked: boolean) {
    const next = new Set(this.checkedAllergies());
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    this.checkedAllergies.set(next);
  }

  protected openAllergies() {
    this.syncAllergiesFromUser();
    this.allergiesOpen.set(true);
  }

  protected closeAllergies() {
    this.allergiesOpen.set(false);
  }

  protected currentChoice(): { meal: string; drink: string } {
    const stored = this.user.eventChoices?.[this.event.place];
    const defaultMeal = this.event.mealOptions?.[0]?.type ?? '';
    const defaultDrink = this.drinkOptions[0] ?? '';
    return {
      meal: stored?.meal ? stored.meal : defaultMeal,
      drink: stored?.drink ? stored.drink : defaultDrink,
    };
  }

  protected async persistChoice(patch: { meal?: string; drink?: string }) {
    const current = this.currentChoice();
    const next = { meal: current.meal, drink: current.drink, ...patch };
    const previousChoices = this.user.eventChoices ?? {};

    // Optimistic local update so the dropdown reflects the new value immediately.
    this.userUpdated.emit({
      ...this.user,
      eventChoices: { ...previousChoices, [this.event.place]: next }
    });

    try {
      const result = await this.api.saveEventChoice({
        fullName: this.user.fullName,
        eventPlace: this.event.place,
        ...patch
      });
      if (result === null) {
        this.statusMessage.emit('Could not save preference.');
        this.userUpdated.emit({ ...this.user, eventChoices: previousChoices });
      }
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
      this.userUpdated.emit({ ...this.user, eventChoices: previousChoices });
    }
  }

  protected async saveAllergies() {
    this.isSavingAllergies = true;
    try {
      const checkedLabels = Array.from(this.checkedAllergies());
      const others = this.otherAllergies
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      const payload = [...checkedLabels, ...others];

      const result = await this.api.saveAllergies({
        fullName: this.user.fullName,
        allergies: payload
      });

      if (result === null) {
        this.statusMessage.emit('Could not save allergies.');
        return;
      }

      this.userUpdated.emit({ ...this.user, allergies: result });
      this.statusMessage.emit(this.i18n.t('allergy.saved'));
      this.allergiesOpen.set(false);
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
    } finally {
      this.isSavingAllergies = false;
    }
  }

  private toUtcCalendarTime(value: string) {
    return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }
}
