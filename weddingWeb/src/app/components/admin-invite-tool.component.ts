import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { InviteRow, WeddingApiService } from '../services/wedding-api.service';
import { SUPPORTED_LOCALES } from '../services/i18n.service';

interface InviteRowState extends InviteRow {
  draftFullName: string;
  draftDisplayName: string;
  draftEmail: string;
  draftLocale: string;
  saving: boolean;
}

@Component({
  selector: 'app-admin-invite-tool',
  standalone: true,
  template: `
    <article class="admin-tool">
      <h3 class="tool-title">Invitations</h3>
      <p class="tool-help">Manage guest invites. Edits save per row. Emails are sent only when you go live.</p>

      <div class="invites-status">
        <span class="invites-status-label">PAT login:</span>
        <span class="invites-status-value" [class.live]="patLoginEnabled()">
          {{ patLoginEnabled() ? 'Enabled (live)' : 'Disabled' }}
        </span>
      </div>

      @if (loading()) {
        <p class="help">Loading invites…</p>
      } @else if (rows().length === 0) {
        <p class="help">No invites yet. Add one below.</p>
      } @else {
        <div class="invites-table-wrapper">
          <table class="invites-table">
            <thead>
              <tr>
                <th>Full name</th>
                <th>Display name</th>
                <th>Email</th>
                <th>Lang</th>
                <th class="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.pat) {
                <tr [class.dirty]="isDirty(row)">
                  <td>
                    <input
                      type="text"
                      [value]="row.draftFullName"
                      (input)="row.draftFullName = $any($event.target).value"
                      placeholder="Full Name"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      [value]="row.draftDisplayName"
                      (input)="row.draftDisplayName = $any($event.target).value"
                      placeholder="Display Name"
                    />
                  </td>
                  <td>
                    <input
                      type="email"
                      [value]="row.draftEmail"
                      (input)="row.draftEmail = $any($event.target).value"
                      placeholder="email@example.com"
                    />
                  </td>
                  <td>
                    <select
                      [value]="row.draftLocale"
                      (change)="row.draftLocale = $any($event.target).value"
                      title="Email + login language"
                    >
                      <option value="">Auto</option>
                      @for (l of locales; track l.code) {
                        <option [value]="l.code">{{ l.flag }} {{ l.code }}</option>
                      }
                    </select>
                  </td>
                  <td class="actions-col">
                    <button
                      type="button"
                      class="icon-btn"
                      (click)="saveRow(row)"
                      [disabled]="!isDirty(row) || row.saving"
                      title="Save"
                      aria-label="Save"
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                          d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <button type="button" class="icon-btn" (click)="copyLink(row)" title="Copy invite link" aria-label="Copy invite link">
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                          d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07L11 6M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07L13 18" />
                      </svg>
                    </button>
                    <button type="button" class="icon-btn danger" (click)="deleteRow(row)" [disabled]="row.saving" title="Delete" aria-label="Delete">
                      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                          d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6h12zM10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <div class="actions-row">
        <button type="button" class="secondary" (click)="addRow()" [disabled]="adding()">+ Add invite</button>
      </div>

      <hr class="invites-divider" />

      <div class="actions-row go-live-row">
        <button type="button" class="primary" (click)="goLive()" [disabled]="goingLive() || rows().length === 0">
          {{ patLoginEnabled() ? 'Resend invitation emails' : 'Go live & send emails' }}
        </button>
        <p class="help go-live-help">
          @if (patLoginEnabled()) {
            PAT login is enabled. Clicking will re-send invitation emails to everyone with an email.
          } @else {
            Enables PAT login and emails everyone with an email address.
          }
        </p>
      </div>
    </article>
  `,
  styles: [
    `
      :host { display: block; }
      .invites-status {
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
        margin: 0.5rem 0 1rem;
        font-size: 0.95rem;
      }
      .invites-status-value {
        font-weight: 600;
        color: #b06000;
      }
      .invites-status-value.live {
        color: #2e7d32;
      }
      .invites-table-wrapper {
        overflow-x: auto;
        margin: 0.5rem 0 1rem;
      }
      .invites-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
      }
      .invites-table th,
      .invites-table td {
        padding: 0.4rem 0.5rem;
        text-align: left;
        vertical-align: middle;
        border-bottom: 1px solid var(--rule, #e3dccd);
      }
      .invites-table th { font-weight: 600; }
      .invites-table input {
        width: 100%;
        padding: 0.35rem 0.5rem;
        box-sizing: border-box;
      }
      .invites-table tr.dirty td input {
        background: #fff8e1;
      }
      .invites-table .actions-col {
        white-space: nowrap;
        text-align: right;
      }
      .invites-table .actions-col .icon-btn {
        margin-left: 0.25rem;
      }
      .icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        padding: 0;
        border: 1px solid var(--rule, #e3dccd);
        background: var(--bg-cream-soft, #f6efe4);
        border-radius: 4px;
        cursor: pointer;
        color: inherit;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }
      .icon-btn:hover:not(:disabled) {
        background: var(--bg-cream, #efe4d0);
      }
      .icon-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .icon-btn.danger {
        color: #b00020;
      }
      .icon-btn.danger:hover:not(:disabled) {
        background: #fdecea;
        border-color: #b00020;
      }
      .invites-divider {
        border: none;
        border-top: 1px solid var(--rule, #e3dccd);
        margin: 1.25rem 0 1rem;
      }
      .go-live-row { flex-direction: column; align-items: flex-start; gap: 0.4rem; }
      .go-live-help { margin: 0; }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminInviteToolComponent implements OnInit {
  @Input() adminFullName = '';
  @Input() backendBaseUrl = '';

  @Output() statusMessage = new EventEmitter<string>();

  private readonly api = inject(WeddingApiService);

  protected readonly locales = SUPPORTED_LOCALES;
  protected readonly rows = signal<InviteRowState[]>([]);
  protected readonly patLoginEnabled = signal(false);
  protected readonly loading = signal(false);
  protected readonly adding = signal(false);
  protected readonly goingLive = signal(false);

  ngOnInit() {
    void this.refresh();
  }

  protected isDirty(row: InviteRowState): boolean {
    return row.draftFullName !== row.fullName
      || row.draftDisplayName !== row.displayName
      || row.draftEmail !== row.email
      || row.draftLocale !== row.locale;
  }

  protected async refresh() {
    if (!this.adminFullName) {
      return;
    }
    this.loading.set(true);
    try {
      const result = await this.api.listInvites(this.adminFullName);
      if (!result) {
        this.statusMessage.emit('Could not load invites.');
        return;
      }
      this.rows.set(result.invites.map(i => this.toState(i)));
      this.patLoginEnabled.set(result.patLoginEnabled);
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async addRow() {
    if (!this.adminFullName) {
      return;
    }
    this.adding.set(true);
    try {
      const created = await this.api.createInvite({ adminFullName: this.adminFullName });
      if (!created) {
        this.statusMessage.emit('Could not add invite row.');
        return;
      }
      this.rows.update(list => [...list, this.toState(created)]);
      this.statusMessage.emit('Invite row added.');
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
    } finally {
      this.adding.set(false);
    }
  }

  protected async saveRow(row: InviteRowState) {
    row.saving = true;
    try {
      const updated = await this.api.updateInvite(row.pat, {
        adminFullName: this.adminFullName,
        fullName: row.draftFullName.trim(),
        displayName: row.draftDisplayName.trim(),
        email: row.draftEmail.trim(),
        locale: row.draftLocale
      });
      if (!updated) {
        this.statusMessage.emit('Could not save invite.');
        return;
      }
      this.rows.update(list => list.map(r => r.pat === row.pat ? this.toState(updated) : r));
      this.statusMessage.emit('Invite saved.');
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
    } finally {
      row.saving = false;
    }
  }

  protected async deleteRow(row: InviteRowState) {
    const label = row.fullName || row.draftFullName || '(unnamed)';
    if (!confirm(`Delete invite for ${label}?`)) {
      return;
    }
    row.saving = true;
    try {
      const ok = await this.api.deleteInvite(row.pat, this.adminFullName);
      if (!ok) {
        this.statusMessage.emit('Could not delete invite.');
        row.saving = false;
        return;
      }
      this.rows.update(list => list.filter(r => r.pat !== row.pat));
      this.statusMessage.emit('Invite deleted.');
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
      row.saving = false;
    }
  }

  protected async copyLink(row: InviteRowState) {
    const link = this.buildInviteLink(row);
    try {
      await navigator.clipboard.writeText(link);
      this.statusMessage.emit('Invite link copied.');
    } catch {
      this.statusMessage.emit('Could not copy link.');
    }
  }

  protected async goLive() {
    if (!this.adminFullName) {
      return;
    }
    const message = this.patLoginEnabled()
      ? 'Resend invitation emails to everyone with an email address?'
      : 'Enable PAT login and send invitation emails to everyone with an email address?';
    if (!confirm(message)) {
      return;
    }
    this.goingLive.set(true);
    try {
      const result = await this.api.goLive({
        adminFullName: this.adminFullName,
        inviteBaseUrl: this.inviteBaseUrl()
      });
      if (!result) {
        this.statusMessage.emit('Go-live failed.');
        return;
      }
      this.patLoginEnabled.set(result.patLoginEnabled);
      this.statusMessage.emit(`Live. Sent ${result.emailsSent} email(s); skipped ${result.skippedWithoutEmail} without email.`);
    } catch {
      this.statusMessage.emit('Unable to reach the backend API.');
    } finally {
      this.goingLive.set(false);
    }
  }

  private toState(row: InviteRow): InviteRowState {
    return {
      ...row,
      locale: row.locale ?? '',
      draftFullName: row.fullName,
      draftDisplayName: row.displayName,
      draftEmail: row.email,
      draftLocale: row.locale ?? '',
      saving: false
    };
  }

  private buildInviteLink(row: InviteRowState): string {
    const baseUrl = this.inviteBaseUrl().replace(/\/$/, '');
    const name = (row.fullName || row.draftFullName).trim();
    const encodedName = name
      .split(/\s+/)
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('+');
    const locale = (row.locale || row.draftLocale || '').trim();
    const langPart = locale ? `&lang=${encodeURIComponent(locale)}` : '';
    return `${baseUrl}?name=${encodedName}&pat=${encodeURIComponent(row.pat)}${langPart}`;
  }

  private inviteBaseUrl(): string {
    return `${window.location.origin}${window.location.pathname}`;
  }
}
