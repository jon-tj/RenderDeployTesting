import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { AuthService } from '../services/auth.service';
import { ApiConfig } from '../services/api-config.service';
import { Dietary, DEFAULT_LANGUAGE, LanguageCode, Me } from '../models';
import { DietaryFormComponent, EMPTY_DIETARY } from './dietary-form.component';
import { LanguagePickerComponent } from './language-picker.component';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, NavbarComponent, DietaryFormComponent, LanguagePickerComponent],
  template: `
    <app-navbar />
    <main class="shell">
      <header class="head">
        <h1>Account settings</h1>
        <button type="button" class="ghost" (click)="back()">Back</button>
      </header>

      <section class="card">
        <h2>Profile</h2>
        <label>Email
          <input [value]="auth.me()?.email ?? ''" disabled />
        </label>
        <label>Display name
          <input name="displayName" [(ngModel)]="displayName" />
        </label>
        @if (profileError()) { <p class="error">{{ profileError() }}</p> }
        @if (profileSaved()) { <p class="ok">Saved.</p> }
        <div class="row">
          <button type="button" class="primary" (click)="saveProfile()" [disabled]="savingProfile()">
            {{ savingProfile() ? 'Saving…' : 'Save profile' }}
          </button>
        </div>
      </section>

      <section class="card">
        <h2>Language</h2>
        <p class="muted small">Used to pick translated titles and descriptions when hosts provide them.</p>
        <app-language-picker [value]="language()" (valueChange)="language.set($event)" />
        @if (languageError()) { <p class="error">{{ languageError() }}</p> }
        @if (languageSaved()) { <p class="ok">Saved.</p> }
        <div class="row">
          <button type="button" class="primary" (click)="saveLanguage()" [disabled]="savingLanguage()">
            {{ savingLanguage() ? 'Saving…' : 'Save language' }}
          </button>
        </div>
      </section>

      <section class="card">
        <h2>Dietary preferences</h2>
        <p class="muted small">Hosts can use this when planning meals for events you're invited to.</p>
        <app-dietary-form [value]="dietary()" (valueChange)="dietary.set($event)" />
        @if (dietaryError()) { <p class="error">{{ dietaryError() }}</p> }
        @if (dietarySaved()) { <p class="ok">Saved.</p> }
        <div class="row">
          <button type="button" class="primary" (click)="saveDietary()" [disabled]="savingDietary()">
            {{ savingDietary() ? 'Saving…' : 'Save dietary' }}
          </button>
        </div>
      </section>

      <section class="card">
        <h2>Change password</h2>
        <label>Current password
          <input type="password" name="oldPassword" [(ngModel)]="oldPassword" autocomplete="current-password" />
        </label>
        <label>New password
          <input type="password" name="newPassword" [(ngModel)]="newPassword" minlength="8" autocomplete="new-password" />
        </label>
        <label>Confirm new password
          <input type="password" name="confirmPassword" [(ngModel)]="confirmPassword" autocomplete="new-password" />
        </label>
        @if (passwordError()) { <p class="error">{{ passwordError() }}</p> }
        @if (passwordSaved()) { <p class="ok">Password updated.</p> }
        <div class="row">
          <button type="button" class="primary" (click)="changePassword()" [disabled]="changingPassword()">
            {{ changingPassword() ? 'Updating…' : 'Update password' }}
          </button>
        </div>
      </section>
    </main>
  `,
  styles: [`
    .shell { max-width:640px; margin:0 auto; padding:1.25rem; display:flex; flex-direction:column; gap:1rem; }
    .head { display:flex; align-items:center; gap:1rem; }
    .head h1 { flex:1; margin:0; }
    .card { background:#fff; border:1px solid #e6e1d4; border-radius:.6rem; padding:1rem 1.25rem; display:flex; flex-direction:column; gap:.75rem; }
    .card h2 { margin:0; font-size:1.05rem; }
    label { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; color:#5a5347; }
    input { padding:.5rem .65rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; }
    input:disabled { background:#faf7f0; color:#8b8273; }
    .row { display:flex; gap:.5rem; }
    .primary { background:#6f7a5b; color:#faf5ea; border:0; padding:.5rem .9rem; border-radius:.4rem; cursor:pointer; font:inherit; font-weight:600; }
    .primary:disabled { opacity:.6; cursor:wait; }
    .ghost { background:transparent; border:1px solid #c9b88a; padding:.4rem .8rem; border-radius:.4rem; cursor:pointer; font:inherit; }
    .ghost:hover { background:#f1e0c2; }
    .error { color:#a23; margin:0; white-space:pre-wrap; }
    .ok { color:#3a7a3a; margin:0; }
    .muted { color:#8b8273; margin:0; }
    .small { font-size:.8rem; }
  `],
})
export class SettingsComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfig);
  private readonly router = inject(Router);

  protected displayName = '';
  protected readonly dietary = signal<Dietary>({ ...EMPTY_DIETARY, allergens: [] });
  protected readonly language = signal<LanguageCode>(DEFAULT_LANGUAGE);

  protected oldPassword = '';
  protected newPassword = '';
  protected confirmPassword = '';

  protected readonly savingProfile = signal(false);
  protected readonly profileError = signal('');
  protected readonly profileSaved = signal(false);

  protected readonly savingDietary = signal(false);
  protected readonly dietaryError = signal('');
  protected readonly dietarySaved = signal(false);

  protected readonly savingLanguage = signal(false);
  protected readonly languageError = signal('');
  protected readonly languageSaved = signal(false);

  protected readonly changingPassword = signal(false);
  protected readonly passwordError = signal('');
  protected readonly passwordSaved = signal(false);

  ngOnInit(): void {
    this.hydrateFromMe();
    if (!this.displayName) {
      // /api/me may not have resolved yet on a fresh reload; pull once.
      void this.auth.refreshMe().then(() => this.hydrateFromMe());
    }
  }

  private hydrateFromMe(): void {
    const me = this.auth.me();
    if (!me) return;
    if (!this.displayName) this.displayName = me.displayName ?? '';
    this.language.set((me.preferredLanguage as LanguageCode) ?? DEFAULT_LANGUAGE);
    this.dietary.set({
      preference: me.dietary?.preference ?? 'None',
      allergens: [...(me.dietary?.allergens ?? [])],
      customAllergens: me.dietary?.customAllergens ?? '',
      notes: me.dietary?.notes ?? '',
    });
  }

  async saveProfile(): Promise<void> {
    this.profileError.set('');
    this.profileSaved.set(false);
    const name = this.displayName.trim();
    if (!name) {
      this.profileError.set('Display name cannot be empty.');
      return;
    }
    this.savingProfile.set(true);
    try {
      const me = await firstValueFrom(
        this.http.put<Me>(this.api.url('/api/me'), { displayName: name })
      );
      this.auth.setMe(me);
      this.profileSaved.set(true);
    } catch (e) {
      this.profileError.set(extractError(e) ?? 'Could not save profile.');
    } finally {
      this.savingProfile.set(false);
    }
  }

  async saveDietary(): Promise<void> {
    this.dietaryError.set('');
    this.dietarySaved.set(false);
    this.savingDietary.set(true);
    try {
      const me = await firstValueFrom(
        this.http.put<Me>(this.api.url('/api/me'), { dietary: this.dietary() })
      );
      this.auth.setMe(me);
      this.dietarySaved.set(true);
    } catch (e) {
      this.dietaryError.set(extractError(e) ?? 'Could not save dietary preferences.');
    } finally {
      this.savingDietary.set(false);
    }
  }

  async saveLanguage(): Promise<void> {
    this.languageError.set('');
    this.languageSaved.set(false);
    this.savingLanguage.set(true);
    try {
      const me = await firstValueFrom(
        this.http.put<Me>(this.api.url('/api/me'), { preferredLanguage: this.language() })
      );
      this.auth.setMe(me);
      this.languageSaved.set(true);
    } catch (e) {
      this.languageError.set(extractError(e) ?? 'Could not save language.');
    } finally {
      this.savingLanguage.set(false);
    }
  }

  async changePassword(): Promise<void> {
    this.passwordError.set('');
    this.passwordSaved.set(false);
    if (!this.oldPassword || !this.newPassword) {
      this.passwordError.set('Both current and new password are required.');
      return;
    }
    if (this.newPassword.length < 8) {
      this.passwordError.set('New password must be at least 8 characters.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordError.set('New passwords do not match.');
      return;
    }
    this.changingPassword.set(true);
    try {
      // ASP.NET Core Identity API endpoint exposed by MapIdentityApi.
      await firstValueFrom(
        this.http.post(this.api.url('/api/auth/manage/info'), {
          newPassword: this.newPassword,
          oldPassword: this.oldPassword,
        })
      );
      this.oldPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.passwordSaved.set(true);
    } catch (e) {
      this.passwordError.set(extractError(e) ?? 'Could not change password.');
    } finally {
      this.changingPassword.set(false);
    }
  }

  back(): void {
    this.router.navigate(['/']);
  }
}

function extractError(e: unknown): string | null {
  if (!(e instanceof HttpErrorResponse)) return null;
  const body = e.error;
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    if (body.errors && typeof body.errors === 'object') {
      return Object.values(body.errors).flat().join('\n');
    }
    if (typeof body.detail === 'string') return body.detail;
    if (typeof body.title === 'string') return body.title;
  }
  return null;
}
