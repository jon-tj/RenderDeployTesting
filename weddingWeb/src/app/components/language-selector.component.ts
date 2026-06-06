import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { I18nService, Locale, SUPPORTED_LOCALES } from '../services/i18n.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  template: `
    <div class="language-selector" [attr.aria-label]="i18n.t('lang.aria')" role="group">
      @for (option of options; track option.code) {
        <button
          type="button"
          class="lang-button"
          [class.active]="i18n.locale() === option.code"
          [attr.aria-pressed]="i18n.locale() === option.code"
          [attr.title]="option.label"
          (click)="select(option.code)"
        >
          <span class="lang-flag" aria-hidden="true">{{ option.flag }}</span>
          <span class="lang-code">{{ option.code === 'pt-BR' ? 'PT' : option.code === 'nb' ? 'NO' : 'EN' }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .language-selector {
        display: inline-flex;
        gap: 0.35rem;
        padding: 0.35rem;
        border-radius: 999px;
        background: rgba(45, 42, 36, 0.45);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        border: 1px solid rgba(245, 234, 210, 0.3);
        box-shadow: 0 6px 18px rgba(45, 42, 36, 0.25);
      }

      .lang-button {
        font: inherit;
        font-family: "Montserrat", sans-serif;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--cream-light, #f5ead2);
        font-size: 0.7rem;
        font-weight: 500;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        cursor: pointer;
        transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;
      }

      .lang-button:hover {
        background: rgba(245, 234, 210, 0.18);
      }

      .lang-button.active {
        background: var(--bg-cream-soft, #faf5ea);
        color: var(--ink, #2d2a24);
        border-color: var(--accent-soft, #c9b88a);
      }

      .lang-flag {
        font-family: "Twemoji Country Flags", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
        font-size: 1rem;
        line-height: 1;
      }

      .lang-code {
        font-size: 0.65rem;
      }

      @media (max-width: 520px) {
        .lang-code {
          display: none;
        }

        .lang-button {
          padding: 0.4rem 0.55rem;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LanguageSelectorComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly options = SUPPORTED_LOCALES;

  protected select(code: Locale) {
    this.i18n.setLocale(code);
  }
}
