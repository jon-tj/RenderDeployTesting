import { ChildEvent, DEFAULT_LANGUAGE, EventDetail, EventTranslation, InviteStatus, LanguageCode } from '../models';

interface Translatable {
  title: string;
  description: string;
  dressCode?: string;
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

export function localizedDressCode(ev: Translatable, lang: LanguageCode): string {
  const t = pick(ev, lang);
  const candidate = t?.dressCode?.trim();
  return candidate ? candidate : (ev.dressCode ?? '');
}

export function localizedOption(
  ev: Translatable,
  lang: LanguageCode,
  kind: 'meal' | 'drink',
  value: string,
): string {
  const t = pick(ev, lang);
  if (!t) return value;
  const map = kind === 'meal' ? t.mealOptions : t.drinkOptions;
  const candidate = map?.[value]?.trim();
  return candidate ? candidate : value;
}

export type { Translatable };
export type LocalizableEvent = EventDetail | ChildEvent;

// --- UI string translations ---

type StringKey =
  | 'saveTheDate' | 'google' | 'outlook'
  | 'openInMaps' | 'findingSpot' | 'couldNotPlace'
  | 'togetherWithFamilies' | 'theDay' | 'moments'
  | 'rsvp' | 'replyAppliesToAll' | 'thankYou'
  | 'reply' | 'meal' | 'drink' | 'noPreference'
  | 'saving' | 'sendReply' | 'saveReply' | 'willYouBeThere'
  | 'withLove'
  | 'loading' | 'eventNotFound' | 'back' | 'edit'
  | 'whenAndWhere' | 'start' | 'end' | 'location' | 'dressCode' | 'hostedBy'
  | 'album' | 'noAlbumImages' | 'descriptionOptional' | 'uploading' | 'addToAlbum'
  | 'yourRsvp' | 'attending' | 'saveRsvp' | 'saved' | 'responseAppliesToAll'
  | 'invitees' | 'noInvitees' | 'mealLabel' | 'drinkLabel'
  | 'statusPending' | 'statusAccepted' | 'statusDeclined' | 'statusMaybe'
  | 'diningPlan' | 'printDiningPlan' | 'option' | 'requested' | 'toOrder'
  | 'unspecified' | 'total' | 'noAcceptedInvitees' | 'basedOnAccepted';

const STRINGS: Record<StringKey, Record<LanguageCode, string>> = {
  saveTheDate:          { 'en': 'Save the date',           'nb': 'Sett av datoen',           'pt-BR': 'Reserve a data' },
  google:               { 'en': 'Google',                  'nb': 'Google',                   'pt-BR': 'Google' },
  outlook:              { 'en': 'Outlook',                 'nb': 'Outlook',                  'pt-BR': 'Outlook' },
  openInMaps:           { 'en': 'Open in Google Maps ↗',   'nb': 'Åpne i Google Maps ↗',     'pt-BR': 'Abrir no Google Maps ↗' },
  findingSpot:          { 'en': 'Finding the spot…',       'nb': 'Finner stedet…',           'pt-BR': 'Localizando…' },
  couldNotPlace:        { 'en': 'Could not place «{0}» on the map.', 'nb': 'Fant ikke «{0}» på kartet.', 'pt-BR': 'Não foi possível localizar «{0}» no mapa.' },
  togetherWithFamilies: { 'en': 'together with their families', 'nb': 'sammen med sine familier', 'pt-BR': 'junto com suas famílias' },
  theDay:               { 'en': 'The day',                 'nb': 'Dagen',                    'pt-BR': 'O dia' },
  moments:              { 'en': 'Moments',                 'nb': 'Øyeblikk',                 'pt-BR': 'Momentos' },
  rsvp:                 { 'en': 'RSVP',                    'nb': 'Svar',                     'pt-BR': 'Confirmação' },
  replyAppliesToAll:    { 'en': 'Your reply will apply to every part of the day.', 'nb': 'Svaret ditt gjelder for hele dagen.', 'pt-BR': 'Sua resposta se aplica a todo o dia.' },
  thankYou:             { 'en': 'Thank you ♥',             'nb': 'Tusen takk ♥',             'pt-BR': 'Obrigado ♥' },
  reply:                { 'en': 'Reply',                   'nb': 'Svar',                     'pt-BR': 'Resposta' },
  meal:                 { 'en': 'Meal',                    'nb': 'Mat',                      'pt-BR': 'Refeição' },
  drink:                { 'en': 'Drink',                   'nb': 'Drikke',                   'pt-BR': 'Bebida' },
  noPreference:         { 'en': '— No preference —',       'nb': '— Ingen preferanse —',     'pt-BR': '— Sem preferência —' },
  saving:               { 'en': 'Saving…',                 'nb': 'Lagrer…',                  'pt-BR': 'Salvando…' },
  sendReply:            { 'en': 'Send reply',              'nb': 'Send svar',                'pt-BR': 'Enviar resposta' },
  saveReply:            { 'en': 'Save reply',              'nb': 'Lagre svar',               'pt-BR': 'Salvar resposta' },
  willYouBeThere:       { 'en': 'Will you be there?',      'nb': 'Kommer du?',               'pt-BR': 'Você virá?' },
  withLove:             { 'en': 'with love',               'nb': 'med kjærlighet',           'pt-BR': 'com amor' },
  loading:              { 'en': 'Loading…',                'nb': 'Laster…',                  'pt-BR': 'Carregando…' },
  eventNotFound:        { 'en': 'Event not found.',        'nb': 'Fant ikke arrangementet.', 'pt-BR': 'Evento não encontrado.' },
  back:                 { 'en': 'Back',                    'nb': 'Tilbake',                  'pt-BR': 'Voltar' },
  edit:                 { 'en': 'Edit',                    'nb': 'Rediger',                  'pt-BR': 'Editar' },
  whenAndWhere:         { 'en': 'When & where',            'nb': 'Når og hvor',              'pt-BR': 'Quando e onde' },
  start:                { 'en': 'Start',                   'nb': 'Start',                    'pt-BR': 'Início' },
  end:                  { 'en': 'End',                     'nb': 'Slutt',                    'pt-BR': 'Fim' },
  location:             { 'en': 'Location',                'nb': 'Sted',                     'pt-BR': 'Local' },
  dressCode:            { 'en': 'Dress code',              'nb': 'Kleskode',                 'pt-BR': 'Traje' },
  hostedBy:             { 'en': 'Hosted by',               'nb': 'Vert',                     'pt-BR': 'Organizado por' },
  album:                { 'en': 'Album',                   'nb': 'Album',                    'pt-BR': 'Álbum' },
  noAlbumImages:        { 'en': 'No album images yet.',    'nb': 'Ingen albumbilder ennå.',  'pt-BR': 'Ainda não há fotos no álbum.' },
  descriptionOptional:  { 'en': 'Description (optional)',  'nb': 'Beskrivelse (valgfritt)',  'pt-BR': 'Descrição (opcional)' },
  uploading:            { 'en': 'Uploading…',              'nb': 'Laster opp…',              'pt-BR': 'Enviando…' },
  addToAlbum:           { 'en': 'Add to album',            'nb': 'Legg til i albumet',       'pt-BR': 'Adicionar ao álbum' },
  yourRsvp:             { 'en': 'Your RSVP',               'nb': 'Ditt svar',                'pt-BR': 'Sua confirmação' },
  attending:            { 'en': 'Attending',               'nb': 'Deltar',                   'pt-BR': 'Presença' },
  saveRsvp:             { 'en': 'Save RSVP',               'nb': 'Lagre svar',               'pt-BR': 'Salvar confirmação' },
  saved:                { 'en': 'Saved.',                  'nb': 'Lagret.',                  'pt-BR': 'Salvo.' },
  responseAppliesToAll: { 'en': 'This response also applies to all child events.', 'nb': 'Dette svaret gjelder også for alle underarrangementer.', 'pt-BR': 'Esta resposta também se aplica a todos os subeventos.' },
  invitees:             { 'en': 'Invitees',                'nb': 'Inviterte',                'pt-BR': 'Convidados' },
  noInvitees:           { 'en': 'No invitees yet.',        'nb': 'Ingen inviterte ennå.',    'pt-BR': 'Nenhum convidado ainda.' },
  mealLabel:            { 'en': 'Meal:',                   'nb': 'Mat:',                     'pt-BR': 'Refeição:' },
  drinkLabel:           { 'en': 'Drink:',                  'nb': 'Drikke:',                  'pt-BR': 'Bebida:' },
  statusPending:        { 'en': 'Pending',                 'nb': 'Venter',                   'pt-BR': 'Pendente' },
  statusAccepted:       { 'en': 'Accepted',                'nb': 'Kommer',                   'pt-BR': 'Confirmado' },
  statusDeclined:       { 'en': 'Declined',                'nb': 'Kommer ikke',              'pt-BR': 'Recusado' },
  statusMaybe:          { 'en': 'Maybe',                   'nb': 'Kanskje',                  'pt-BR': 'Talvez' },
  diningPlan:           { 'en': 'Dining plan',              'nb': 'Bespisningsplan',          'pt-BR': 'Plano de refeições' },
  printDiningPlan:      { 'en': 'Print dining plan',        'nb': 'Skriv ut bespisningsplan', 'pt-BR': 'Imprimir plano de refeições' },
  option:               { 'en': 'Option',                   'nb': 'Valg',                     'pt-BR': 'Opção' },
  requested:            { 'en': 'Requested',                'nb': 'Ønsket',                   'pt-BR': 'Solicitado' },
  toOrder:              { 'en': 'To order',                 'nb': 'Bestilling',               'pt-BR': 'A pedir' },
  unspecified:          { 'en': 'Unspecified',              'nb': 'Uspesifisert',             'pt-BR': 'Não especificado' },
  total:                { 'en': 'Total',                    'nb': 'Totalt',                   'pt-BR': 'Total' },
  noAcceptedInvitees:   { 'en': 'No accepted invitees yet.','nb': 'Ingen har takket ja ennå.','pt-BR': 'Nenhum convidado confirmou ainda.' },
  basedOnAccepted:      { 'en': 'Based on {0} accepted invitee(s).', 'nb': 'Basert på {0} som har takket ja.', 'pt-BR': 'Baseado em {0} confirmado(s).' },
};

export function t(key: StringKey, lang: LanguageCode, ...args: string[]): string {
  const entry = STRINGS[key];
  const raw = entry?.[lang] ?? entry?.[DEFAULT_LANGUAGE] ?? key;
  return args.length ? raw.replace(/\{(\d+)\}/g, (_, i) => args[Number(i)] ?? '') : raw;
}

export function translateStatus(status: InviteStatus, lang: LanguageCode): string {
  switch (status) {
    case 'Pending':  return t('statusPending', lang);
    case 'Accepted': return t('statusAccepted', lang);
    case 'Declined': return t('statusDeclined', lang);
    case 'Maybe':    return t('statusMaybe', lang);
  }
}

const LOCALES: Record<LanguageCode, string> = {
  'en': 'en-GB',
  'nb': 'nb-NO',
  'pt-BR': 'pt-BR',
};

export function localeFor(lang: LanguageCode): string {
  return LOCALES[lang] ?? LOCALES[DEFAULT_LANGUAGE];
}

export type { StringKey };
