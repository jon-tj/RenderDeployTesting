import { ChildEvent, DEFAULT_LANGUAGE, EventDetail, EventTranslation, LanguageCode } from '../models';

interface Translatable {
  title: string;
  description: string;
  enableTranslations: boolean;
  translations: Record<string, EventTranslation>;
}

function pick(ev: Translatable, lang: LanguageCode): EventTranslation | null {
  if (!ev.enableTranslations) return null;
  if (lang === DEFAULT_LANGUAGE) return null;
  const t = ev.translations?.[lang];
  if (!t) return null;
  return t;
}

export function localizedTitle(ev: Translatable, lang: LanguageCode): string {
  const t = pick(ev, lang);
  const candidate = t?.title?.trim();
  return candidate ? candidate : ev.title;
}

export function localizedDescription(ev: Translatable, lang: LanguageCode): string {
  const t = pick(ev, lang);
  const candidate = t?.description?.trim();
  return candidate ? candidate : ev.description;
}

export type { Translatable };
export type LocalizableEvent = EventDetail | ChildEvent;
