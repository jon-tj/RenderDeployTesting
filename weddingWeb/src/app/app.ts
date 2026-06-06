import { Component, OnInit, inject, signal } from '@angular/core';
import { AdminToolsComponent } from './components/admin-tools/admin-tools.component';
import { AnnouncementsPanelComponent } from './components/announcements-panel.component';
import { EventsListComponent } from './components/events-list.component';
import { LanguageSelectorComponent } from './components/language-selector.component';
import { I18nService, Locale, SUPPORTED_LOCALES } from './services/i18n.service';
import { AnnouncementInfo, EventInfo, LoginResponse, PersonInfo, UserInfo, WeddingApiService } from './services/wedding-api.service';

@Component({
  selector: 'app-root',
  imports: [
    AnnouncementsPanelComponent,
    EventsListComponent,
    AdminToolsComponent,
    LanguageSelectorComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly api = inject(WeddingApiService);
  protected readonly i18n = inject(I18nService);

  protected readonly title = signal('Majori Wedding');
  protected readonly backendBaseUrl = this.api.backendBaseUrl;

  protected readonly name = signal(this.readNameFromUrl());
  protected readonly email = signal(this.readEmailFromUrl());
  protected readonly registrationEmail = signal('');
  protected readonly invitePat = signal(this.readInvitePatFromUrl());
  protected readonly verificationCode = signal('');
  protected readonly statusMessage = signal('');
  protected readonly authorized = signal(false);
  protected readonly adminTwoFactorPending = signal(false);
  protected readonly emailRegistrationPending = signal(false);
  protected readonly user = signal<UserInfo | null>(null);
  protected readonly events = signal<EventInfo[]>([]);
  protected readonly selectedAdminEvent = signal<EventInfo | null>(null);
  protected readonly announcements = signal<AnnouncementInfo[]>([]);
  protected readonly isWorking = signal(false);
  protected readonly viewAsAdmin = signal(false);
  protected readonly people = signal<PersonInfo[]>([]);

  ngOnInit() {
    this.applyLocaleFromUrl();
    if (this.shouldAutoLogin()) {
      void this.attemptLogin(true);
    }
  }

  private applyLocaleFromUrl() {
    const raw = new URLSearchParams(window.location.search).get('lang');
    if (!raw) {
      return;
    }
    const match = SUPPORTED_LOCALES.find(l => l.code.toLowerCase() === raw.toLowerCase());
    if (match) {
      this.i18n.setLocale(match.code as Locale);
    }
  }

  protected async attemptLogin(isAutoLogin = false) {
    const name = this.name().trim();
    const email = this.email().trim();
    const pat = this.invitePat().trim();

    if (!pat && name.length < 3) {
      this.statusMessage.set(this.i18n.t('auth.status.nameTooShort'));
      return;
    }

    if (!pat && !email) {
      this.statusMessage.set(this.i18n.t('auth.status.emailRequired'));
      return;
    }

    this.isWorking.set(true);
    this.statusMessage.set(this.i18n.t('auth.status.signingIn'));

    try {
      const payload = await this.api.login({
        name: name || undefined,
        email: email || undefined,
        pat: pat || undefined
      });

      if (!payload) {
        this.statusMessage.set(this.i18n.t('auth.status.serverError'));
        return;
      }

      if (payload.requiresTwoFactor) {
        this.beginTwoFactorChallenge();
        this.statusMessage.set(this.i18n.t('auth.status.twoFactorSent'));
        return;
      }

      if (payload.requiresEmailRegistration) {
        this.beginEmailRegistration();
        this.name.set(payload.pendingName ?? this.name());
        this.registrationEmail.set(email);
        this.statusMessage.set(this.i18n.t('auth.status.provideEmail'));
        return;
      }

      this.adminTwoFactorPending.set(false);
      this.emailRegistrationPending.set(false);

      if (!this.isAuthorizedPayload(payload)) {
        this.clearAuthorizedData();
        this.statusMessage.set(this.i18n.t(isAutoLogin ? 'auth.status.autoSignInFailed' : 'auth.status.accessDenied'));
        return;
      }

      this.applyAuthorizedPayload(payload);
    } catch {
      this.statusMessage.set(this.i18n.t('auth.status.networkError'));
    } finally {
      this.isWorking.set(false);
    }
  }

  protected async registerEmailAndLogin() {
    const pat = this.invitePat().trim();
    const name = this.name().trim();
    const email = this.registrationEmail().trim();

    if (!this.emailRegistrationPending()) {
      return;
    }

    if (!name || name.length < 3) {
      this.statusMessage.set(this.i18n.t('auth.status.nameRequired'));
      return;
    }

    if (!email) {
      this.statusMessage.set(this.i18n.t('auth.status.emailRequired'));
      return;
    }

    this.isWorking.set(true);
    this.statusMessage.set(this.i18n.t('auth.status.savingEmail'));

    try {
      const payload = await this.api.registerEmail({
        pat,
        name,
        email,
        inviteBaseUrl: this.inviteBaseUrl()
      });

      if (!payload) {
        this.statusMessage.set(this.i18n.t('auth.status.emailRegisterFailed'));
        return;
      }

      if (!this.isAuthorizedPayload(payload)) {
        this.statusMessage.set(this.i18n.t('auth.status.emailRegisterFailedVerify'));
        return;
      }

      this.emailRegistrationPending.set(false);
      this.registrationEmail.set('');
      this.applyAuthorizedPayload(payload);
    } catch {
      this.statusMessage.set(this.i18n.t('auth.status.networkError'));
    } finally {
      this.isWorking.set(false);
    }
  }

  protected async verifyAdminTwoFactor() {
    const name = this.name().trim();
    const email = this.email().trim();
    const code = this.verificationCode().trim();

    if (!this.adminTwoFactorPending()) {
      return;
    }

    if (!code) {
      this.statusMessage.set(this.i18n.t('auth.status.enterCode'));
      return;
    }

    this.isWorking.set(true);
    this.statusMessage.set(this.i18n.t('auth.status.verifyingCode'));

    try {
      const payload = await this.api.verifyAdminTwoFactor({ name, email, code });

      if (!payload) {
        this.statusMessage.set(this.i18n.t('auth.status.verifyServerError'));
        return;
      }

      if (!this.isAuthorizedPayload(payload)) {
        this.statusMessage.set(this.i18n.t('auth.status.invalidCode'));
        return;
      }

      this.adminTwoFactorPending.set(false);
      this.verificationCode.set('');
      this.applyAuthorizedPayload(payload);
    } catch {
      this.statusMessage.set(this.i18n.t('auth.status.networkError'));
    } finally {
      this.isWorking.set(false);
    }
  }

  protected cancelTwoFactor() {
    this.adminTwoFactorPending.set(false);
    this.verificationCode.set('');
    this.statusMessage.set(this.i18n.t('auth.status.twoFactorCanceled'));
  }

  protected onUserUpdated(updated: UserInfo) {
    const user = this.user();
    if (!user) {
      return;
    }

    this.user.set({
      ...user,
      ...updated
    });
  }

  protected unreadAnnouncementCount() {
    const user = this.user();
    if (!user) {
      return 0;
    }

    return this.announcements().filter(a => a.id > user.lastAnnouncementSeen).length;
  }

  protected onAnnouncementsUpdated(announcements: AnnouncementInfo[]) {
    this.announcements.set(announcements);
  }

  protected onEventsUpdated(updatedEvents: EventInfo[]) {
    this.events.set(updatedEvents);

    const selected = this.selectedAdminEvent();
    if (!selected) {
      this.selectedAdminEvent.set(updatedEvents[0] ?? null);
      return;
    }

    const matching = updatedEvents.find(event => event.place === selected.place);
    this.selectedAdminEvent.set(matching ?? updatedEvents[0] ?? null);
  }

  protected onSelectedEventChanged(event: EventInfo | null) {
    this.selectedAdminEvent.set(event);
  }

  protected onStatusMessage(message: string) {
    this.statusMessage.set(message);
  }

  protected isAdminView() {
    const user = this.user();
    return !!user?.admin && this.viewAsAdmin();
  }

  private inviteBaseUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  private applyAuthorizedPayload(payload: LoginResponse) {
    if (!this.isAuthorizedPayload(payload)) {
      this.authorized.set(false);
      return;
    }

    const user = payload.user;
    const events = payload.events;
    const announcements = payload.announcements ?? [];
    const people = payload.people ?? [];
    this.authorized.set(true);
    this.user.set(user);
    this.events.set(events);
    this.selectedAdminEvent.set(events[0] ?? null);
    this.announcements.set(announcements);
    this.people.set(people);
    this.viewAsAdmin.set(user.admin);
    this.invitePat.set('');
    this.statusMessage.set(`Welcome ${user.displayName}!`);
  }

  private beginTwoFactorChallenge() {
    this.clearAuthorizedData();
    this.adminTwoFactorPending.set(true);
    this.emailRegistrationPending.set(false);
    this.verificationCode.set('');
  }

  private beginEmailRegistration() {
    this.clearAuthorizedData();
    this.adminTwoFactorPending.set(false);
    this.emailRegistrationPending.set(true);
  }

  private clearAuthorizedData() {
    this.authorized.set(false);
    this.user.set(null);
    this.events.set([]);
    this.selectedAdminEvent.set(null);
    this.announcements.set([]);
    this.people.set([]);
  }

  private isAuthorizedPayload(payload: LoginResponse): payload is LoginResponse & { user: UserInfo; events: EventInfo[] } {
    return !!(payload.authorized && payload.user && payload.events && payload.events.length > 0);
  }

  private readNameFromUrl() {
    const name = new URLSearchParams(window.location.search).get('name');
    return name ?? '';
  }

  private readEmailFromUrl() {
    const email = new URLSearchParams(window.location.search).get('email');
    return email ?? '';
  }

  private readInvitePatFromUrl() {
    const pat = new URLSearchParams(window.location.search).get('pat');
    return pat ?? '';
  }

  private shouldAutoLogin() {
    const hasPat = this.invitePat().trim().length > 0;
    const hasNameAndEmail = this.name().trim().length >= 3 && this.email().trim().length > 0;
    return hasPat || hasNameAndEmail;
  }
}
