import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HubApi } from '../services/hub-api.service';
import { AuthService } from '../services/auth.service';
import { OnboardingStatus } from '../models';

@Component({
  selector: 'app-onboarding',
  imports: [FormsModule],
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

          <form (ngSubmit)="submit()">
            <label>Display name
              <input name="displayName" [(ngModel)]="displayName" required />
            </label>
            <label>Choose a password
              <input type="password" name="password" [(ngModel)]="password" required minlength="8" autocomplete="new-password" />
            </label>
            <label>Confirm password
              <input type="password" name="confirmPassword" [(ngModel)]="confirmPassword" required autocomplete="new-password" />
            </label>
            @if (error()) { <p class="error">{{ error() }}</p> }
            <button type="submit" [disabled]="busy()">{{ busy() ? 'Finishing…' : 'Finish setup' }}</button>
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
    .error { color:#a23; margin:0; white-space:pre-wrap; }
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

  protected displayName = '';
  protected password = '';
  protected confirmPassword = '';

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
        // Already set up — drop them at the dashboard. If they aren't signed
        // in, the auth guard will bounce them to /login from there.
        this.router.navigateByUrl('/', { replaceUrl: true });
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
      await this.api.onboard(s.id, this.password, this.displayName.trim() || undefined);
      // Auto-sign-in so the user lands on the dashboard ready to go.
      await this.auth.login(s.email, this.password);
      this.router.navigateByUrl('/', { replaceUrl: true });
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
}
