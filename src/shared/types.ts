export type WeaponId = 'ar' | 'sniper' | 'smg' | 'shotgun' | 'pistol';

export type SkinId =
  | 'standard'
  | 'cobalt_carbon'
  | 'arctic_chrome'
  | 'solar_flare'
  | 'crimson_ops'
  | 'obsidian_gold';

export type GameMode = 'ffa' | 'tdm' | 'practice' | 'bots' | 'private';

export type MapId = 'neon_district' | 'orbital_foundry';

export type TeamId = 0 | 1 | 2; // 0 = FFA / Neutral, 1 = Cobalt (Blue), 2 = Crimson (Red)

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface WeaponSpec {
  id: WeaponId;
  slot: number;
  name: string;
  category: string;
  description: string;
  damageBody: number;
  damageHead: number;
  fireRateRpm: number;
  reloadTimeSec: number;
  magSize: number;
  pellets: number;
  spreadBase: number;
  spreadMoving: number;
  spreadAds: number;
  recoilPitch: number;
  recoilYaw: number;
  moveSpeedMult: number;
  range: number;
  automatic: boolean;
  adsFov: number;
  hasScopeOverlay: boolean;
  tracerColor: string;
}

export interface WeaponSkinSpec {
  id: SkinId;
  name: string;
  unlockLevel: number;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  metalness: number;
  roughness: number;
}

export interface AABBCollider {
  id: string;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  kind: 'floor' | 'wall' | 'building' | 'platform' | 'ramp' | 'cover' | 'pillar';
  color?: string;
  accent?: string;
  steppable?: boolean;
}

export interface SpawnPoint {
  x: number;
  y: number;
  z: number;
  yaw: number;
  team: TeamId;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  size: number;
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  ambientSky: string;
  ambientGround: string;
  keyLightColor: string;
  colliders: AABBCollider[];
  spawns: SpawnPoint[];
  neonTrimStrips: Array<{
    x: number;
    y: number;
    z: number;
    w: number;
    h: number;
    d: number;
    color: string;
  }>;
  ramps: Array<{
    id: string;
    x: number;
    y: number;
    z: number;
    width: number;
    height: number;
    length: number;
    axis: 'x' | 'z';
    dir: 1 | -1; // direction of ascending slope
  }>;
}

export interface PlayerInputState {
  seq: number;
  dt: number;
  forward: number; // -1..1
  right: number; // -1..1
  yaw: number;
  pitch: number;
  jump: boolean;
  crouch: boolean;
  sprint: boolean;
}

export interface NetPlayerSnapshot {
  id: string;
  name: string;
  team: TeamId;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  crouching: boolean;
  sprinting: boolean;
  grounded: boolean;
  weapon: WeaponId;
  skin: SkinId;
  kills: number;
  deaths: number;
  score: number;
  respawnTimer: number;
  isBot?: boolean;
}

export interface KillFeedItem {
  id: string;
  killerId: string;
  killerName: string;
  killerTeam: TeamId;
  victimId: string;
  victimName: string;
  victimTeam: TeamId;
  weapon: WeaponId;
  headshot: boolean;
  timestamp: number;
}

export interface MatchResultSummary {
  winnerName: string;
  winnerTeam: TeamId;
  mode: 'ffa' | 'tdm';
  teamScores: [number, number];
  scoreboard: Array<{
    id: string;
    name: string;
    team: TeamId;
    kills: number;
    deaths: number;
    score: number;
    accuracy: number;
    isBot?: boolean;
  }>;
  localStats: {
    kills: number;
    deaths: number;
    score: number;
    shotsFired: number;
    shotsHit: number;
    headshots: number;
    accuracy: number;
    xpEarned: number;
    won: boolean;
  };
}

export interface MobileButtonLayout {
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  scale: number; // 0.7..1.5
}

export interface MobileControlsConfig {
  enabled: boolean;
  joystick: MobileButtonLayout;
  fire: MobileButtonLayout;
  scope: MobileButtonLayout;
  jump: MobileButtonLayout;
  crouch: MobileButtonLayout;
  reload: MobileButtonLayout;
  sprint: MobileButtonLayout;
  weaponSwitch: MobileButtonLayout;
}

export interface GameSettings {
  mouseSensitivity: number; // 0.2..3.0
  adsSensitivityMult: number; // 0.2..1.2
  touchSensitivity: number; // 0.3..3.0
  fov: number; // 70..110
  graphicsQuality: GraphicsQuality;
  masterVolume: number; // 0..1
  muted: boolean;
  crosshairColor: string;
  showFps: boolean;
  mobileControls: MobileControlsConfig;
}

export interface PlayerProfile {
  playerId: string;
  username: string;
  level: number;
  xp: number;
  kills: number;
  deaths: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  primaryWeapon: WeaponId;
  secondaryWeapon: WeaponId;
  equippedSkin: SkinId;
  unlockedSkins: SkinId[];
}

export interface HudState {
  health: number;
  maxHealth: number;
  alive: boolean;
  respawnTimer: number;
  killerName?: string;
  weapon: WeaponId;
  ammo: number;
  magSize: number;
  reloading: boolean;
  reloadProgress: number;
  isScoped: boolean;
  spreadRadius: number;
  kills: number;
  deaths: number;
  score: number;
  streak: number;
  timeRemaining: number;
  teamScores: [number, number];
  localTeam: TeamId;
  mode: GameMode;
  subMode: 'ffa' | 'tdm';
  mapId: MapId;
  players: NetPlayerSnapshot[];
  killFeed: KillFeedItem[];
  ping: number;
  fps: number;
  isPointerLocked: boolean;
  hitmarker: { active: boolean; headshot: boolean; kill: boolean; id: number };
  damageFlash: number;
  minimapPlayers: Array<{
    id: string;
    x: number;
    z: number;
    yaw: number;
    team: TeamId;
    alive: boolean;
    isLocal: boolean;
  }>;
  matchResult: MatchResultSummary | null;
}

// WebSocket Client -> Server Messages
export type ClientWsMessage =
  | {
      type: 'join_public';
      playerId: string;
      name: string;
      mode: 'ffa' | 'tdm';
      mapId: MapId;
      weapon: WeaponId;
      skin: SkinId;
    }
  | {
      type: 'create_private';
      playerId: string;
      name: string;
      mode: 'ffa' | 'tdm';
      mapId: MapId;
      weapon: WeaponId;
      skin: SkinId;
    }
  | {
      type: 'join_private';
      roomCode: string;
      playerId: string;
      name: string;
      weapon: WeaponId;
      skin: SkinId;
    }
  | {
      type: 'start_private_match';
      roomCode: string;
    }
  | {
      type: 'input';
      seq: number;
      dt: number;
      forward: number;
      right: number;
      yaw: number;
      pitch: number;
      jump: boolean;
      crouch: boolean;
      sprint: boolean;
    }
  | {
      type: 'shoot';
      weapon: WeaponId;
      origin: [number, number, number];
      dir: [number, number, number];
      clientTime: number;
    }
  | {
      type: 'switch_weapon';
      weapon: WeaponId;
    }
  | {
      type: 'reload';
    }
  | {
      type: 'ping';
      t: number;
    }
  | {
      type: 'leave_room';
    };

// WebSocket Server -> Client Messages
export type ServerWsMessage =
  | {
      type: 'joined_room';
      roomId: string;
      roomCode?: string;
      isPrivate: boolean;
      isHost: boolean;
      waitingToStart: boolean;
      playerId: string;
      mode: 'ffa' | 'tdm';
      mapId: MapId;
      team: TeamId;
      players: NetPlayerSnapshot[];
    }
  | {
      type: 'room_lobby_update';
      roomCode: string;
      players: Array<{ id: string; name: string; team: TeamId }>;
      mode: 'ffa' | 'tdm';
      mapId: MapId;
      hostId: string;
    }
  | {
      type: 'match_started';
      mode: 'ffa' | 'tdm';
      mapId: MapId;
      timeRemaining: number;
    }
  | {
      type: 'snapshot';
      tick: number;
      ackSeq: number;
      timeRemaining: number;
      teamScores: [number, number];
      players: NetPlayerSnapshot[];
    }
  | {
      type: 'shot_fx';
      shooterId: string;
      weapon: WeaponId;
      origin: [number, number, number];
      hits: Array<[number, number, number]>;
    }
  | {
      type: 'hit_confirm';
      targetId: string;
      damage: number;
      headshot: boolean;
      killed: boolean;
    }
  | {
      type: 'damaged';
      attackerId: string;
      attackerName: string;
      damage: number;
      health: number;
    }
  | {
      type: 'kill_feed';
      event: KillFeedItem;
    }
  | {
      type: 'match_end';
      summary: MatchResultSummary;
    }
  | {
      type: 'pong';
      t: number;
    }
  | {
      type: 'error';
      message: string;
    };
