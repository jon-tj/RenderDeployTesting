import { Injectable, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { ApiConfig } from '../services/api-config.service';
import { AuthService } from '../services/auth.service';
import { ChatMessage, GameEndResult, GameView, RoomState } from './game-models';

// Thin signal-based wrapper around a single SignalR connection to /hubs/games.
// One connection per browser tab; the consumer (game-play.component) owns the
// lifecycle and calls disconnect() when leaving the page.
@Injectable({ providedIn: 'root' })
export class GamesHubService {
  private readonly api = inject(ApiConfig);
  private readonly auth = inject(AuthService);

  private connection: HubConnection | null = null;

  readonly room = signal<RoomState | null>(null);
  readonly view = signal<GameView | null>(null);
  readonly ended = signal<GameEndResult | null>(null);
  readonly error = signal<string | null>(null);
  readonly chat = signal<ChatMessage[]>([]);
  readonly connected = signal(false);

  async connect(): Promise<void> {
    if (this.connection && this.connection.state !== HubConnectionState.Disconnected) return;
    this.reset();
    const url = this.api.url('/hubs/games');
    this.connection = new HubConnectionBuilder()
      .withUrl(url, {
        accessTokenFactory: async () => (await this.auth.getValidAccessToken()) ?? '',
      })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    this.connection.on('RoomState', (s: RoomState) => this.room.set(s));
    this.connection.on('GameView', (v: GameView) => this.view.set(v));
    this.connection.on('GameEnded', (r: GameEndResult) => this.ended.set(r));
    this.connection.on('Error', (msg: string) => this.error.set(msg));
    this.connection.on('Chat', (m: ChatMessage) => this.chat.update(prev => [...prev, m].slice(-100)));
    this.connection.onreconnected(() => this.connected.set(true));
    this.connection.onreconnecting(() => this.connected.set(false));
    this.connection.onclose(() => this.connected.set(false));

    await this.connection.start();
    this.connected.set(true);
  }

  async disconnect(): Promise<void> {
    if (!this.connection) return;
    try { await this.connection.stop(); } catch { /* swallow */ }
    this.connection = null;
    this.connected.set(false);
    this.reset();
  }

  private reset(): void {
    this.room.set(null);
    this.view.set(null);
    this.ended.set(null);
    this.error.set(null);
    this.chat.set([]);
  }

  async createRoom(gameId: string, configId: string): Promise<string> {
    await this.connect();
    const r = await this.connection!.invoke<{ code: string }>('CreateRoom', gameId, configId);
    return r.code;
  }
  async joinRoom(code: string): Promise<void> {
    await this.connect();
    await this.connection!.invoke('JoinRoom', code);
  }
  async leaveRoom(): Promise<void> {
    if (!this.connection) return;
    try { await this.connection.invoke('LeaveRoom'); } catch { /* swallow */ }
  }
  async startGame(): Promise<void> {
    await this.connection!.invoke('StartGame');
  }
  async sendAction(action: unknown): Promise<void> {
    this.error.set(null);
    await this.connection!.invoke('Action', action);
  }
  async sendChat(text: string): Promise<void> {
    await this.connection!.invoke('SendChat', text);
  }
}
