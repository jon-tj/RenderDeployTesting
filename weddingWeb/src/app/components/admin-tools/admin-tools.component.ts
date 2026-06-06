import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject, signal } from '@angular/core';
import { I18nService } from '../../services/i18n.service';
import {
  AnnouncementInfo,
  EventInfo,
  InviteRow,
  PersonInfo,
  UserInfo,
  WeddingApiService
} from '../../services/wedding-api.service';
import { AdminAllergyReportComponent } from '../admin-allergy-report.component';
import { AdminAnnouncementToolComponent } from '../admin-announcement-tool.component';

interface InviteRowState extends InviteRow {
  draftFullName: string;
  draftDisplayName: string;
  draftEmail: string;
  saving: boolean;
}

type AdminTab = 'people' | 'announcements' | 'meals';

@Component({
  selector: 'app-admin-tools',
  standalone: true,
  imports: [AdminAnnouncementToolComponent, AdminAllergyReportComponent],
  templateUrl: './admin-tools.component.html',
  styleUrl: './admin-tools.component.css'
})
export class AdminToolsComponent implements OnInit, OnChanges {
  @Input({ required: true }) user!: UserInfo;
  @Input() events: EventInfo[] = [];
  @Input() selectedEvent: EventInfo | null = null;
  @Input() announcements: AnnouncementInfo[] = [];
  @Input() people: PersonInfo[] = [];
  @Input() backendBaseUrl = '';

  @Output() statusMessage = new EventEmitter<string>();
  @Output() announcementsUpdated = new EventEmitter<AnnouncementInfo[]>();

  private readonly api = inject(WeddingApiService);
  private readonly i18n = inject(I18nService);

  protected readonly adminTab = signal<AdminTab>('people');
  protected readonly invites = signal<InviteRowState[]>([]);
  protected readonly patLoginEnabled = signal(false);
  protected readonly invitesLoading = signal(false);
  protected readonly addingInvite = signal(false);
  protected readonly goingLive = signal(false);
  protected readonly resendingUninitialized = signal(false);
  protected readonly rsvpFilter = signal<string | null>(null);
  protected readonly caughtUpFilter = signal<'any' | 'updated' | 'outdated'>('any');

  ngOnInit() {
    void this.refreshInvites();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['user'] && !changes['user'].firstChange) {
      void this.refreshInvites();
    }
  }

  protected setAdminTab(tab: AdminTab) {
    this.adminTab.set(tab);
  }

  protected onStatusMessage(message: string) {
    this.statusMessage.emit(message);
  }

  protected onAnnouncementsUpdated(items: AnnouncementInfo[]) {
    this.announcementsUpdated.emit(items);
  }

  // ----- People filtering helpers -----

  protected rsvpDistribution(): Array<{ status: string; count: number }> {
    const event = this.selectedEvent;
    if (!event) {
      return [];
    }

    const allowedNames = this.allowedPeopleSet();

    const counts = new Map<string, number>();
    for (const [fullName, status] of Object.entries(event.rsvp)) {
      if (allowedNames !== null && !allowedNames.has(fullName)) {
        continue;
      }
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }

    const order = ['yes', 'maybe', 'no'];
    return Array.from(counts.entries())
      .sort(([a], [b]) => {
        const ai = order.indexOf(a);
        const bi = order.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
      .map(([status, count]) => ({ status, count }));
  }

  protected rsvpTotal(): number {
    const event = this.selectedEvent;
    if (!event) {
      return 0;
    }
    const allowedNames = this.allowedPeopleSet();
    if (allowedNames === null) {
      return Object.keys(event.rsvp).length;
    }
    return Object.keys(event.rsvp).filter(name => allowedNames.has(name)).length;
  }

  protected rsvpDistributionMax(): number {
    return this.rsvpDistribution().reduce((m, b) => Math.max(m, b.count), 0);
  }

  protected toggleRsvpFilter(status: string) {
    this.rsvpFilter.update(current => (current === status ? null : status));
  }

  protected clearRsvpFilter() {
    this.rsvpFilter.set(null);
  }

  protected setCaughtUpFilter(value: 'any' | 'updated' | 'outdated') {
    this.caughtUpFilter.set(value);
  }

  protected latestAnnouncementId(): number {
    const list = this.announcements;
    if (list.length === 0) {
      return -1;
    }
    return Math.max(...list.map(a => a.id));
  }

  protected isPersonOutdated(fullName: string): boolean {
    const latestId = this.latestAnnouncementId();
    if (latestId < 0) {
      return false;
    }
    const person = this.people.find(p =>
      p.fullName.localeCompare(fullName, undefined, { sensitivity: 'accent' }) === 0
    );
    if (!person) {
      return true;
    }
    return person.lastAnnouncementSeen < latestId;
  }

  protected updatedCount(): number {
    return this.people.filter(p => !this.isPersonOutdated(p.fullName)).length;
  }

  protected outdatedCount(): number {
    return this.people.filter(p => this.isPersonOutdated(p.fullName)).length;
  }

  private allowedPeopleSet(): Set<string> | null {
    const filter = this.caughtUpFilter();
    if (filter === 'any') {
      return null;
    }
    const wantOutdated = filter === 'outdated';
    const set = new Set<string>();
    for (const person of this.people) {
      if (this.isPersonOutdated(person.fullName) === wantOutdated) {
        set.add(person.fullName);
      }
    }
    return set;
  }

  // ----- Invites / People combined table -----

  protected inviteEntries(): Array<{
    row: InviteRowState;
    rsvp: string;
    outdated: boolean;
  }> {
    const event = this.selectedEvent;
    const latestId = this.latestAnnouncementId();
    const rsvpFilter = this.rsvpFilter();
    const caughtUpFilter = this.caughtUpFilter();

    return this.invites()
      .map(row => {
        const rsvp = event?.rsvp[row.fullName] ?? '';
        const outdated = latestId >= 0 && row.lastAnnouncementSeen < latestId;
        return { row, rsvp, outdated };
      })
      .filter(entry => {
        if (rsvpFilter) {
          const status = entry.rsvp || '-';
          if (status !== rsvpFilter) return false;
        }
        if (caughtUpFilter === 'updated' && entry.outdated) return false;
        if (caughtUpFilter === 'outdated' && !entry.outdated) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.row.admin !== b.row.admin) return a.row.admin ? -1 : 1;
        const aEmpty = a.row.fullName.trim() === '';
        const bEmpty = b.row.fullName.trim() === '';
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        return a.row.fullName.localeCompare(b.row.fullName);
      });
  }

  protected isInviteDirty(row: InviteRowState): boolean {
    return row.draftFullName !== row.fullName
      || row.draftDisplayName !== row.displayName
      || row.draftEmail !== row.email;
  }

  protected async refreshInvites() {
    if (!this.user?.admin) return;
    this.invitesLoading.set(true);
    try {
      const result = await this.api.listInvites(this.user.fullName);
      if (!result) {
        this.statusMessage.emit('Could not load invites.');
        return;
      }
      this.invites.set(result.invites.map(i => this.toInviteState(i)));
      this.patLoginEnabled.set(result.patLoginEnabled);
    } catch {
      this.statusMessage.emit(this.i18n.t('auth.status.networkError'));
    } finally {
      this.invitesLoading.set(false);
    }
  }

  protected async addInviteRow() {
    if (!this.user?.admin) return;
    this.addingInvite.set(true);
    try {
      const created = await this.api.createInvite({ adminFullName: this.user.fullName });
      if (!created) {
        this.statusMessage.emit('Could not add invite row.');
        return;
      }
      this.invites.update(list => [...list, this.toInviteState(created)]);
      this.statusMessage.emit('Invite row added.');
    } catch {
      this.statusMessage.emit(this.i18n.t('auth.status.networkError'));
    } finally {
      this.addingInvite.set(false);
    }
  }

  protected async saveInviteRow(row: InviteRowState) {
    if (!this.user?.admin) return;
    row.saving = true;
    try {
      const updated = await this.api.updateInvite(row.pat, {
        adminFullName: this.user.fullName,
        fullName: row.draftFullName.trim(),
        displayName: row.draftDisplayName.trim(),
        email: row.draftEmail.trim()
      });
      if (!updated) {
        this.statusMessage.emit('Could not save invite.');
        return;
      }
      this.invites.update(list => list.map(r => r.pat === row.pat ? this.toInviteState(updated) : r));
      this.statusMessage.emit('Invite saved.');
    } catch {
      this.statusMessage.emit(this.i18n.t('auth.status.networkError'));
    } finally {
      row.saving = false;
    }
  }

  protected async deleteInviteRow(row: InviteRowState) {
    if (!this.user?.admin) return;
    if (row.admin) return;
    const label = row.fullName.trim() || row.draftFullName.trim() || 'this invite';
    if (!confirm(`Delete ${label}?`)) return;
    row.saving = true;
    try {
      const ok = await this.api.deleteInvite(row.pat, this.user.fullName);
      if (!ok) {
        this.statusMessage.emit('Could not delete invite.');
        return;
      }
      this.invites.update(list => list.filter(r => r.pat !== row.pat));
      this.statusMessage.emit('Invite deleted.');
    } catch {
      this.statusMessage.emit(this.i18n.t('auth.status.networkError'));
    } finally {
      row.saving = false;
    }
  }

  protected async copyInviteLink(row: InviteRowState) {
    const baseUrl = this.inviteBaseUrl().replace(/\/$/, '');
    const name = (row.fullName || row.draftFullName).trim();
    const encodedName = name.split(/\s+/).filter(Boolean).map(encodeURIComponent).join('+');
    const link = `${baseUrl}?name=${encodedName}&pat=${encodeURIComponent(row.pat)}`;
    try {
      await navigator.clipboard.writeText(link);
      this.statusMessage.emit('Invite link copied.');
    } catch {
      this.statusMessage.emit('Could not copy link.');
    }
  }

  protected async goLive() {
    if (!this.user?.admin) return;
    const message = this.patLoginEnabled()
      ? 'Resend invitation emails to everyone with an email address?'
      : 'Enable PAT login and send invitation emails to everyone with an email address?';
    if (!confirm(message)) return;
    this.goingLive.set(true);
    try {
      const result = await this.api.goLive({
        adminFullName: this.user.fullName,
        inviteBaseUrl: this.inviteBaseUrl()
      });
      if (!result) {
        this.statusMessage.emit('Go-live failed.');
        return;
      }
      this.patLoginEnabled.set(result.patLoginEnabled);
      this.statusMessage.emit(`Live. Sent ${result.emailsSent} email(s); skipped ${result.skippedWithoutEmail} without email.`);
    } catch {
      this.statusMessage.emit(this.i18n.t('auth.status.networkError'));
    } finally {
      this.goingLive.set(false);
    }
  }

  protected uninitializedCount(): number {
    return this.invites().filter(r => !r.admin && r.lastVersionSeen < 0 && r.email.trim() !== '').length;
  }

  protected async resendUninitialized() {
    if (!this.user?.admin) return;
    const count = this.uninitializedCount();
    if (count === 0) {
      this.statusMessage.emit('No uninitialized users with an email.');
      return;
    }
    if (!confirm(`Resend invitation emails to ${count} uninitialized user(s)?`)) return;
    this.resendingUninitialized.set(true);
    try {
      const result = await this.api.resendUninitialized({
        adminFullName: this.user.fullName,
        inviteBaseUrl: this.inviteBaseUrl()
      });
      if (!result) {
        this.statusMessage.emit('Resend failed.');
        return;
      }
      this.statusMessage.emit(`Sent ${result.emailsSent} email(s); skipped ${result.skippedWithoutEmail} without email.`);
    } catch {
      this.statusMessage.emit(this.i18n.t('auth.status.networkError'));
    } finally {
      this.resendingUninitialized.set(false);
    }
  }

  private toInviteState(row: InviteRow): InviteRowState {
    return {
      ...row,
      draftFullName: row.fullName,
      draftDisplayName: row.displayName,
      draftEmail: row.email,
      saving: false
    };
  }

  private inviteBaseUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }
}
