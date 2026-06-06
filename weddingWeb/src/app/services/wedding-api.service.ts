import { Injectable } from '@angular/core';

export interface EventChoice {
  meal: string;
  drink: string;
}

export interface UserInfo {
  fullName: string;
  displayName: string;
  email: string;
  admin: boolean;
  addedToCalendar: boolean;
  lastVersionSeen: number;
  lastAnnouncementSeen: number;
  allergies: string[];
  eventChoices: Record<string, EventChoice>;
}

export interface EventInfo {
  place: string;
  venueName: string;
  mapQuery: string;
  time: string;
  dressCode: string;
  currency: string;
  mealOptions: MealOption[];
  rsvp: Record<string, string>;
}

export interface MealOption {
  type: string;
  name: string;
  price: number;
}

export interface AnnouncementInfo {
  id: number;
  title: string;
  message: string;
  createdAt: string;
  createdBy: string;
}

export interface PersonInfo {
  fullName: string;
  lastAnnouncementSeen: number;
}

export interface LoginResponse {
  authorized: boolean;
  user: UserInfo | null;
  events: EventInfo[] | null;
  announcements: AnnouncementInfo[] | null;
  requiresTwoFactor: boolean;
  requiresEmailRegistration: boolean;
  pendingName: string | null;
  people: PersonInfo[] | null;
  adminSessionToken: string | null;
}

export interface InviteRow {
  pat: string;
  fullName: string;
  displayName: string;
  email: string;
  admin: boolean;
  lastAnnouncementSeen: number;
  lastVersionSeen: number;
  locale: string;
}

export interface InviteListResponse {
  invites: InviteRow[];
  patLoginEnabled: boolean;
}

export interface GoLiveResponse {
  patLoginEnabled: boolean;
  emailsSent: number;
  skippedWithoutEmail: number;
}

@Injectable({
  providedIn: 'root'
})
export class WeddingApiService {
  // In dev (ng serve on :4200) talk to the ASP.NET dev server; in prod the
  // Angular app is served by the same ASP.NET process, so use a relative path.
  readonly backendBaseUrl =
    typeof window !== 'undefined' && window.location.hostname === 'localhost' && window.location.port === '4200'
      ? 'http://localhost:5022/api'
      : '/api';

  async login(payload: { name?: string; email?: string; pat?: string; adminSessionToken?: string }): Promise<LoginResponse | null> {
    const response = await fetch(`${this.backendBaseUrl}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as LoginResponse;
  }

  async registerEmail(payload: { pat: string; name: string; email: string; inviteBaseUrl: string }): Promise<LoginResponse | null> {
    const response = await fetch(`${this.backendBaseUrl}/login/register-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as LoginResponse;
  }

  async verifyAdminTwoFactor(payload: { name: string; email: string; code: string }): Promise<LoginResponse | null> {
    const response = await fetch(`${this.backendBaseUrl}/login/verify2fa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as LoginResponse;
  }

  async saveRsvp(payload: { fullName: string; eventPlace: string; status: string }): Promise<EventInfo[] | null> {
    const response = await fetch(`${this.backendBaseUrl}/event/rsvp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as EventInfo[];
  }

  async saveAllergies(payload: { fullName: string; allergies: string[] }): Promise<string[] | null> {
    const response = await fetch(`${this.backendBaseUrl}/user/allergies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as string[];
  }

  async savePrefersAlcohol(): Promise<never> {
    throw new Error('Removed: use saveEventChoice');
  }

  async saveEventChoice(payload: { fullName: string; eventPlace: string; meal?: string; drink?: string }): Promise<EventChoice | null> {
    const response = await fetch(`${this.backendBaseUrl}/user/event-choice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as EventChoice;
  }

  async listInvites(adminFullName: string): Promise<InviteListResponse | null> {
    const params = new URLSearchParams({ adminFullName });
    const response = await fetch(`${this.backendBaseUrl}/admin/invites?${params.toString()}`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as InviteListResponse;
  }

  async createInvite(payload: { adminFullName: string; fullName?: string; displayName?: string; email?: string; locale?: string }): Promise<InviteRow | null> {
    const response = await fetch(`${this.backendBaseUrl}/admin/invites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as InviteRow;
  }

  async updateInvite(pat: string, payload: { adminFullName: string; fullName: string; displayName: string; email: string; locale: string }): Promise<InviteRow | null> {
    const response = await fetch(`${this.backendBaseUrl}/admin/invites/${encodeURIComponent(pat)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as InviteRow;
  }

  async deleteInvite(pat: string, adminFullName: string): Promise<boolean> {
    const params = new URLSearchParams({ adminFullName });
    const response = await fetch(
      `${this.backendBaseUrl}/admin/invites/${encodeURIComponent(pat)}?${params.toString()}`,
      { method: 'DELETE' }
    );
    return response.ok;
  }

  async goLive(payload: { adminFullName: string; inviteBaseUrl: string }): Promise<GoLiveResponse | null> {
    const response = await fetch(`${this.backendBaseUrl}/admin/invites/go-live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as GoLiveResponse;
  }

  async resendUninitialized(payload: { adminFullName: string; inviteBaseUrl: string }): Promise<GoLiveResponse | null> {
    const response = await fetch(`${this.backendBaseUrl}/admin/invites/resend-uninitialized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as GoLiveResponse;
  }

  async getEventAllergyReport(payload: { adminFullName: string; eventPlace: string }): Promise<{
    place: string;
    totalAttending: number;
    groups: { meal: string; allergies: string[]; count: number; guests: string[] }[];
    drinkCounts: { option: string; count: number }[];
  } | null> {
    const url = new URL(`${this.backendBaseUrl}/admin/event-allergies`);
    url.searchParams.set('adminFullName', payload.adminFullName);
    url.searchParams.set('eventPlace', payload.eventPlace);

    const response = await fetch(url.toString());
    if (!response.ok) {
      return null;
    }
    return await response.json();
  }
}
