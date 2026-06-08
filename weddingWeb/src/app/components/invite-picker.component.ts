import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HubApi } from '../services/hub-api.service';
import { DEFAULT_LANGUAGE, LANGUAGES, LanguageCode, UserSummary } from '../models';
import { extractHttpError } from '../utils/http-error';

@Component({
  selector: 'app-invite-picker',
  imports: [FormsModule],
  template: `
    <div class="picker">
      <input
        type="search"
        placeholder="Search name or email…"
        [(ngModel)]="query"
        name="q"
        (input)="onQueryChanged()"
      />
      @if (results().length) {
        <ul class="results">
          @for (u of results(); track u.id) {
            <li>
              <button type="button" class="pick" (click)="pick(u)">
                <strong>{{ u.displayName || u.email }}</strong>
                <span class="muted"> · {{ u.email }}</span>
              </button>
            </li>
          }
        </ul>
      } @else if (searched()) {
        <div class="create">
          <p class="muted">No match. Invite a new person by email:</p>
          <div class="row">
            <input
              type="email"
              placeholder="email@example.com"
              [(ngModel)]="newEmail"
              name="email"
            />
            <input
              placeholder="Name (optional)"
              [(ngModel)]="newName"
              name="name"
            />
            <select name="newLang" [(ngModel)]="newLanguage" title="Preferred language">
              @for (l of languages; track l.code) {
                <option [value]="l.code">{{ l.label }}</option>
              }
            </select>
            <button type="button" (click)="createAndPick()" [disabled]="busy()">
              {{ busy() ? 'Adding…' : 'Invite' }}
            </button>
          </div>
          @if (error()) { <p class="error">{{ error() }}</p> }
        </div>
      }

      @if (lastInviteLink(); as link) {
        <div class="link">
          <p class="muted">Onboarding link for the new invitee — share it with them:</p>
          <div class="row link-row">
            <input readonly [value]="link" (focus)="$any($event.target).select()" />
            <button type="button" (click)="copyLink(link)">{{ copied() ? 'Copied' : 'Copy' }}</button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .picker { display:flex; flex-direction:column; gap:.5rem; }
    ul.results { list-style:none; margin:0; padding:.25rem; display:flex; flex-direction:column; gap:.15rem; background:var(--bg); border-radius:var(--r); }
    button.pick { display:block; width:100%; text-align:left; padding:.4rem .55rem; background:transparent; border:0; border-radius:.3rem; cursor:pointer; font:inherit; }
    button.pick:hover { background:var(--accent-soft); }
    .create, .link { background:var(--bg); padding:.6rem .75rem; border-radius:var(--r); display:flex; flex-direction:column; gap:.5rem; }
    .row { display:grid; grid-template-columns:1fr 1fr auto auto; gap:.5rem; }
    .row.link-row { grid-template-columns:1fr auto; }
    .row button { padding:.5rem .8rem; background:var(--accent); color:var(--accent-ink); border:0; border-radius:var(--r); cursor:pointer; font:inherit; }
    .row button[disabled] { opacity:.6; cursor:wait; }
  `],
})
export class InvitePickerComponent {
  private readonly api = inject(HubApi);
  readonly picked = output<UserSummary>();

  // Optional path the onboarding link should redirect to after the invitee
  // finishes signup, e.g. "/event/42/edit".
  readonly nextPath = input<string | null>(null);

  protected query = '';
  protected newEmail = '';
  protected newName = '';
  protected newLanguage: LanguageCode = DEFAULT_LANGUAGE;
  protected readonly languages = LANGUAGES;
  protected readonly results = signal<UserSummary[]>([]);
  protected readonly searched = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly lastInviteLink = signal<string | null>(null);
  protected readonly copied = signal(false);

  private debounce: ReturnType<typeof setTimeout> | null = null;

  onQueryChanged(): void {
    if (this.debounce) clearTimeout(this.debounce);
    const q = this.query.trim();
    if (q.length < 2) {
      this.results.set([]);
      this.searched.set(false);
      return;
    }
    this.debounce = setTimeout(async () => {
      try {
        const r = await this.api.searchUsers(q);
        this.results.set(r);
        this.searched.set(true);
        if (!this.newEmail && q.includes('@')) this.newEmail = q;
      } catch {
        this.results.set([]);
      }
    }, 250);
  }

  pick(u: UserSummary): void {
    this.picked.emit(u);
    this.reset();
  }

  async createAndPick(): Promise<void> {
    this.error.set('');
    const email = this.newEmail.trim();
    if (!email) {
      this.error.set('Email required.');
      return;
    }
    this.busy.set(true);
    try {
      const user = await this.api.createInviteStub(email, this.newName.trim() || undefined, this.newLanguage);
      this.picked.emit(user);
      this.lastInviteLink.set(this.buildOnboardingLink(user.id));
      this.copied.set(false);
      this.query = '';
      this.newEmail = '';
      this.newName = '';
      this.results.set([]);
      this.searched.set(false);
    } catch (e: unknown) {
      this.error.set(extractHttpError(e) ?? 'Could not invite.');
    } finally {
      this.busy.set(false);
    }
  }

  private buildOnboardingLink(userId: string): string {
    const base = `${window.location.origin}/onboarding/${encodeURIComponent(userId)}`;
    const next = this.nextPath();
    return next ? `${base}?next=${encodeURIComponent(next)}` : base;
  }

  async copyLink(link: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  private reset(): void {
    this.query = '';
    this.newEmail = '';
    this.newName = '';
    this.results.set([]);
    this.searched.set(false);
  }
}
