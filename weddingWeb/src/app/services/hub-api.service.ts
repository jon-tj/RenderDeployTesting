import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfig } from './api-config.service';
import { Dietary, EventDetail, EventImage, EventOwner, EventSummary, EventType, ImageRole, Invite, InviteStatus, OnboardingStatus, UserSummary } from '../models';

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
    payload: Partial<Pick<EventDetail, 'type' | 'title' | 'description' | 'location' | 'startUtc' | 'endUtc' | 'mealOptions' | 'drinkOptions' | 'inheritParentInvites' | 'collectChildRsvps' | 'allowGuestAlbumUploads' | 'showInviteesToGuests' | 'visibility'>> & { parentEventId?: number | null },
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

  addCoOwner(eventId: number, userId: string): Promise<EventOwner> {
    return firstValueFrom(
      this.http.post<EventOwner>(this.api.url(`/api/events/${eventId}/co-owners`), { userId })
    );
  }

  removeCoOwner(eventId: number, userId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(this.api.url(`/api/events/${eventId}/co-owners/${encodeURIComponent(userId)}`))
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

  onboard(userId: string, password: string, displayName?: string, dietary?: Dietary): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(this.api.url(`/api/users/${encodeURIComponent(userId)}/onboard`), { password, displayName, dietary })
    );
  }

  uploadImage(eventId: number, file: File, role: ImageRole, description: string): Promise<EventImage> {
    const form = new FormData();
    form.append('File', file);
    form.append('Role', role);
    form.append('Description', description ?? '');
    return firstValueFrom(this.http.post<EventImage>(this.api.url(`/api/events/${eventId}/images`), form));
  }

  updateImage(eventId: number, imageId: number, payload: { role?: ImageRole; description?: string }): Promise<EventImage> {
    return firstValueFrom(this.http.put<EventImage>(this.api.url(`/api/events/${eventId}/images/${imageId}`), payload));
  }

  deleteImage(eventId: number, imageId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.api.url(`/api/events/${eventId}/images/${imageId}`)));
  }

  // Fetch the bytes via HttpClient so the auth interceptor adds the bearer
  // token, then wrap as an object URL so it can be used as <img src>.
  // Cached per (event, image) so remounting an <app-event-image> for the
  // same image is instant — important for the carousel transition where the
  // outgoing slot would otherwise blink while it re-downloads the bytes.
  private readonly imageUrlCache = new Map<string, string>();
  async imageObjectUrl(eventId: number, imageId: number): Promise<string> {
    const key = `${eventId}:${imageId}`;
    const cached = this.imageUrlCache.get(key);
    if (cached) return cached;
    const blob = await firstValueFrom(
      this.http.get(this.api.url(`/api/events/${eventId}/images/${imageId}`), { responseType: 'blob' })
    );
    const url = URL.createObjectURL(blob);
    this.imageUrlCache.set(key, url);
    return url;
  }

  imageBlob(eventId: number, imageId: number): Promise<Blob> {
    return firstValueFrom(
      this.http.get(this.api.url(`/api/events/${eventId}/images/${imageId}`), { responseType: 'blob' })
    );
  }
}
