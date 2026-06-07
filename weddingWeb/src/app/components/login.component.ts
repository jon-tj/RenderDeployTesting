import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <div class="auth-page">
      <form class="card" (ngSubmit)="submit()">
        <h1>Sign in</h1>
        <label>Email
          <input type="email" name="email" [(ngModel)]="email" required autocomplete="email" />
        </label>
        <label>Password
          <input type="password" name="password" [(ngModel)]="password" required autocomplete="current-password" />
        </label>
        @if (error()) { <p class="error">{{ error() }}</p> }
        <button type="submit" [disabled]="busy()">{{ busy() ? 'Signing in…' : 'Sign in' }}</button>
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
    .error { color:#a23; margin:0; }
  `],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  async submit(): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      await this.auth.login(this.email.trim(), this.password);
      this.router.navigate(['/']);
    } catch (e: any) {
      this.error.set(e?.error?.detail ?? 'Sign in failed.');
    } finally {
      this.busy.set(false);
    }
  }
}
