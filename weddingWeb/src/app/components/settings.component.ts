import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { AuthService } from '../services/auth.service';
import { ApiConfig } from '../services/api-config.service';
import { Dietary, DEFAULT_LANGUAGE, LanguageCode, Me } from '../models';
import { DietaryFormComponent, EMPTY_DIETARY } from './dietary-form.component';
import { LanguagePickerComponent } from './language-picker.component';
import { extractHttpError } from '../utils/http-error';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, NavbarComponent, DietaryFormComponent, LanguagePickerComponent],
  template: `
    <app-navbar />
    <main class="shell" style="max-width:640px">
      <header class="head">
        <h1>Account settings</h1>
        <button type="button" class="ghost" (click)="back()">Back</button>
      </header>

      <section class="card">
        <h2>Profile</h2>
        <label>Email <input [value]="auth.me()?.email ?? ''" disabled /></label>
        <label>Display name <input name="displayName" [(ngModel)]="displayName" /></label>
        @if (msg('profile'); as m) { <p [class]="m.ok ? 'ok' : 'error'">{{ m.text }}</p> }
        <div><button type="button" class="primary" (click)="save('profile', { displayName: displayName.trim() }, 'Display name cannot be empty.')" [disabled]="busy() === 'profile'">
          {{ busy() === 'profile' ? 'Saving…' : 'Save profile' }}
        </button></div>
      </section>

      <section class="card">
        <h2>Language</h2>
        <p class="muted small">Used to pick translated titles and descriptions when hosts provide them.</p>
        <app-language-picker [value]="language()" (valueChange)="language.set($event)" />
        @if (msg('language'); as m) { <p [class]="m.ok ? 'ok' : 'error'">{{ m.text }}</p> }
        <div><button type="button" class="primary" (click)="save('language', { preferredLanguage: language() })" [disabled]="busy() === 'language'">
          {{ busy() === 'language' ? 'Saving…' : 'Save language' }}
        </button></div>
      </section>

      <section class="card">
        <h2>Dietary preferences</h2>
        <p class="muted small">Hosts can use this when planning meals for events you're invited to.</p>
        <app-dietary-form [value]="dietary()" (valueChange)="dietary.set($event)" />
        @if (msg('dietary'); as m) { <p [class]="m.ok ? 'ok' : 'error'">{{ m.text }}</p> }
        <div><button type="button" class="primary" (click)="save('dietary', { dietary: dietary() })" [disabled]="busy() === 'dietary'">
          {{ busy() === 'dietary' ? 'Saving…' : 'Save dietary' }}
        </button></div>
      </section>

      <section class="card">
        <h2>Change password</h2>
        <label>Current password <input type="password" name="oldPassword" [(ngModel)]="oldPassword" autocomplete="current-password" /></label>
        <label>New password <input type="password" name="newPassword" [(ngModel)]="newPassword" minlength="8" autocomplete="new-password" /></label>
        <label>Confirm new password <input type="password" name="confirmPassword" [(ngModel)]="confirmPassword" autocomplete="new-password" /></label>
        @if (msg('password'); as m) { <p [class]="m.ok ? 'ok' : 'error'">{{ m.text }}</p> }
        <div><button type="button" class="primary" (click)="changePassword()" [disabled]="busy() === 'password'">
          {{ busy() === 'password' ? 'Updating…' : 'Update password' }}
        </button></div>
      </section>
    </main>
  `,
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

  protected readonly busy = signal<string | null>(null);
  private readonly msgs = signal<Record<string, { ok: boolean; text: string }>>({});
  protected msg(k: string) { return this.msgs()[k]; }
  private setMsg(k: string, ok: boolean, text: string) { this.msgs.set({ ...this.msgs(), [k]: { ok, text } }); }

  ngOnInit(): void {
    this.hydrate();
    if (!this.displayName) void this.auth.refreshMe().then(() => this.hydrate());
  }

  private hydrate(): void {
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

  async save(key: string, body: Partial<Me>, emptyCheck?: string): Promise<void> {
    if (emptyCheck && !(body as any).displayName) { this.setMsg(key, false, emptyCheck); return; }
    this.busy.set(key);
    try {
      const me = await firstValueFrom(this.http.put<Me>(this.api.url('/api/me'), body));
      this.auth.setMe(me);
      this.setMsg(key, true, 'Saved.');
    } catch (e) {
      this.setMsg(key, false, extractHttpError(e) ?? `Could not save ${key}.`);
    } finally { this.busy.set(null); }
  }

  async changePassword(): Promise<void> {
    if (!this.oldPassword || !this.newPassword) return this.setMsg('password', false, 'Both current and new password are required.');
    if (this.newPassword.length < 8) return this.setMsg('password', false, 'New password must be at least 8 characters.');
    if (this.newPassword !== this.confirmPassword) return this.setMsg('password', false, 'New passwords do not match.');
    this.busy.set('password');
    try {
      await firstValueFrom(this.http.post(this.api.url('/api/auth/manage/info'),
        { newPassword: this.newPassword, oldPassword: this.oldPassword }));
      this.oldPassword = this.newPassword = this.confirmPassword = '';
      this.setMsg('password', true, 'Password updated.');
    } catch (e) {
      this.setMsg('password', false, extractHttpError(e) ?? 'Could not change password.');
    } finally { this.busy.set(null); }
  }

  protected back() { this.router.navigate(['/']); }
}
