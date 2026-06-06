import { Injectable, computed, effect, signal } from '@angular/core';

export type Locale = 'en' | 'nb' | 'pt-BR';

export type Region = 'norway' | 'brazil' | 'uk';

export const SUPPORTED_LOCALES: ReadonlyArray<{
  code: Locale;
  flag: string;
  label: string;
}> = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'nb', flag: '🇳🇴', label: 'Norsk' },
  { code: 'pt-BR', flag: '🇧🇷', label: 'Português' }
];

const STORAGE_KEY = 'majori.locale';

type Dict = Record<string, string>;

const en: Dict = {
  'hero.eyebrow': 'Together with their families',
  'hero.lede.named': 'Invite {name} to celebrate their wedding',
  'hero.lede.guest': 'Invite you to celebrate their wedding',

  'auth.login.title': 'Guest Login',
  'auth.login.help': 'Use the same name and email as your invitation.',
  'auth.field.name': 'Name',
  'auth.field.email': 'Email',
  'auth.field.namePlaceholder': 'Jon Henrik',
  'auth.field.emailPlaceholder': 'name@example.com',
  'auth.button.signIn': 'Sign In',

  'auth.twofa.title': 'Admin Verification',
  'auth.twofa.help': 'Enter the 6-digit code sent to your email.',
  'auth.twofa.field': 'Verification Code',
  'auth.twofa.verify': 'Verify Code',
  'auth.twofa.back': 'Back',

  'auth.register.title': 'Complete Invitation',
  'auth.register.help': 'We found your PAT, but your email is not registered yet.',
  'auth.register.emailField': 'Invitation Email',
  'auth.register.continue': 'Save Email And Continue',

  'auth.status.nameTooShort': 'Name must have at least 3 characters.',
  'auth.status.nameRequired': 'Name is required to register email.',
  'auth.status.emailRequired': 'Email is required.',
  'auth.status.signingIn': 'Signing in...',
  'auth.status.serverError': 'Login failed due to a server issue.',
  'auth.status.twoFactorSent': 'A verification code was sent to your admin email. Enter it to continue.',
  'auth.status.provideEmail': 'Please provide your invitation email to complete your login.',
  'auth.status.autoSignInFailed': 'Auto sign-in failed. Please sign in manually.',
  'auth.status.accessDenied': 'Access denied. Please check your details and try again.',
  'auth.status.networkError': 'Unable to reach the backend API.',
  'auth.status.savingEmail': 'Saving email...',
  'auth.status.emailRegisterFailed': 'Could not register email.',
  'auth.status.emailRegisterFailedVerify': 'Email registration failed. Please verify your details.',
  'auth.status.enterCode': 'Please enter the verification code.',
  'auth.status.verifyingCode': 'Verifying code...',
  'auth.status.verifyServerError': 'Verification failed due to a server issue.',
  'auth.status.invalidCode': 'Invalid or expired code. Please try signing in again.',
  'auth.status.twoFactorCanceled': 'Verification canceled. Sign in again to request a new code.',

  'admin.viewAs': 'View as admin',

  'event.date': 'Date',
  'event.time': 'Time',
  'event.venue': 'Venue',
  'event.dressCode': 'Dress Code',
  'event.placeholder': 'Coming soon',

  'allergy.button': 'Register allergies',
  'diet.meal': 'Meal',
  'diet.drink': 'Drink',
  'diet.notSpecified': 'Not specified',
  'allergy.title': 'Dietary requirements',
  'allergy.help': 'Tick anything we should know about. Leave blank if none apply.',
  'allergy.save': 'Save',
  'allergy.cancel': 'Cancel',
  'allergy.saved': 'Allergies saved.',
  'allergy.none': 'None registered',
  'allergy.summary': 'Registered: {list}',
  'allergy.other.label': 'Other',
  'allergy.other.placeholder': 'e.g. lactose, kiwi',
  'allergy.option.peanuts': 'Peanuts',
  'allergy.option.treeNuts': 'Tree nuts',
  'allergy.option.dairy': 'Dairy',
  'allergy.option.eggs': 'Eggs',
  'allergy.option.gluten': 'Gluten',
  'allergy.option.soy': 'Soy',
  'allergy.option.fish': 'Fish',
  'allergy.option.shellfish': 'Shellfish',
  'allergy.option.sesame': 'Sesame',
  'allergy.option.vegetarian': 'Vegetarian',
  'allergy.option.vegan': 'Vegan',

  'rsvp.title': 'Kindly RSVP',
  'rsvp.help': "We can't wait to celebrate with you!",
  'rsvp.option.yes': 'Yes',
  'rsvp.option.maybe': 'Maybe',
  'rsvp.option.no': 'No',
  'rsvp.save': 'Save RSVP',

  'calendar.title': 'Save the Date',
  'calendar.help': 'Add our wedding to your calendar so you never miss a moment.',
  'calendar.google': 'Google Calendar',
  'calendar.outlook': 'Outlook',
  'calendar.saved': 'Saved to my calendar',

  'announcements.title': 'Announcements',
  'announcements.unread': '{n} unread',
  'announcements.seeMore': 'See more ({n})',
  'announcements.seeLess': 'See less',

  'tz.suffix.norway': 'Norway time',
  'tz.suffix.brazil': 'Brazil time',
  'tz.suffix.uk': 'UK time',

  'lang.aria': 'Language'
};

const nb: Dict = {
  'hero.eyebrow': 'Sammen med familiene sine',
  'hero.lede.named': 'Inviterer {name} til å feire bryllupet deres',
  'hero.lede.guest': 'Inviterer deg til å feire bryllupet deres',

  'auth.login.title': 'Gjestepålogging',
  'auth.login.help': 'Bruk samme navn og e-post som på invitasjonen.',
  'auth.field.name': 'Navn',
  'auth.field.email': 'E-post',
  'auth.field.namePlaceholder': 'Jon Henrik',
  'auth.field.emailPlaceholder': 'navn@eksempel.no',
  'auth.button.signIn': 'Logg inn',

  'auth.twofa.title': 'Adminverifisering',
  'auth.twofa.help': 'Skriv inn den 6-sifrede koden som ble sendt til e-posten din.',
  'auth.twofa.field': 'Verifiseringskode',
  'auth.twofa.verify': 'Verifiser kode',
  'auth.twofa.back': 'Tilbake',

  'auth.register.title': 'Fullfør invitasjon',
  'auth.register.help': 'Vi fant invitasjonsnøkkelen din, men e-posten er ikke registrert ennå.',
  'auth.register.emailField': 'Invitasjons-e-post',
  'auth.register.continue': 'Lagre e-post og fortsett',

  'auth.status.nameTooShort': 'Navnet må ha minst 3 tegn.',
  'auth.status.nameRequired': 'Navn er påkrevd for å registrere e-post.',
  'auth.status.emailRequired': 'E-post er påkrevd.',
  'auth.status.signingIn': 'Logger inn...',
  'auth.status.serverError': 'Innlogging mislyktes på grunn av en serverfeil.',
  'auth.status.twoFactorSent': 'En verifiseringskode ble sendt til adminens e-post. Skriv den inn for å fortsette.',
  'auth.status.provideEmail': 'Vennligst oppgi invitasjons-e-posten din for å fullføre innloggingen.',
  'auth.status.autoSignInFailed': 'Automatisk innlogging mislyktes. Vennligst logg inn manuelt.',
  'auth.status.accessDenied': 'Tilgang avslått. Sjekk opplysningene dine og prøv igjen.',
  'auth.status.networkError': 'Får ikke kontakt med serveren.',
  'auth.status.savingEmail': 'Lagrer e-post...',
  'auth.status.emailRegisterFailed': 'Kunne ikke registrere e-post.',
  'auth.status.emailRegisterFailedVerify': 'Registrering av e-post mislyktes. Vennligst sjekk opplysningene dine.',
  'auth.status.enterCode': 'Vennligst skriv inn verifiseringskoden.',
  'auth.status.verifyingCode': 'Verifiserer kode...',
  'auth.status.verifyServerError': 'Verifisering mislyktes på grunn av en serverfeil.',
  'auth.status.invalidCode': 'Ugyldig eller utløpt kode. Vennligst prøv å logge inn igjen.',
  'auth.status.twoFactorCanceled': 'Verifisering avbrutt. Logg inn igjen for å be om en ny kode.',

  'admin.viewAs': 'Vis som admin',

  'event.date': 'Dato',
  'event.time': 'Tid',
  'event.venue': 'Sted',
  'event.dressCode': 'Antrekk',
  'event.placeholder': 'Kommer snart',

  'allergy.button': 'Registrer allergier',
  'diet.meal': 'Måltid',
  'diet.drink': 'Drikke',
  'diet.notSpecified': 'Ikke valgt',
  'allergy.title': 'Kostbehov',
  'allergy.help': 'Kryss av for det vi bør vite om. La stå tomt om ingenting passer.',
  'allergy.save': 'Lagre',
  'allergy.cancel': 'Avbryt',
  'allergy.saved': 'Allergier lagret.',
  'allergy.none': 'Ingen registrert',
  'allergy.summary': 'Registrert: {list}',
  'allergy.other.label': 'Annet',
  'allergy.other.placeholder': 'f.eks. laktose, kiwi',
  'allergy.option.peanuts': 'Peanøtter',
  'allergy.option.treeNuts': 'Nøtter',
  'allergy.option.dairy': 'Melkeprodukter',
  'allergy.option.eggs': 'Egg',
  'allergy.option.gluten': 'Gluten',
  'allergy.option.soy': 'Soya',
  'allergy.option.fish': 'Fisk',
  'allergy.option.shellfish': 'Skalldyr',
  'allergy.option.sesame': 'Sesam',
  'allergy.option.vegetarian': 'Vegetar',
  'allergy.option.vegan': 'Veganer',

  'rsvp.title': 'Vennligst svar',
  'rsvp.help': 'Vi gleder oss til å feire med deg!',
  'rsvp.option.yes': 'Ja',
  'rsvp.option.maybe': 'Kanskje',
  'rsvp.option.no': 'Nei',
  'rsvp.save': 'Lagre svar',

  'calendar.title': 'Sett av datoen',
  'calendar.help': 'Legg bryllupet vårt i kalenderen så du ikke går glipp av et øyeblikk.',
  'calendar.google': 'Google Kalender',
  'calendar.outlook': 'Outlook',
  'calendar.saved': 'Lagt til i kalenderen min',

  'announcements.title': 'Kunngjøringer',
  'announcements.unread': '{n} uleste',
  'announcements.seeMore': 'Se mer ({n})',
  'announcements.seeLess': 'Se mindre',

  'tz.suffix.norway': 'norsk tid',
  'tz.suffix.brazil': 'brasiliansk tid',
  'tz.suffix.uk': 'britisk tid',

  'lang.aria': 'Språk'
};

const ptBR: Dict = {
  'hero.eyebrow': 'Junto com as suas famílias',
  'hero.lede.named': 'Convidam {name} para celebrar o casamento',
  'hero.lede.guest': 'Convidam você para celebrar o casamento',

  'auth.login.title': 'Entrada de convidados',
  'auth.login.help': 'Use o mesmo nome e e-mail do seu convite.',
  'auth.field.name': 'Nome',
  'auth.field.email': 'E-mail',
  'auth.field.namePlaceholder': 'Jon Henrik',
  'auth.field.emailPlaceholder': 'nome@exemplo.com',
  'auth.button.signIn': 'Entrar',

  'auth.twofa.title': 'Verificação de admin',
  'auth.twofa.help': 'Digite o código de 6 dígitos enviado ao seu e-mail.',
  'auth.twofa.field': 'Código de verificação',
  'auth.twofa.verify': 'Verificar código',
  'auth.twofa.back': 'Voltar',

  'auth.register.title': 'Concluir convite',
  'auth.register.help': 'Encontramos o seu PAT, mas o e-mail ainda não está registrado.',
  'auth.register.emailField': 'E-mail do convite',
  'auth.register.continue': 'Salvar e-mail e continuar',

  'auth.status.nameTooShort': 'O nome deve ter pelo menos 3 caracteres.',
  'auth.status.nameRequired': 'O nome é obrigatório para registrar o e-mail.',
  'auth.status.emailRequired': 'O e-mail é obrigatório.',
  'auth.status.signingIn': 'Entrando...',
  'auth.status.serverError': 'Falha no login devido a um problema no servidor.',
  'auth.status.twoFactorSent': 'Um código de verificação foi enviado para o e-mail do admin. Digite-o para continuar.',
  'auth.status.provideEmail': 'Por favor, informe o e-mail do seu convite para concluir o login.',
  'auth.status.autoSignInFailed': 'Falha no login automático. Por favor, entre manualmente.',
  'auth.status.accessDenied': 'Acesso negado. Verifique os seus dados e tente novamente.',
  'auth.status.networkError': 'Não foi possível acessar o servidor.',
  'auth.status.savingEmail': 'Salvando e-mail...',
  'auth.status.emailRegisterFailed': 'Não foi possível registrar o e-mail.',
  'auth.status.emailRegisterFailedVerify': 'Falha ao registrar o e-mail. Verifique os seus dados.',
  'auth.status.enterCode': 'Por favor, digite o código de verificação.',
  'auth.status.verifyingCode': 'Verificando código...',
  'auth.status.verifyServerError': 'A verificação falhou devido a um problema no servidor.',
  'auth.status.invalidCode': 'Código inválido ou expirado. Tente entrar novamente.',
  'auth.status.twoFactorCanceled': 'Verificação cancelada. Entre novamente para solicitar um novo código.',

  'admin.viewAs': 'Ver como admin',

  'event.date': 'Data',
  'event.time': 'Hora',
  'event.venue': 'Local',
  'event.dressCode': 'Traje',
  'event.placeholder': 'Em breve',

  'allergy.button': 'Registrar alergias',
  'diet.meal': 'Refeição',
  'diet.drink': 'Bebida',
  'diet.notSpecified': 'Não especificado',
  'allergy.title': 'Restrições alimentares',
  'allergy.help': 'Marque tudo o que devemos saber. Deixe em branco se não houver.',
  'allergy.save': 'Salvar',
  'allergy.cancel': 'Cancelar',
  'allergy.saved': 'Alergias salvas.',
  'allergy.none': 'Nenhuma registrada',
  'allergy.summary': 'Registradas: {list}',
  'allergy.other.label': 'Outra',
  'allergy.other.placeholder': 'ex.: lactose, kiwi',
  'allergy.option.peanuts': 'Amendoim',
  'allergy.option.treeNuts': 'Castanhas',
  'allergy.option.dairy': 'Laticínios',
  'allergy.option.eggs': 'Ovos',
  'allergy.option.gluten': 'Glúten',
  'allergy.option.soy': 'Soja',
  'allergy.option.fish': 'Peixe',
  'allergy.option.shellfish': 'Frutos do mar',
  'allergy.option.sesame': 'Gergelim',
  'allergy.option.vegetarian': 'Vegetariano',
  'allergy.option.vegan': 'Vegano',

  'rsvp.title': 'Por favor, confirme',
  'rsvp.help': 'Mal podemos esperar para celebrar com você!',
  'rsvp.option.yes': 'Sim',
  'rsvp.option.maybe': 'Talvez',
  'rsvp.option.no': 'Não',
  'rsvp.save': 'Salvar resposta',

  'calendar.title': 'Reserve a data',
  'calendar.help': 'Adicione o nosso casamento ao seu calendário para não perder nenhum momento.',
  'calendar.google': 'Google Agenda',
  'calendar.outlook': 'Outlook',
  'calendar.saved': 'Adicionado ao meu calendário',

  'announcements.title': 'Avisos',
  'announcements.unread': '{n} não lido(s)',
  'announcements.seeMore': 'Ver mais ({n})',
  'announcements.seeLess': 'Ver menos',

  'tz.suffix.norway': 'horário da Noruega',
  'tz.suffix.brazil': 'horário do Brasil',
  'tz.suffix.uk': 'horário do Reino Unido',

  'lang.aria': 'Idioma'
};

const dictionaries: Record<Locale, Dict> = { en, nb, 'pt-BR': ptBR };

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly locale = signal<Locale>(this.detect());

  /** Reactive dictionary current for the active locale (with English fallback). */
  private readonly dict = computed<Dict>(() => dictionaries[this.locale()] ?? en);

  constructor() {
    effect(() => {
      const code = this.locale();
      try {
        localStorage.setItem(STORAGE_KEY, code);
      } catch {
        /* ignore */
      }
      document.documentElement.lang = code;
    });
  }

  setLocale(code: Locale) {
    this.locale.set(code);
  }

  /** Translate a key with optional {placeholders}. */
  t(key: string, params?: Record<string, string | number>): string {
    const value = this.dict()[key] ?? en[key] ?? key;
    if (!params) {
      return value;
    }
    return value.replace(/\{(\w+)\}/g, (_, name: string) =>
      params[name] !== undefined ? String(params[name]) : `{${name}}`
    );
  }

  /** Format an ISO date in the active locale, optionally pinning to an event time zone. */
  formatDate(iso: string, options: Intl.DateTimeFormatOptions, timeZone?: string): string {
    if (!iso) {
      return this.t('event.placeholder');
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return this.t('event.placeholder');
    }
    return new Intl.DateTimeFormat(this.intlLocale(), {
      ...options,
      ...(timeZone ? { timeZone } : {})
    }).format(date);
  }

  /** BCP-47 tag to use with Intl APIs (English uses en-GB for 24h clock + DMY). */
  private intlLocale(): string {
    return this.locale() === 'en' ? 'en-GB' : this.locale();
  }

  /** Best-effort time-zone for an event place (so Norway events show Norway time, etc.). */
  timeZoneForPlace(place: string | undefined | null): string | undefined {
    const region = this.regionForPlace(place);
    return region ? this.timeZoneForRegion(region) : undefined;
  }

  /** Best-effort region for an event place. */
  regionForPlace(place: string | undefined | null): Region | undefined {
    if (!place) {
      return undefined;
    }
    const p = place.toLowerCase();
    if (p.includes('norway') || p.includes('norge') || p.includes('stavanger') || p.includes('oslo')) {
      return 'norway';
    }
    if (p.includes('brazil') || p.includes('brasil') || p.includes('rio') || p.includes('são paulo') || p.includes('sao paulo')) {
      return 'brazil';
    }
    return undefined;
  }

  /** Region associated with the active locale (en → uk, nb → norway, pt-BR → brazil). */
  regionForLocale(): Region {
    switch (this.locale()) {
      case 'nb':
        return 'norway';
      case 'pt-BR':
        return 'brazil';
      default:
        return 'uk';
    }
  }

  /** IANA time zone for a region. */
  timeZoneForRegion(region: Region): string {
    switch (region) {
      case 'norway':
        return 'Europe/Oslo';
      case 'brazil':
        return 'America/Sao_Paulo';
      case 'uk':
        return 'Europe/London';
    }
  }

  /** Localized suffix label for a region (e.g. "Norway time", "horário do Brasil"). */
  regionTimeSuffix(region: Region): string {
    return this.t(`tz.suffix.${region}`);
  }

  private detect(): Locale {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'en' || stored === 'nb' || stored === 'pt-BR') {
        return stored;
      }
    } catch {
      /* ignore */
    }

    const langs = (navigator.languages?.length ? navigator.languages : [navigator.language]) ?? [];
    for (const raw of langs) {
      const lang = (raw ?? '').toLowerCase();
      if (lang.startsWith('nb') || lang.startsWith('no') || lang.startsWith('nn')) {
        return 'nb';
      }
      if (lang.startsWith('pt')) {
        return 'pt-BR';
      }
      if (lang.startsWith('en')) {
        return 'en';
      }
    }
    return 'en';
  }
}
