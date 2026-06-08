import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChildEvent, EventDetail, LanguageCode } from '../models';
import { localizedOption, t, translateStatus } from '../utils/i18n';
import { ChildRsvpState, RSVP_STATUSES } from './event-view.base';

type OptionSource = EventDetail | ChildEvent;

// Renders the status/meal/drink selects + a submit button. Used 4× across
// event-detail (parent + per-child) and wedding-event (parent + per-child).
// The state object is mutated in place via ngModel; the parent owns the save.
@Component({
  selector: 'app-rsvp-form',
  imports: [FormsModule],
  template: `
    @if (state().error) { <p class="error">{{ state().error }}</p> }
    @if (state().savedAt) { <p class="saved">{{ s('thankYou') }}</p> }
    <div [class]="isWedding() ? 'rsvp-grid' : 'grid'">
      <label>{{ s('attending') }}
        <select [name]="'st-' + suffix()" [(ngModel)]="state().status">
          @for (st of statuses; track st) { <option [value]="st">{{ statusLabel(st) }}</option> }
        </select>
      </label>
      @if (event().mealOptions.length) {
        <label>{{ s('meal') }}
          <select [name]="'ml-' + suffix()" [(ngModel)]="state().mealChoice">
            <option [ngValue]="''">{{ s('noPreference') }}</option>
            @for (m of event().mealOptions; track m) { <option [ngValue]="m">{{ opt('meal', m) }}</option> }
          </select>
        </label>
      }
      @if (event().drinkOptions.length) {
        <label>{{ s('drink') }}
          <select [name]="'dr-' + suffix()" [(ngModel)]="state().drinkChoice">
            <option [ngValue]="''">{{ s('noPreference') }}</option>
            @for (d of event().drinkOptions; track d) { <option [ngValue]="d">{{ opt('drink', d) }}</option> }
          </select>
        </label>
      }
    </div>
    <div [class]="isWedding() ? 'rsvp-actions' : 'action-row'">
      <button type="button" [class]="buttonClass()" (click)="save.emit()" [disabled]="state().saving">
        {{ state().saving ? s('saving') : s('reply') }}
      </button>
    </div>
  `,
  styles: [`
    .action-row { display:flex; justify-content:flex-end; }
  `],
})
export class RsvpFormComponent {
  readonly event = input.required<OptionSource>();
  readonly state = input.required<ChildRsvpState>();
  readonly lang = input.required<LanguageCode>();
  readonly suffix = input<string>('parent');
  readonly variant = input<'standard' | 'wedding' | 'wedding-big'>('standard');
  readonly save = output<void>();

  protected readonly statuses = RSVP_STATUSES;
  protected isWedding() { return this.variant() !== 'standard'; }
  protected s(k: Parameters<typeof t>[0]) { return t(k, this.lang()); }
  protected statusLabel(st: typeof RSVP_STATUSES[number]) { return translateStatus(st, this.lang()); }
  protected opt(k: 'meal' | 'drink', v: string) { return localizedOption(this.event(), this.lang(), k, v); }
  protected buttonClass(): string {
    const v = this.variant();
    return v === 'wedding-big' ? 'soft big' : v === 'wedding' ? 'soft' : 'primary';
  }
}
