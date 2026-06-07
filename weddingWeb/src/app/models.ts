// Shared API types and constants for the Family Hub frontend.

export const STANDARD_ALLERGENS = [
  'Peanut',
  'TreeNut',
  'Dairy',
  'Egg',
  'Soy',
  'Wheat',
  'Gluten',
  'Fish',
  'Shellfish',
  'Sesame',
] as const;

export type Allergen = (typeof STANDARD_ALLERGENS)[number];

export type DietaryPreference = 'None' | 'Vegan' | 'Vegetarian' | 'Halal';
export const DIETARY_PREFERENCES: DietaryPreference[] = ['None', 'Vegan', 'Vegetarian', 'Halal'];

export type EventType = 'Wedding' | 'FamilyGathering';
export const EVENT_TYPES: EventType[] = ['Wedding', 'FamilyGathering'];

export type EventVisibility = 'Closed' | 'Open' | 'Private';
export const EVENT_VISIBILITIES: EventVisibility[] = ['Closed', 'Open', 'Private'];

export type InviteStatus = 'Pending' | 'Accepted' | 'Declined' | 'Maybe';

export type LanguageCode = 'en' | 'nb' | 'pt-BR';
export const LANGUAGES: { code: LanguageCode; label: string; short: string }[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'nb', label: 'Norsk', short: 'NB' },
  { code: 'pt-BR', label: 'Português (BR)', short: 'PT' },
];
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

export interface EventTranslation {
  title: string;
  description: string;
  dressCode?: string;
  mealOptions?: Record<string, string>;
  drinkOptions?: Record<string, string>;
}

export type ImageRole = 'Banner' | 'Album' | 'Icon' | 'MarginLeft' | 'MarginRight' | 'MarginBottom' | 'Tile';
export const IMAGE_ROLES: ImageRole[] = ['Banner', 'Album', 'Icon', 'MarginLeft', 'MarginRight', 'MarginBottom', 'Tile'];

export interface EventImage {
  id: number;
  role: ImageRole;
  description: string;
  fileName: string;
  contentType: string;
  uploadedById: string;
  uploadedAtUtc: string;
  canEdit: boolean;
}

export interface Permissions {
  canCreateWeddingEvent: boolean;
  canCreateFamilyGathering: boolean;
}

export interface Dietary {
  preference: DietaryPreference;
  allergens: Allergen[];
  customAllergens: string;
  notes: string;
}

export interface Me {
  id: string;
  email: string;
  displayName: string;
  preferredLanguage: LanguageCode;
  permissions: Permissions;
  dietary: Dietary;
}

export interface EventSummary {
  id: number;
  type: EventType;
  title: string;
  startUtc: string;
  endUtc: string;
  location: string;
  isOwner: boolean;
  iconImageId: number | null;
}

export interface Invite {
  id: number;
  inviteeId: string;
  inviteeDisplayName: string;
  inviteeEmail: string;
  status: InviteStatus;
  mealChoice: string | null;
  drinkChoice: string | null;
  isOnboarded: boolean;
  emailSentUtc: string | null;
  inviteGroupId: number | null;
}

export interface InviteGroup {
  id: number;
  eventId: number;
  name: string;
  goPublicAtUtc: string | null;
  visibleChildEventIds: number[];
}

export interface ChildEvent {
  id: number;
  type: EventType;
  title: string;
  description: string;
  location: string;
  locationLabel: string;
  dressCode: string;
  startUtc: string;
  endUtc: string;
  isOwner: boolean;
  mealOptions: string[];
  drinkOptions: string[];
  enableTranslations: boolean;
  translations: Record<string, EventTranslation>;
  myInvite: Invite | null;
}

export interface EventDetail {
  id: number;
  type: EventType;
  title: string;
  description: string;
  location: string;
  locationLabel: string;
  dressCode: string;
  startUtc: string;
  endUtc: string;
  createdById: string;
  createdByDisplayName: string;
  isOwner: boolean;
  mealOptions: string[];
  drinkOptions: string[];
  parentEventId: number | null;
  parentEventTitle: string | null;
  inheritParentInvites: boolean;
  collectChildRsvps: boolean;
  allowGuestAlbumUploads: boolean;
  showInviteesToGuests: boolean;
  visibility: EventVisibility;
  enableTranslations: boolean;
  translations: Record<string, EventTranslation>;
  coOwners: EventOwner[];
  children: ChildEvent[];
  invites: Invite[];
  groups: InviteGroup[];
  myInvite: Invite | null;
  images: EventImage[];
}

export interface UserSummary {
  id: string;
  displayName: string;
  email: string;
}

export interface EventOwner {
  userId: string;
  displayName: string;
  email: string;
}

export interface OnboardingStatus {
  id: string;
  email: string;
  displayName: string;
  isOnboarded: boolean;
}

export interface AuthTokenResponse {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export type WishlistCurrency = 'BRL' | 'NOK' | 'USD';
export const WISHLIST_CURRENCIES: WishlistCurrency[] = ['BRL', 'NOK', 'USD'];

export interface WishlistClaimDto {
  id: number;
  itemId: number;
  claimantUserId: string | null;
  claimantLabel: string;
  quantity: number;
  createdAtUtc: string;
  isMine: boolean;
}

export interface WishlistItem {
  id: number;
  ownerUserId: string;
  name: string;
  description: string;
  url: string;
  imageUrl: string;
  priceMinor: number;
  currency: WishlistCurrency;
  pixKey: string;
  wishedQuantity: number;
  claimedQuantity: number;
  claims: WishlistClaimDto[];
  isMine: boolean;
}

export interface WishlistView {
  ownerUserId: string;
  ownerDisplayName: string;
  items: WishlistItem[];
}
