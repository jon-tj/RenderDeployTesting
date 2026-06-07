import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HubApi } from '../services/hub-api.service';
import { AuthService } from '../services/auth.service';
import { Dietary, DEFAULT_LANGUAGE, LanguageCode, OnboardingStatus } from '../models';
import { DietaryFormComponent, EMPTY_DIETARY } from './dietary-form.component';
import { LanguagePickerComponent } from './language-picker.component';

@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, DietaryFormComponent, LanguagePickerComponent],
  template: `
    <div class="auth-page">
      <div class="card">
        @if (loading()) {
          <p>Loading…</p>
        } @else if (notFound()) {
          <h1>Invite not found</h1>
          <p>This onboarding link is invalid or has been removed.</p>
        } @else if (status(); as s) {
          <h1>Welcome{{ s.displayName ? ', ' + s.displayName : '' }}</h1>
          <p class="muted">Setting up the account for <strong>{{ s.email }}</strong>.</p>

          <form (ngSubmit)="onSubmit()">
            @if (step() === 1) {
              <label>Display name
                <input name="displayName" [(ngModel)]="displayName" required />
              </label>
              <app-language-picker [value]="language()" (valueChange)="language.set($event)" label="Preferred language" />
              <label>Choose a password
                <input type="password" name="password" [(ngModel)]="password" required minlength="8" autocomplete="new-password" />
              </label>
              <label>Confirm password
                <input type="password" name="confirmPassword" [(ngModel)]="confirmPassword" required autocomplete="new-password" />
              </label>

              @if (error()) { <p class="error">{{ error() }}</p> }
              <button type="submit">Next</button>
            } @else {
              <fieldset class="diet-card">
                <legend>Dietary preferences (optional)</legend>
                <p class="muted small">Helps hosts plan meals. You can change this any time in settings.</p>
                <app-dietary-form [value]="dietary()" (valueChange)="dietary.set($event)" />
              </fieldset>

              @if (error()) { <p class="error">{{ error() }}</p> }
              <div class="step-actions">
                <button type="button" class="ghost" (click)="back()" [disabled]="busy()">Back</button>
                <button type="submit" [disabled]="busy()">{{ busy() ? 'Finishing…' : 'Finish setup' }}</button>
              </div>
            }
          </form>
        }
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height:100vh; display:grid; place-items:center; background:#faf7f0; padding:1rem; }
    .card { display:flex; flex-direction:column; gap:.9rem; width:100%; max-width:380px; padding:1.5rem; background:#fff; border:1px solid #e6e1d4; border-radius:.6rem; }
    h1 { margin:0; }
    form { display:flex; flex-direction:column; gap:.9rem; margin-top:.25rem; }
    label { display:flex; flex-direction:column; gap:.3rem; font-size:.9rem; color:#5a5347; }
    input { padding:.55rem .7rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; }
    button { padding:.6rem; background:#6f7a5b; color:#faf5ea; border:0; border-radius:.4rem; cursor:pointer; font-weight:600; }
    button[disabled] { opacity:.6; cursor:wait; }
    .muted { color:#8b8273; margin:0; }
    .small { font-size:.8rem; }
    .error { color:#a23; margin:0; white-space:pre-wrap; }
    .diet-card { border:1px solid #e6e1d4; border-radius:.5rem; padding:.75rem 1rem 1rem; display:flex; flex-direction:column; gap:.5rem; margin:0; }
    .diet-card legend { font-size:.8rem; color:#5a5347; padding:0 .35rem; letter-spacing:.04em; text-transform:uppercase; }
    .step-actions { display:flex; gap:.5rem; }
    .step-actions button { flex:1; }
    .ghost { background:transparent; color:#5a5347; border:1px solid #d8cfb8; }
  `],
})
export class OnboardingComponent implements OnInit {
  private readonly api = inject(HubApi);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly status = signal<OnboardingStatus | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly step = signal<1 | 2>(1);

  protected displayName = '';
  protected password = '';
  protected confirmPassword = '';
  protected readonly dietary = signal<Dietary>({ ...EMPTY_DIETARY, allergens: [] });
  protected readonly language = signal<LanguageCode>(DEFAULT_LANGUAGE);

  async ngOnInit(): Promise<void> {
    const userId = this.route.snapshot.paramMap.get('userId') ?? '';
    if (!userId) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }
    try {
      const status = await this.api.getOnboardingStatus(userId);
      if (status.isOnboarded) {
        // Already set up — drop them at the requested destination (or the
        // dashboard). If they aren't signed in, the auth guard handles login.
        this.router.navigateByUrl(this.resolveNext(), { replaceUrl: true });
        return;
      }
      this.status.set(status);
      this.displayName = status.displayName || status.email.split('@')[0];
    } catch (e: any) {
      if (e?.status === 404) this.notFound.set(true);
      else this.error.set('Could not load this invite.');
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.step() === 1) {
      this.error.set('');
      if (!this.displayName.trim()) {
        this.error.set('Please enter a display name.');
        return;
      }
      if (this.password.length < 8) {
        this.error.set('Password must be at least 8 characters.');
        return;
      }
      if (this.password !== this.confirmPassword) {
        this.error.set('Passwords do not match.');
        return;
      }
      this.error.set('');
      this.step.set(2);
      return;
    }
    await this.submit();
  }

  back(): void {
    this.error.set('');
    this.step.set(1);
  }

  async submit(): Promise<void> {
    this.error.set('');
    const s = this.status();
    if (!s) return;
    if (this.password.length < 8) {
      this.error.set('Password must be at least 8 characters.');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }
    this.busy.set(true);
    try {
      await this.api.onboard(s.id, this.password, this.displayName.trim() || undefined, this.dietary(), this.language());
      // Auto-sign-in so the user lands on their destination ready to go.
      await this.auth.login(s.email, this.password);
      this.router.navigateByUrl(this.resolveNext(), { replaceUrl: true });
    } catch (e: any) {
      const body = e?.error;
      const detail = typeof body === 'string'
        ? body
        : (body?.detail || (body?.errors && Object.values(body.errors).flat().join('\n')) || 'Could not finish setup.');
      this.error.set(detail);
    } finally {
      this.busy.set(false);
    }
  }

  // Only accept same-origin relative paths so a malicious link can't bounce
  // a newly-onboarded user to an external site.
  private resolveNext(): string {
    const raw = this.route.snapshot.queryParamMap.get('next');
    if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
    return '/';
  }
}
