import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-page">
      <form class="card" (ngSubmit)="submit()">
        <h1>Create account</h1>
        <label>Name
          <input name="name" [(ngModel)]="displayName" required autocomplete="name" />
        </label>
        <label>Email
          <input type="email" name="email" [(ngModel)]="email" required autocomplete="email" />
        </label>
        <label>Password
          <input type="password" name="password" [(ngModel)]="password" required minlength="8" autocomplete="new-password" />
        </label>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button type="submit" [disabled]="busy()">{{ busy() ? 'Creating…' : 'Create account' }}</button>
        <p class="alt">Already have an account? <a routerLink="/login">Sign in</a></p>
      </form>
    </div>
  `,
  styles: [`
    .auth-page { min-height:100vh; display:grid; place-items:center; background:#faf7f0; padding:1rem; }
    .card { display:flex; flex-direction:column; gap:.9rem; width:100%; max-width:360px; padding:1.5rem; background:#fff; border:1px solid #e6e1d4; border-radius:.6rem; }
    h1 { margin:0 0 .25rem; }
    label { display:flex; flex-direction:column; gap:.3rem; font-size:.9rem; color:#5a5347; }
    input { padding:.55rem .7rem; border:1px solid #d8cfb8; border-radius:.4rem; font:inherit; }
    button { padding:.6rem; background:#6f7a5b; color:#faf5ea; border:0; border-radius:.4rem; cursor:pointer; font-weight:600; }
    button[disabled] { opacity:.6; cursor:wait; }
    .error { color:#a23; margin:0; white-space:pre-wrap; }
    .alt { margin:.5rem 0 0; text-align:center; font-size:.9rem; }
  `],
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected displayName = '';
  protected email = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  async submit(): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.auth.register(this.email.trim(), this.password, this.displayName.trim());
      this.router.navigate(['/']);
    } catch (e: any) {
      this.error.set(this.formatError(e));
    } finally {
      this.busy.set(false);
    }
  }

  private formatError(e: any): string {
    const errs = e?.error?.errors;
    if (errs && typeof errs === 'object') {
      return Object.values(errs).flat().join('\n');
    }
    return e?.error?.detail ?? 'Could not create the account.';
  }
}
