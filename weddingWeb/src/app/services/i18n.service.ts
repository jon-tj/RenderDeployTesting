import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DEFAULT_LANGUAGE, LanguageCode } from '../models';

type Dict = Record<string, string>;

const STRINGS: Record<LanguageCode, Dict> = {
  en: {
    'wishlist.loading': 'Loading…',
    'wishlist.notFound': 'Wishlist not found.',
    'wishlist.titleFor': 'Wishlist for {name}',
    'wishlist.titleOwn': '{name}’s wishlist',
    'wishlist.fallbackName': 'Wishlist',
    'wishlist.backToEvent': '← Back to event',
    'wishlist.subtitleOwner': 'You can edit this wishlist. Claim counts are visible to you, but not who claimed what.',
    'wishlist.subtitleGuest': 'Pick what you’d like to gift. Add items to your cart, then claim them together.',
    'wishlist.noItems': 'No items yet.',
    'wishlist.claimedOfTotal': '{claimed} / {total} claimed',
    'wishlist.claimedCount': '{claimed} claimed',
    'wishlist.fullyClaimed': 'Fully claimed',
    'wishlist.share': 'Share',
    'wishlist.linkCopied': 'Link copied',
    'wishlist.previewGuest': 'Preview as a guest',
    'wishlist.backToOwner': 'Back to owner view',
    'wishlist.addToCart': 'Add to cart',
    'wishlist.removeFromCart': 'Remove from cart',
    'wishlist.cart.title': 'Your cart',
    'wishlist.cart.empty': 'Pick items above to add them to your cart.',
    'wishlist.cart.total': 'Total',
    'wishlist.cart.payWithPix': 'Pay with Pix',
    'wishlist.cart.yourName': 'Your name',
    'wishlist.cart.yourNameHint': '(so the host knows who to thank)',
    'wishlist.cart.anon': 'Claim anonymously',
    'wishlist.cart.claim': 'Claim cart',
    'wishlist.cart.claiming': 'Claiming…',
  },
  nb: {
    'wishlist.loading': 'Laster…',
    'wishlist.notFound': 'Fant ikke ønskelisten.',
    'wishlist.titleFor': 'Ønskeliste til {name}',
    'wishlist.titleOwn': '{name} sin ønskeliste',
    'wishlist.fallbackName': 'Ønskeliste',
    'wishlist.backToEvent': '← Tilbake til arrangementet',
    'wishlist.subtitleOwner': 'Du kan redigere denne ønskelisten. Du ser hvor mange som er reservert, men ikke av hvem.',
    'wishlist.subtitleGuest': 'Velg hva du vil gi i gave. Legg ting i handlekurven, og reserver dem sammen.',
    'wishlist.noItems': 'Ingen ting enda.',
    'wishlist.claimedOfTotal': '{claimed} / {total} reservert',
    'wishlist.claimedCount': '{claimed} reservert',
    'wishlist.fullyClaimed': 'Alle reservert',
    'wishlist.share': 'Del',
    'wishlist.linkCopied': 'Lenke kopiert',
    'wishlist.previewGuest': 'Forhåndsvis som gjest',
    'wishlist.backToOwner': 'Tilbake til eierens visning',
    'wishlist.addToCart': 'Legg i handlekurv',
    'wishlist.removeFromCart': 'Fjern fra handlekurv',
    'wishlist.cart.title': 'Din handlekurv',
    'wishlist.cart.empty': 'Velg ting over for å legge dem i handlekurven.',
    'wishlist.cart.total': 'Totalt',
    'wishlist.cart.payWithPix': 'Betal med Pix',
    'wishlist.cart.yourName': 'Navnet ditt',
    'wishlist.cart.yourNameHint': '(slik at verten vet hvem som skal takkes)',
    'wishlist.cart.anon': 'Reserver anonymt',
    'wishlist.cart.claim': 'Reserver handlekurv',
    'wishlist.cart.claiming': 'Reserverer…',
  },
  'pt-BR': {
    'wishlist.loading': 'Carregando…',
    'wishlist.notFound': 'Lista de desejos não encontrada.',
    'wishlist.titleFor': 'Lista de desejos para {name}',
    'wishlist.titleOwn': 'Lista de desejos de {name}',
    'wishlist.fallbackName': 'Lista de desejos',
    'wishlist.backToEvent': '← Voltar ao evento',
    'wishlist.subtitleOwner': 'Você pode editar esta lista. Você vê quantos itens foram reservados, mas não por quem.',
    'wishlist.subtitleGuest': 'Escolha o que quer presentear. Adicione itens ao carrinho e reserve-os juntos.',
    'wishlist.noItems': 'Nenhum item ainda.',
    'wishlist.claimedOfTotal': '{claimed} / {total} reservados',
    'wishlist.claimedCount': '{claimed} reservados',
    'wishlist.fullyClaimed': 'Totalmente reservado',
    'wishlist.share': 'Compartilhar',
    'wishlist.linkCopied': 'Link copiado',
    'wishlist.previewGuest': 'Visualizar como convidado',
    'wishlist.backToOwner': 'Voltar à visão do dono',
    'wishlist.addToCart': 'Adicionar ao carrinho',
    'wishlist.removeFromCart': 'Remover do carrinho',
    'wishlist.cart.title': 'Seu carrinho',
    'wishlist.cart.empty': 'Escolha itens acima para adicionar ao carrinho.',
    'wishlist.cart.total': 'Total',
    'wishlist.cart.payWithPix': 'Pagar com Pix',
    'wishlist.cart.yourName': 'Seu nome',
    'wishlist.cart.yourNameHint': '(para o anfitrião saber a quem agradecer)',
    'wishlist.cart.anon': 'Reservar anonimamente',
    'wishlist.cart.claim': 'Reservar carrinho',
    'wishlist.cart.claiming': 'Reservando…',
  },
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly auth = inject(AuthService);

  readonly lang = computed<LanguageCode>(() => {
    const me = this.auth.me();
    return (me?.preferredLanguage as LanguageCode) ?? DEFAULT_LANGUAGE;
  });

  t(key: string, params?: Record<string, string | number>): string {
    const lang = this.lang();
    const dict = STRINGS[lang] ?? STRINGS[DEFAULT_LANGUAGE];
    let template = dict[key] ?? STRINGS[DEFAULT_LANGUAGE][key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        template = template.replaceAll(`{${k}}`, String(v));
      }
    }
    return template;
  }
}
