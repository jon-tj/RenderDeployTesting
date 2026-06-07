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

export type InviteStatus = 'Pending' | 'Accepted' | 'Declined' | 'Maybe';

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
}

export interface Invite {
  id: number;
  inviteeId: string;
  inviteeDisplayName: string;
  inviteeEmail: string;
  status: InviteStatus;
}

export interface EventDetail {
  id: number;
  type: EventType;
  title: string;
  description: string;
  location: string;
  startUtc: string;
  endUtc: string;
  createdById: string;
  createdByDisplayName: string;
  isOwner: boolean;
  invites: Invite[];
}

export interface UserSummary {
  id: string;
  displayName: string;
  email: string;
}

export interface AuthTokenResponse {
  tokenType: string;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}
