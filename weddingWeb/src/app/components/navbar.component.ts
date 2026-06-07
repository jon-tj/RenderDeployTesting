import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  template: `
    <nav class="navbar">
      <a class="brand" routerLink="/">Family Hub</a>
      <div class="spacer"></div>
      @if (auth.me(); as me) {
        <a class="who" routerLink="/settings" title="Account settings">{{ me.displayName || me.email }}</a>
      }
      @if (showLogout()) {
        <button type="button" class="ghost" (click)="logout()">Log out</button>
      }
    </nav>
  `,
  styles: [`
    .navbar { display:flex; align-items:center; gap:1rem; padding:.75rem 1.25rem; background:#fff; border-bottom:1px solid #e6e1d4; }
    .brand { font-weight:600; font-size:1.1rem; text-decoration:none; color:#2d2a24; }
    .spacer { flex:1; }
    .who { color:#5a5347; text-decoration:none; border-bottom:1px dotted transparent; }
    .who:hover { color:#2d2a24; border-bottom-color:#c9b88a; }
    .ghost { background:transparent; border:1px solid #c9b88a; padding:.4rem .8rem; border-radius:.4rem; cursor:pointer; font:inherit; }
    .ghost:hover { background:#f1e0c2; }
  `],
})
export class NavbarComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  // Show the button as soon as there's any session evidence (token or loaded
  // user), so a slow /api/me round-trip can't hide the only way out.
  protected readonly showLogout = computed(
    () => this.auth.me() !== null || this.auth.getAccessToken() !== null
  );

  logout(): void {
    this.auth.logout();
  }
}

