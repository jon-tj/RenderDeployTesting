import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Allergen, DIETARY_PREFERENCES, Dietary, DietaryPreference, STANDARD_ALLERGENS } from '../models';

export const EMPTY_DIETARY: Dietary = { preference: 'None', allergens: [], customAllergens: '', notes: '' };

@Component({
  selector: 'app-dietary-form',
  imports: [FormsModule],
  template: `
    <label>Diet
      <select name="dietPref" [ngModel]="value().preference" (ngModelChange)="emit({ preference: $event })">
        @for (p of preferences; track p) { <option [value]="p">{{ p }}</option> }
      </select>
    </label>

    <fieldset class="allergens">
      <legend>Allergens</legend>
      <div class="allergen-grid">
        @for (a of allergens; track a) {
          <label class="check" style="margin:0;font-size:.85rem">
            <input type="checkbox" [name]="'allergen-' + a"
              [checked]="value().allergens.includes(a)"
              (change)="toggleAllergen(a, $any($event.target).checked)" />
            {{ a }}
          </label>
        }
      </div>
    </fieldset>

    <label>Other allergens
      <input name="customAllergens" [ngModel]="value().customAllergens"
        (ngModelChange)="emit({ customAllergens: $event })" placeholder="e.g. coconut, kiwi" />
    </label>

    <label>Notes
      <textarea name="dietNotes" rows="2" [ngModel]="value().notes"
        (ngModelChange)="emit({ notes: $event })" placeholder="Anything else hosts should know?"></textarea>
    </label>
  `,
  styles: [`
    :host { display:flex; flex-direction:column; gap:.75rem; }
    fieldset.allergens { border:1px solid var(--rule); border-radius:.4rem; padding:.5rem .75rem .75rem; margin:0; }
    fieldset.allergens legend { font-size:.8rem; color:var(--muted); padding:0 .35rem; }
    .allergen-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:.25rem .5rem; }
  `],
})
export class DietaryFormComponent {
  readonly value = input.required<Dietary>();
  readonly valueChange = output<Dietary>();

  protected readonly preferences = DIETARY_PREFERENCES;
  protected readonly allergens = STANDARD_ALLERGENS;

  protected emit(patch: Partial<Dietary>): void { this.valueChange.emit({ ...this.value(), ...patch }); }

  protected toggleAllergen(a: Allergen, on: boolean): void {
    const cur = this.value().allergens;
    this.emit({ allergens: on ? (cur.includes(a) ? cur : [...cur, a]) : cur.filter(x => x !== a) });
  }
}
