import { computed, inject, signal } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { HubApi } from '../services/hub-api.service';
import { ChildEvent, DEFAULT_LANGUAGE, EventDetail, EventImage, InviteStatus, LANGUAGES, LanguageCode } from '../models';
import { localizedDescription, localizedDressCode, localizedTitle, t } from '../utils/i18n';

export const RSVP_STATUSES: InviteStatus[] = ['Pending', 'Accepted', 'Declined', 'Maybe'];

export interface ChildRsvpState {
  status: InviteStatus;
  mealChoice: string;
  drinkChoice: string;
  saving: boolean;
  error: string;
  savedAt: number;
}

const emptyRsvp = (): ChildRsvpState => ({ status: 'Pending', mealChoice: '', drinkChoice: '', saving: false, error: '', savedAt: 0 });

// Shared state + helpers for EventDetailComponent and WeddingEventComponent.
// Both render an event with language-aware labels and an RSVP form
// (parent + optional per-child), rendered by <app-rsvp-form>.
export abstract class EventViewBase {
  protected readonly auth = inject(AuthService);
  protected readonly api = inject(HubApi);

  protected abstract currentEvent(): EventDetail | null;

  readonly languages = LANGUAGES;
  readonly langOverride = signal<LanguageCode | null>(null);
  readonly lang = computed<LanguageCode>(() =>
    this.langOverride() ?? (this.auth.me()?.preferredLanguage as LanguageCode) ?? DEFAULT_LANGUAGE);

  tr(ev: EventDetail | ChildEvent) { return localizedTitle(ev, this.lang()); }
  dr(ev: EventDetail | ChildEvent) { return localizedDescription(ev, this.lang()); }
  dc(ev: EventDetail | ChildEvent) { return localizedDressCode(ev, this.lang()); }
  locLabel(ev: EventDetail | ChildEvent) { return (ev.locationLabel ?? '').trim() || ev.location; }
  s(key: Parameters<typeof t>[0]) { return t(key, this.lang()); }

  readonly bannerImage = computed<EventImage | null>(() =>
    this.currentEvent()?.images.find(i => i.role === 'Banner') ?? null);
  readonly albumImages = computed<EventImage[]>(() =>
    this.currentEvent()?.images.filter(i => i.role === 'Album') ?? []);

  readonly parentRsvp = signal<ChildRsvpState>(emptyRsvp());
  protected readonly childStates = signal(new Map<number, ChildRsvpState>());
  childState(id: number) { return this.childStates().get(id); }

  protected hydrateRsvp(ev: EventDetail): void {
    const parent = emptyRsvp();
    if (ev.myInvite) {
      parent.status = ev.myInvite.status;
      parent.mealChoice = ev.myInvite.mealChoice ?? '';
      parent.drinkChoice = ev.myInvite.drinkChoice ?? '';
    }
    this.parentRsvp.set(parent);
    const next = new Map<number, ChildRsvpState>();
    for (const c of ev.children) {
      next.set(c.id, {
        ...emptyRsvp(),
        status: c.myInvite?.status ?? 'Pending',
        mealChoice: c.myInvite?.mealChoice ?? '',
        drinkChoice: c.myInvite?.drinkChoice ?? '',
      });
    }
    this.childStates.set(next);
  }

  // Returns the updated event for the subclass to apply, or null when the
  // caller should refetch (parent reply rippled to children).
  protected async submitRsvp(ev: EventDetail): Promise<EventDetail | null> {
    const st = this.parentRsvp();
    st.saving = true; st.error = '';
    try {
      const updated = await this.api.rsvp(ev.id, {
        status: st.status,
        mealChoice: ev.mealOptions.length ? st.mealChoice : undefined,
        drinkChoice: ev.drinkOptions.length ? st.drinkChoice : undefined,
      });
      st.savedAt = Date.now();
      if (ev.children.length && ev.collectChildRsvps) return null;
      return {
        ...ev,
        myInvite: updated,
        invites: ev.invites.some(i => i.id === updated.id)
          ? ev.invites.map(i => i.id === updated.id ? updated : i)
          : [...ev.invites, updated],
      };
    } catch (e: any) {
      st.error = e?.error ?? 'Could not save RSVP.';
      return ev;
    } finally { st.saving = false; }
  }

  protected async submitChildRsvp(parent: EventDetail, child: ChildEvent): Promise<EventDetail | null> {
    const st = this.childStates().get(child.id);
    if (!st) return null;
    st.saving = true; st.error = '';
    try {
      const updated = await this.api.rsvp(child.id, {
        status: st.status,
        mealChoice: child.mealOptions.length ? st.mealChoice : undefined,
        drinkChoice: child.drinkOptions.length ? st.drinkChoice : undefined,
      });
      st.savedAt = Date.now();
      return { ...parent, children: parent.children.map(c => c.id === child.id ? { ...c, myInvite: updated } : c) };
    } catch (e: any) {
      st.error = e?.error ?? 'Could not save RSVP.';
      return null;
    } finally { st.saving = false; }
  }
}
