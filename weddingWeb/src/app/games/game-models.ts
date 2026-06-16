export interface GameConfig {
  id: string; // single-char key into the backend GameConfigs catalog
  options: Record<string, string>;
}

export interface GameCatalogEntry {
  id: string; // "uno" | "buraco"
  title: string;
  description: string;
  icon: string; // material-icon name
  configs: GameConfig[];
}

export interface LeaderboardMember {
  userId: string;
  displayName: string;
}

export interface LeaderboardRow {
  teamId: number;
  teamName: string;
  members: LeaderboardMember[];
  gameId: string;
  gameConfigsId: string;
  totalPoints: number;
  wins: number;
  lastPlayed: string;
}

export interface ScoreEntry {
  id: number;
  teamId: number;
  teamName: string;
  members: LeaderboardMember[];
  gameId: string;
  pointsAchieved: number;
  message: string;
  gameConfigsId: string;
  createdAt: string;
}

// --- SignalR room/game payloads ---

export type RoomStatus = 'Lobby' | 'Playing' | 'Ended';

export interface RoomPlayer {
  userId: string;
  displayName: string;
  connected: boolean;
}

export interface RoomState {
  code: string;
  gameId: string;
  configId: string;
  host: string;
  status: RoomStatus;
  minPlayers: number;
  maxPlayers: number;
  players: RoomPlayer[];
}

export interface GameView<T = unknown> {
  state: T;
  isEnded: boolean;
}

export interface GameEndTeam {
  userIds: string[];
  points: number;
  message: string;
  winner: boolean;
}

export interface GameEndResult {
  teams: GameEndTeam[];
  summary: string;
}

export interface ChatMessage {
  from: string;
  name: string;
  text: string;
  at: string;
}

// --- Uno view ---

export type UnoColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
export type UnoKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wilddraw4';

export interface UnoCard {
  code: string;
  color: UnoColor;
  kind: UnoKind;
  number: number;
}

export interface UnoView {
  gameId: 'uno';
  you: { index: number; hand: UnoCard[] } | null;
  players: { userId: string; cards: number; isTurn: boolean }[];
  turn: number;
  direction: number;
  activeColor: UnoColor;
  top: UnoCard | null;
  drawCount: number;
  ended: boolean;
  winner: number | null;
}

// --- Buraco view ---

export type BuracoSuit = 'clubs' | 'diamonds' | 'hearts' | 'spades' | 'joker';

export interface BuracoCard {
  code: string;
  suit: BuracoSuit;
  rank: number;
  isWild: boolean;
  points?: number;
}

export interface BuracoMeld {
  isRun: boolean;
  suit: BuracoSuit | null;
  cards: BuracoCard[];
  isCanastra: boolean;
  hasWild: boolean;
}

export interface BuracoTeam {
  team: number;
  usedMorto: boolean;
  melds: BuracoMeld[];
}

export interface BuracoView {
  gameId: 'buraco';
  you: { index: number; team: number; hand: BuracoCard[] } | null;
  players: { userId: string; team: number; cards: number; isTurn: boolean }[];
  teamMelds: BuracoTeam[];
  mortos: { team: number; count: number }[];
  discardTop: BuracoCard[] | null;
  discardCount: number;
  stockCount: number;
  phase: 'Draw' | 'MeldDiscard';
  turn: number;
  ended: boolean;
  outTeam: number | null;
}
