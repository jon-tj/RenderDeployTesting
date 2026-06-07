import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Allergen, DIETARY_PREFERENCES, Dietary, DietaryPreference, STANDARD_ALLERGENS } from '../models';

@Component({
  selector: 'app-dietary-form',
  imports: [FormsModule],
  template: `
    <div class="diet">
      <label class="field">Diet
        <select name="dietPref" [ngModel]="value().preference" (ngModelChange)="onPref($event)">
          @for (p of preferences; track p) {
            <option [value]="p">{{ p }}</option>
          }
        </select>
      </label>

      <fieldset class="allergens">
        <legend>Allergens</legend>
        <div class="grid">
          @for (a of allergens; track a) {
            <label class="check">
              <input
                type="checkbox"
                [name]="'allergen-' + a"
                [checked]="hasAllergen(a)"
                (change)="toggleAllergen(a, $any($event.target).checked)" />
              {{ a }}
            </label>
          }
        </div>
      </fieldset>

      <label class="field">Other allergens
        <input
          name="customAllergens"
          [ngModel]="value().customAllergens"
          (ngModelChange)="onCustom($event)"
          placeholder="e.g. coconut, kiwi" />
      </label>

      <label class="field">Notes
        <textarea
          name="dietNotes"
          rows="2"
          [ngModel]="value().notes"
          (ngModelChange)="onNotes($event)"
          placeholder="Anything else hosts should know?"></textarea>
      </label>
    </div>
  `,
  styles: [`
    .diet { display:flex; flex-direction:column; gap:.75rem; }
    .field { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; color:#5a5347; }
    input, select, textarea { padding:.5rem .65rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; background:#fff; }
    textarea { resize:vertical; }
    fieldset.allergens { border:1px solid #e6e1d4; border-radius:.4rem; padding:.5rem .75rem .75rem; margin:0; }
    fieldset.allergens legend { font-size:.8rem; color:#8b8273; padding:0 .35rem; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:.25rem .5rem; }
    .check { display:flex; align-items:center; gap:.4rem; font-size:.85rem; color:#3a3327; }
    .check input { width:auto; }
  `],
})
export class DietaryFormComponent {
  readonly value = input.required<Dietary>();
  readonly valueChange = output<Dietary>();

  protected readonly preferences = DIETARY_PREFERENCES;
  protected readonly allergens = STANDARD_ALLERGENS;

  protected hasAllergen(a: Allergen): boolean {
    return this.value().allergens.includes(a);
  }

  protected toggleAllergen(a: Allergen, on: boolean): void {
    const v = this.value();
    const next = on
      ? (v.allergens.includes(a) ? v.allergens : [...v.allergens, a])
      : v.allergens.filter(x => x !== a);
    this.valueChange.emit({ ...v, allergens: next });
  }

  protected onPref(p: DietaryPreference): void {
    this.valueChange.emit({ ...this.value(), preference: p });
  }

  protected onCustom(s: string): void {
    this.valueChange.emit({ ...this.value(), customAllergens: s });
  }

  protected onNotes(s: string): void {
    this.valueChange.emit({ ...this.value(), notes: s });
  }
}

export const EMPTY_DIETARY: Dietary = {
  preference: 'None',
  allergens: [],
  customAllergens: '',
  notes: '',
};
