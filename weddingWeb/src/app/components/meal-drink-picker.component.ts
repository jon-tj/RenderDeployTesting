import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { I18nService } from '../services/i18n.service';
import { MealOption } from '../services/wedding-api.service';

@Component({
  selector: 'app-meal-drink-picker',
  standalone: true,
  imports: [TitleCasePipe],
  template: `
    @if (mealOptions?.length) {
      <fieldset class="choice-group">
        <legend class="choice-label">{{ i18n.t('diet.meal') }}</legend>
        <div class="menu-options">
          @for (option of mealOptions; track option.type; let last = $last) {
            <button
              type="button"
              class="menu-item"
              [class.selected]="selectedMeal === option.type"
              (click)="mealChange.emit(option.type)"
              [attr.aria-pressed]="selectedMeal === option.type"
            >
              <span class="menu-icon" aria-hidden="true">
                @switch (option.type.toLowerCase()) {
                  @case ('meat') {
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M14 30c0-9 8-16 18-16s18 7 18 16c0 6-4 10-9 12l-3 7c-1 2-3 3-5 3s-4-1-5-3l-3-7c-5-2-11-6-11-12z"/>
                      <circle cx="24" cy="28" r="2" fill="currentColor" stroke="none"/>
                    </svg>
                  }
                  @case ('fish') {
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M8 32c6-10 16-14 26-14s18 4 22 10c-4 6-12 10-22 10S14 38 8 32z"/>
                      <path d="M56 24l6-6v28l-6-6"/>
                      <circle cx="22" cy="30" r="1.5" fill="currentColor" stroke="none"/>
                      <path d="M30 26c2 4 2 8 0 12"/>
                    </svg>
                  }
                  @case ('salad') {
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M10 30h44a4 4 0 0 1-4 4l-2 8a6 6 0 0 1-6 5H22a6 6 0 0 1-6-5l-2-8a4 4 0 0 1-4-4z"/>
                      <path d="M22 30c-2-6 2-12 8-12 2-4 8-4 10 0 6 0 9 6 7 12"/>
                      <path d="M30 22c1 3 1 6 0 8M38 22c-1 3-1 6 0 8"/>
                    </svg>
                  }
                  @default {
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="32" cy="32" r="20"/>
                      <circle cx="32" cy="32" r="14"/>
                    </svg>
                  }
                }
              </span>
              <span class="menu-text">
                <span class="menu-name">{{ option.name }}</span>
              </span>
            </button>
            @if (!last) {
              <span class="menu-divider" aria-hidden="true"></span>
            }
          }
        </div>
      </fieldset>
    }

    @if (drinkOptions.length) {
      <fieldset class="choice-group">
        <legend class="choice-label">{{ i18n.t('diet.drink') }}</legend>
        <div class="menu-options">
          @for (option of drinkOptions; track option; let last = $last) {
            <button
              type="button"
              class="menu-item"
              [class.selected]="selectedDrink === option"
              (click)="drinkChange.emit(option)"
              [attr.aria-pressed]="selectedDrink === option"
            >
              <span class="menu-icon" aria-hidden="true">
                @switch (option) {
                  @case ('water') {
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M32 6c-8 12-16 22-16 32a16 16 0 0 0 32 0c0-10-8-20-16-32z"/>
                      <path d="M24 36c0 5 3 9 8 10"/>
                    </svg>
                  }
                  @case ('soda') {
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M20 14h24l-2 38a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z"/>
                      <path d="M20 22h24"/>
                      <path d="M28 10h8"/>
                      <path d="M28 32c2 2 6 2 8 0M28 42c2 2 6 2 8 0"/>
                    </svg>
                  }
                  @case ('alcohol') {
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 10h28l-3 18a11 11 0 0 1-22 0z"/>
                      <path d="M32 39v13"/>
                      <path d="M22 54h20"/>
                    </svg>
                  }
                  @default {
                    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="32" cy="32" r="20"/>
                    </svg>
                  }
                }
              </span>
              <span class="menu-text">
                <span class="menu-name">{{ option | titlecase }}</span>
              </span>
            </button>
            @if (!last) {
              <span class="menu-divider" aria-hidden="true"></span>
            }
          }
        </div>
      </fieldset>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .choice-group {
        border: none;
        margin: 0 0 1rem;
        padding: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.55rem;
      }

      .choice-group legend {
        padding: 0;
        margin: 0 auto;
        text-align: center;
      }

      .choice-label {
        position: relative;
        padding: 0 0.85rem;
        font-family: "Montserrat", sans-serif;
        font-size: 0.7rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: #5a5347;
      }

      .choice-label::before,
      .choice-label::after {
        content: "";
        position: absolute;
        top: 50%;
        width: 28px;
        height: 1px;
        background: linear-gradient(to right, transparent, #c9b88a, transparent);
      }

      .choice-label::before { right: 100%; }
      .choice-label::after { left: 100%; }

      .menu-options {
        display: flex;
        flex-wrap: wrap;
        align-items: stretch;
        justify-content: center;
        gap: 0;
      }

      .menu-divider {
        width: 1px;
        align-self: stretch;
        margin: 0.4rem 0;
        background: linear-gradient(to bottom, transparent, #c9b88a 30%, #c9b88a 70%, transparent);
      }

      .menu-item {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        padding: 0.85rem 1.25rem;
        min-width: 96px;
        background: transparent;
        border: none;
        color: #5a5347;
        font: inherit;
        cursor: pointer;
        transition: color 0.18s ease, transform 0.18s ease;
      }

      .menu-item:hover {
        color: #2d2a24;
        transform: translateY(-1px);
      }

      .menu-item.selected {
        color: #2d2a24;
      }

      .menu-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        padding: 8px;
        border-radius: 50%;
        background: transparent;
        color: #6f7a5b;
        transition: color 0.18s ease, background 0.18s ease;
      }

      .menu-icon svg {
        width: 100%;
        height: 100%;
      }

      .menu-item.selected .menu-icon {
        color: #8a6d3a;
        background: #faf1d8;
      }

      .menu-text {
        display: inline-flex;
        flex-direction: column;
        align-items: center;
        gap: 0.1rem;
      }

      .menu-name {
        font-family: "Cormorant Garamond", "EB Garamond", Georgia, serif;
        font-size: 1.05rem;
        font-weight: 500;
        letter-spacing: 0.04em;
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MealDrinkPickerComponent {
  protected readonly i18n = inject(I18nService);

  @Input() mealOptions: MealOption[] | null | undefined = [];
  @Input() drinkOptions: string[] = [];
  @Input() currency = '';
  @Input() selectedMeal = '';
  @Input() selectedDrink = '';

  @Output() mealChange = new EventEmitter<string>();
  @Output() drinkChange = new EventEmitter<string>();
}
