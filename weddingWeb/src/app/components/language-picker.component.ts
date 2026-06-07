import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LANGUAGES, LanguageCode } from '../models';

@Component({
  selector: 'app-language-picker',
  imports: [FormsModule],
  template: `
    <label class="lp">
      @if (label()) { <span class="lp-label">{{ label() }}</span> }
      <select [name]="name()" [ngModel]="value()" (ngModelChange)="valueChange.emit($event)">
        @for (l of languages; track l.code) {
          <option [value]="l.code">{{ l.label }}</option>
        }
      </select>
    </label>
  `,
  styles: [`
    .lp { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; color:#5a5347; }
    select { padding:.5rem .65rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; background:#fff; }
  `],
})
export class LanguagePickerComponent {
  readonly value = input.required<LanguageCode>();
  readonly valueChange = output<LanguageCode>();
  readonly label = input<string>('Language');
  readonly name = input<string>('language');

  protected readonly languages = LANGUAGES;
}
