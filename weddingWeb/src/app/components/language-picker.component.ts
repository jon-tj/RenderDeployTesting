import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LANGUAGES, LanguageCode } from '../models';

// Plain dropdown wrapped in a label. Used by settings + onboarding; rendered
// inside a .card so it picks up the shared form styling automatically.
@Component({
  selector: 'app-language-picker',
  imports: [FormsModule],
  template: `
    <label>
      @if (label()) { <span>{{ label() }}</span> }
      <select [name]="name()" [ngModel]="value()" (ngModelChange)="valueChange.emit($event)">
        @for (l of languages; track l.code) { <option [value]="l.code">{{ l.label }}</option> }
      </select>
    </label>
  `,
})
export class LanguagePickerComponent {
  readonly value = input.required<LanguageCode>();
  readonly valueChange = output<LanguageCode>();
  readonly label = input<string>('Language');
  readonly name = input<string>('language');
  protected readonly languages = LANGUAGES;
}
