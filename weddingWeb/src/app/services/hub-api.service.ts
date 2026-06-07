import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfig } from './api-config.service';
import { EventDetail, EventSummary, EventType, Invite, InviteStatus, OnboardingStatus, UserSummary } from '../models';

@Injectable({ providedIn: 'root' })
export class HubApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfig);

  listEvents(fromUtc?: string, toUtc?: string): Promise<EventSummary[]> {
    let params = new HttpParams();
    if (fromUtc) params = params.set('from', fromUtc);
    if (toUtc) params = params.set('to', toUtc);
    return firstValueFrom(this.http.get<EventSummary[]>(this.api.url('/api/events'), { params }));
  }

  getEvent(id: number): Promise<EventDetail> {
    return firstValueFrom(this.http.get<EventDetail>(this.api.url(`/api/events/${id}`)));
  }

  createEvent(payload: { type?: EventType; title?: string; startUtc?: string; endUtc?: string; parentEventId?: number }): Promise<EventDetail> {
    return firstValueFrom(this.http.post<EventDetail>(this.api.url('/api/events'), payload));
  }

  updateEvent(
    id: number,
    payload: Partial<Pick<EventDetail, 'type' | 'title' | 'description' | 'location' | 'startUtc' | 'endUtc' | 'mealOptions' | 'drinkOptions' | 'inheritParentInvites'>> & { parentEventId?: number | null },
  ): Promise<EventDetail> {
    return firstValueFrom(this.http.put<EventDetail>(this.api.url(`/api/events/${id}`), payload));
  }

  deleteEvent(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.api.url(`/api/events/${id}`)));
  }

  addInvite(eventId: number, userId: string): Promise<Invite> {
    return firstValueFrom(
      this.http.post<Invite>(this.api.url(`/api/events/${eventId}/invites`), { userId })
    );
  }

  removeInvite(eventId: number, inviteId: number): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(this.api.url(`/api/events/${eventId}/invites/${inviteId}`))
    );
  }

  rsvp(
    eventId: number,
    payload: { status?: InviteStatus; mealChoice?: string | null; drinkChoice?: string | null },
  ): Promise<Invite> {
    return firstValueFrom(
      this.http.put<Invite>(this.api.url(`/api/events/${eventId}/rsvp`), payload)
    );
  }

  searchChildCandidates(parentId: number, q: string): Promise<EventSummary[]> {
    const params = q.trim().length ? new HttpParams().set('q', q.trim()) : undefined;
    return firstValueFrom(
      this.http.get<EventSummary[]>(this.api.url(`/api/events/${parentId}/child-candidates`), { params })
    );
  }

  searchUsers(q: string): Promise<UserSummary[]> {
    if (q.trim().length < 2) return Promise.resolve([]);
    const params = new HttpParams().set('q', q);
    return firstValueFrom(this.http.get<UserSummary[]>(this.api.url('/api/users/search'), { params }));
  }

  createInviteStub(email: string, displayName?: string): Promise<UserSummary> {
    return firstValueFrom(
      this.http.post<UserSummary>(this.api.url('/api/users/invite-stub'), { email, displayName })
    );
  }

  getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
    return firstValueFrom(
      this.http.get<OnboardingStatus>(this.api.url(`/api/users/${encodeURIComponent(userId)}/onboarding-status`))
    );
  }

  onboard(userId: string, password: string, displayName?: string): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(this.api.url(`/api/users/${encodeURIComponent(userId)}/onboard`), { password, displayName })
    );
  }
}
