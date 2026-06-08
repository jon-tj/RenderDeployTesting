import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfig } from './api-config.service';
import { Dietary, EventDetail, EventImage, EventOwner, EventSummary, EventTranslation, EventType, ImageRole, Invite, InviteGroup, InviteStatus, LanguageCode, OnboardingStatus, SearchHit, UserSummary, WishlistClaimMode, WishlistCurrency, WishlistItem, WishlistView } from '../models';

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
    payload: Partial<Pick<EventDetail, 'type' | 'title' | 'description' | 'location' | 'locationLabel' | 'dressCode' | 'startUtc' | 'endUtc' | 'mealOptions' | 'drinkOptions' | 'inheritParentInvites' | 'collectChildRsvps' | 'allowGuestAlbumUploads' | 'showInviteesToGuests' | 'visibility' | 'enableTranslations'>> & { parentEventId?: number | null; translations?: Record<string, EventTranslation> },
  ): Promise<EventDetail> {
    return firstValueFrom(this.http.put<EventDetail>(this.api.url(`/api/events/${id}`), payload));
  }

  deleteEvent(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.api.url(`/api/events/${id}`)));
  }

  exportEventBlob(id: number): Promise<Blob> {
    return firstValueFrom(this.http.get(this.api.url(`/api/events/${id}/export`), { responseType: 'blob' }));
  }

  importEvent(file: File): Promise<number> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(this.http.post<number>(this.api.url('/api/events/import'), form));
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

  sendInviteEmail(eventId: number, inviteId: number): Promise<Invite> {
    return firstValueFrom(
      this.http.post<Invite>(this.api.url(`/api/events/${eventId}/invites/${inviteId}/send-email`), {})
    );
  }

  sendPendingInviteEmails(eventId: number): Promise<number> {
    return firstValueFrom(
      this.http.post<number>(this.api.url(`/api/events/${eventId}/invites/send-pending-emails`), {})
    );
  }

  listInviteGroups(eventId: number): Promise<InviteGroup[]> {
    return firstValueFrom(this.http.get<InviteGroup[]>(this.api.url(`/api/events/${eventId}/groups`)));
  }

  createInviteGroup(eventId: number, payload: { name: string; visibleChildEventIds?: number[] }): Promise<InviteGroup> {
    return firstValueFrom(this.http.post<InviteGroup>(this.api.url(`/api/events/${eventId}/groups`), payload));
  }

  updateInviteGroup(eventId: number, groupId: number, payload: { name?: string; visibleChildEventIds?: number[] }): Promise<InviteGroup> {
    return firstValueFrom(this.http.put<InviteGroup>(this.api.url(`/api/events/${eventId}/groups/${groupId}`), payload));
  }

  deleteInviteGroup(eventId: number, groupId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.api.url(`/api/events/${eventId}/groups/${groupId}`)));
  }

  setInviteGroup(eventId: number, inviteId: number, groupId: number | null): Promise<Invite> {
    return firstValueFrom(this.http.put<Invite>(this.api.url(`/api/events/${eventId}/invites/${inviteId}/group`), { groupId }));
  }

  sendGroupInviteEmails(eventId: number, groupId: number): Promise<number> {
    return firstValueFrom(this.http.post<number>(this.api.url(`/api/events/${eventId}/groups/${groupId}/send-emails`), {}));
  }

  getWishlist(id: number): Promise<WishlistView> {
    return firstValueFrom(this.http.get<WishlistView>(this.api.url(`/api/wishlist/${id}`)));
  }

  // Resolves the wishlist for an event, creating it on the spot if missing.
  resolveWishlistForEvent(eventId: number): Promise<WishlistView> {
    return firstValueFrom(this.http.get<WishlistView>(this.api.url(`/api/wishlist/for-event/${eventId}`)));
  }

  createWishlistForEvent(eventId: number): Promise<WishlistView> {
    return firstValueFrom(this.http.post<WishlistView>(this.api.url(`/api/wishlist/for-event/${eventId}`), {}));
  }

  deleteWishlistForEvent(eventId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.api.url(`/api/wishlist/for-event/${eventId}`)));
  }

  resolveWishlistForUser(userId: string): Promise<WishlistView> {
    return firstValueFrom(this.http.get<WishlistView>(this.api.url(`/api/wishlist/for-user/${encodeURIComponent(userId)}`)));
  }

  resolveMyWishlist(): Promise<WishlistView> {
    return firstValueFrom(this.http.get<WishlistView>(this.api.url('/api/wishlist/mine')));
  }

  createWishlistItem(wishlistId: number, payload: Partial<Omit<WishlistItem, 'id' | 'wishlistId' | 'claimedQuantity' | 'claims' | 'canEdit'>>): Promise<WishlistItem> {
    return firstValueFrom(this.http.post<WishlistItem>(this.api.url(`/api/wishlist/${wishlistId}/items`), payload));
  }

  updateWishlistItem(id: number, payload: Partial<Omit<WishlistItem, 'id' | 'wishlistId' | 'claimedQuantity' | 'claims' | 'canEdit'>>): Promise<WishlistItem> {
    return firstValueFrom(this.http.put<WishlistItem>(this.api.url(`/api/wishlist/items/${id}`), payload));
  }

  deleteWishlistItem(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.api.url(`/api/wishlist/items/${id}`)));
  }

  claimWishlistCart(payload: { claimantLabel?: string; items: { itemId: number; quantity: number }[] }): Promise<any> {
    return firstValueFrom(this.http.post(this.api.url('/api/wishlist/claim'), payload));
  }

  releaseWishlistClaim(claimId: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.api.url(`/api/wishlist/claim/${claimId}`)));
  }

  completeWishlistClaim(claimId: number): Promise<void> {
    return firstValueFrom(this.http.post<void>(this.api.url(`/api/wishlist/claim/${claimId}/complete`), {}));
  }

  updateWishlistOptions(wishlistId: number, payload: { pixKey?: string; claimMode?: WishlistClaimMode }): Promise<WishlistView> {
    return firstValueFrom(this.http.put<WishlistView>(this.api.url(`/api/wishlist/${wishlistId}/options`), payload));
  }

  getWishlistRates(): Promise<Record<WishlistCurrency, number>> {
    return firstValueFrom(this.http.get<Record<WishlistCurrency, number>>(this.api.url('/api/wishlist/rates')));
  }

  uploadWishlistImage(itemId: number, file: File): Promise<WishlistItem> {
    const form = new FormData();
    form.append('File', file);
    return firstValueFrom(this.http.post<WishlistItem>(this.api.url(`/api/wishlist/items/${itemId}/image`), form));
  }

  deleteWishlistImage(itemId: number): Promise<WishlistItem> {
    return firstValueFrom(this.http.delete<WishlistItem>(this.api.url(`/api/wishlist/items/${itemId}/image`)));
  }

  wishlistImageUrl(itemId: number): string {
    return this.api.url(`/api/wishlist/items/${itemId}/image`);
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

  search(q: string): Promise<SearchHit[]> {
    if (q.trim().length < 2) return Promise.resolve([]);
    const params = new HttpParams().set('q', q);
    return firstValueFrom(this.http.get<SearchHit[]>(this.api.url('/api/search'), { params }));
  }

  createInviteStub(email: string, displayName?: string, language?: LanguageCode): Promise<UserSummary> {
    return firstValueFrom(
      this.http.post<UserSummary>(this.api.url('/api/users/invite-stub'), { email, displayName, language })
    );
  }

  getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
    return firstValueFrom(
      this.http.get<OnboardingStatus>(this.api.url(`/api/users/${encodeURIComponent(userId)}/onboarding-status`))
    );
  }

  onboard(userId: string, password: string, displayName?: string, dietary?: Dietary, language?: LanguageCode): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(this.api.url(`/api/users/${encodeURIComponent(userId)}/onboard`), { password, displayName, dietary, language })
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
