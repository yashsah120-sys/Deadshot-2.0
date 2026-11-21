import type {
  ClientWsMessage,
  GameSettings,
  HudState,
  KillFeedItem,
  MapId,
  MatchResultSummary,
  NetPlayerSnapshot,
  PlayerInputState,
  SkinId,
  TeamId,
  WeaponId,
} from '../shared/types.ts';
import type { ServerWsMessage } from '../shared/types.ts';
import { getWebSocketUrl } from '../storage/settings.ts';

export type WsEventHandler = (msg: ServerWsMessage) => void;

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Set<WsEventHandler> = new Set();
  private pingInterval: number | null = null;
  private reconnectTimer: number | null = null;
  private lastJoinPayload: ClientWsMessage | null = null;
  private intentionalClose = false;
  public currentPing = 0;
  public connected = false;

  constructor() {
    this.url = getWebSocketUrl();
  }

  public connect(): Promise<void> {
    this.url = getWebSocketUrl();
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return new Promise((resolve, reject) => {
        const check = () => {
          if (this.ws?.readyState === WebSocket.OPEN) resolve();
          else if (!this.ws || this.ws.readyState >= WebSocket.CLOSING) reject(new Error('Connection closed'));
          else setTimeout(check, 40);
        };
        check();
      });
    }

    this.intentionalClose = false;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      const onOpen = () => {
        this.connected = true;
        this.startPingLoop();
        resolve();
      };

      const onError = () => {
        if (!this.connected) reject(new Error('WebSocket connection failed'));
      };

      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('error', onError, { once: true });

      ws.addEventListener('message', (evt) => {
        try {
          const msg = JSON.parse(String(evt.data)) as ServerWsMessage;
          if (msg.type === 'pong') {
            this.currentPing = Math.max(1, Math.round(performance.now() - msg.t));
          }
          for (const cb of this.listeners) cb(msg);
        } catch {
          // ignore malformed packet
        }
      });

      ws.addEventListener('close', () => {
        this.connected = false;
        this.stopPingLoop();
        if (!this.intentionalClose && this.lastJoinPayload) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.intentionalClose || !this.lastJoinPayload) return;
      try {
        await this.connect();
        if (this.lastJoinPayload) {
          this.send(this.lastJoinPayload);
        }
      } catch {
        this.scheduleReconnect();
      }
    }, 1500);
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', t: performance.now() });
      }
    }, 2000);
  }

  private stopPingLoop(): void {
    if (this.pingInterval !== null) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public onMessage(cb: WsEventHandler): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public send(msg: ClientWsMessage): void {
    if (
      msg.type === 'join_public' ||
      msg.type === 'create_private' ||
      msg.type === 'join_private'
    ) {
      this.lastJoinPayload = msg;
    } else if (msg.type === 'leave_room') {
      this.lastJoinPayload = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public disconnect(): void {
    this.intentionalClose = true;
    this.lastJoinPayload = null;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPingLoop();
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.send({ type: 'leave_room' });
        }
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.connected = false;
  }
}

export interface EngineMatchConfig {
  mode: 'ffa' | 'tdm' | 'practice' | 'bots' | 'private';
  subMode: 'ffa' | 'tdm';
  mapId: MapId;
  playerId: string;
  playerName: string;
  localTeam: TeamId;
  initialWeapon: WeaponId;
  skin: SkinId;
  isOnline: boolean;
  initialPlayers?: NetPlayerSnapshot[];
  initialTimeRemaining?: number;
}

export interface LocalMatchHooks {
  onHudUpdate: (hud: HudState) => void;
  onScoreboardToggle: (open: boolean) => void;
  onPauseToggle: (paused: boolean) => void;
  onLocalMatchFinish?: (summary: MatchResultSummary) => void;
}
export type { GameSettings, KillFeedItem, PlayerInputState };
