import type { GameSettings, MobileControlsConfig, PlayerProfile, SkinId } from '../shared/types.ts';
import { WEAPON_ORDER, WEAPON_SKINS, xpForLevel } from '../shared/weapons.ts';

const PLAYER_ID_KEY = 'neon_strike_player_id_v1';
const SETTINGS_KEY = 'neon_strike_settings_v1';
const SERVER_URL_KEY = 'neon_strike_server_url_v1';
const LOCAL_PROFILE_KEY = 'neon_strike_profile_v1';

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function getDefaultMobileControls(): MobileControlsConfig {
  return {
    enabled: isTouchDevice(),
    joystick: { x: 14, y: 74, scale: 1 },
    fire: { x: 86, y: 72, scale: 1.15 },
    scope: { x: 74, y: 62, scale: 0.95 },
    jump: { x: 89, y: 52, scale: 1 },
    crouch: { x: 76, y: 83, scale: 0.9 },
    reload: { x: 67, y: 80, scale: 0.9 },
    sprint: { x: 14, y: 48, scale: 0.9 },
    weaponSwitch: { x: 88, y: 34, scale: 0.9 },
  };
}

export function getDefaultSettings(): GameSettings {
  return {
    mouseSensitivity: 1.0,
    adsSensitivityMult: 0.55,
    touchSensitivity: 1.15,
    fov: 85,
    graphicsQuality: isTouchDevice() ? 'medium' : 'high',
    masterVolume: 0.65,
    muted: false,
    crosshairColor: '#00D2FF',
    showFps: true,
    mobileControls: getDefaultMobileControls(),
  };
}

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return getDefaultSettings();
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const defaults = getDefaultSettings();
    return {
      ...defaults,
      ...parsed,
      mobileControls: {
        ...defaults.mobileControls,
        ...(parsed.mobileControls || {}),
      },
    };
  } catch {
    return getDefaultSettings();
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage quota errors
  }
}

export function validateServerUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const cleanPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return null;
  }
}

export function getServerBaseUrl(): string {
  try {
    const saved = localStorage.getItem(SERVER_URL_KEY);
    if (saved) {
      const normalized = validateServerUrl(saved);
      if (normalized) return normalized;
    }
  } catch {
    // ignore storage errors
  }
  const envUrl = import.meta.env.VITE_SERVER_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    const normalized = validateServerUrl(envUrl);
    if (normalized) return normalized;
  }
  return '';
}

export function setServerBaseUrl(raw: string): boolean {
  const normalized = validateServerUrl(raw);
  if (normalized === null) return false;
  try {
    if (!normalized) {
      localStorage.removeItem(SERVER_URL_KEY);
    } else {
      localStorage.setItem(SERVER_URL_KEY, normalized);
    }
    return true;
  } catch {
    return false;
  }
}

export function apiUrl(apiPath: string): string {
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  const base = getServerBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function getWebSocketUrl(): string {
  const base = getServerBaseUrl();
  if (base) {
    try {
      const parsed = new URL(base);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      const cleanPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
      return `${wsProto}//${parsed.host}${cleanPath}/ws`;
    } catch {
      // fall through to same-origin
    }
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY);
    if (existing && existing.length >= 6) return existing;
    const generated = `ns_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    localStorage.setItem(PLAYER_ID_KEY, generated);
    return generated;
  } catch {
    return `ns_${Math.random().toString(36).slice(2, 10)}`;
  }
}

function unlockedSkinsForLevel(level: number): SkinId[] {
  return (Object.keys(WEAPON_SKINS) as SkinId[]).filter(
    (id) => level >= WEAPON_SKINS[id].unlockLevel,
  );
}

function computeLevel(totalXp: number): number {
  let lvl = 1;
  let rem = Math.max(0, totalXp);
  while (rem >= xpForLevel(lvl) && lvl < 99) {
    rem -= xpForLevel(lvl);
    lvl++;
  }
  return lvl;
}

function createDefaultLocalProfile(playerId: string): PlayerProfile {
  return {
    playerId,
    username: `Operative_${playerId.slice(-4).toUpperCase()}`,
    level: 1,
    xp: 0,
    kills: 0,
    deaths: 0,
    wins: 0,
    losses: 0,
    matchesPlayed: 0,
    shotsFired: 0,
    shotsHit: 0,
    headshots: 0,
    primaryWeapon: 'ar',
    secondaryWeapon: 'pistol',
    equippedSkin: 'standard',
    unlockedSkins: unlockedSkinsForLevel(1),
  };
}

function loadLocalProfile(playerId: string): PlayerProfile {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerProfile>;
      if (parsed && parsed.playerId === playerId) {
        const base = createDefaultLocalProfile(playerId);
        const merged: PlayerProfile = { ...base, ...parsed };
        merged.unlockedSkins = unlockedSkinsForLevel(merged.level);
        return merged;
      }
    }
  } catch {
    // ignore
  }
  return createDefaultLocalProfile(playerId);
}

function saveLocalProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get('content-type') || '';
  return res.ok && ct.toLowerCase().includes('application/json');
}

export async function fetchPlayerProfile(playerId: string): Promise<PlayerProfile> {
  try {
    const res = await fetch(apiUrl(`/api/profile/${encodeURIComponent(playerId)}`));
    if (isJsonResponse(res)) {
      const remote = (await res.json()) as PlayerProfile;
      saveLocalProfile(remote);
      return remote;
    }
  } catch {
    // Fall back to local browser profile on static deployments (e.g. Cloudflare Pages)
  }
  return loadLocalProfile(playerId);
}

export async function updatePlayerProfile(
  playerId: string,
  patch: Partial<Pick<PlayerProfile, 'username' | 'primaryWeapon' | 'secondaryWeapon' | 'equippedSkin'>>,
): Promise<PlayerProfile> {
  const local = loadLocalProfile(playerId);
  if (typeof patch.username === 'string' && patch.username.trim().length > 0) {
    const clean = patch.username.trim().replace(/[^a-zA-Z0-9_\- ]/g, '').slice(0, 18);
    if (clean) local.username = clean;
  }
  if (patch.primaryWeapon && WEAPON_ORDER.includes(patch.primaryWeapon)) {
    local.primaryWeapon = patch.primaryWeapon;
  }
  if (patch.secondaryWeapon && WEAPON_ORDER.includes(patch.secondaryWeapon)) {
    local.secondaryWeapon = patch.secondaryWeapon;
  }
  if (patch.equippedSkin && WEAPON_SKINS[patch.equippedSkin]) {
    const unlocked = unlockedSkinsForLevel(local.level);
    if (unlocked.includes(patch.equippedSkin)) {
      local.equippedSkin = patch.equippedSkin;
    }
  }
  local.unlockedSkins = unlockedSkinsForLevel(local.level);
  saveLocalProfile(local);

  try {
    const res = await fetch(apiUrl('/api/profile'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, ...patch }),
    });
    if (isJsonResponse(res)) {
      const remote = (await res.json()) as PlayerProfile;
      saveLocalProfile(remote);
      return remote;
    }
  } catch {
    // Offline/static hosting fallback already persisted to localStorage
  }
  return local;
}

export async function submitMatchProfileStats(
  playerId: string,
  stats: {
    kills: number;
    deaths: number;
    shotsFired: number;
    shotsHit: number;
    headshots: number;
    won: boolean;
    xpEarned: number;
  },
): Promise<PlayerProfile> {
  const safeInt = (n: number, max: number) =>
    Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));

  const local = loadLocalProfile(playerId);
  local.kills += safeInt(stats.kills, 100);
  local.deaths += safeInt(stats.deaths, 100);
  local.shotsFired += safeInt(stats.shotsFired, 5000);
  local.shotsHit += safeInt(stats.shotsHit, 5000);
  local.headshots += safeInt(stats.headshots, 100);
  local.matchesPlayed += 1;
  if (stats.won) local.wins += 1;
  else local.losses += 1;
  local.xp += safeInt(stats.xpEarned, 2000);
  local.level = computeLevel(local.xp);
  local.unlockedSkins = unlockedSkinsForLevel(local.level);
  saveLocalProfile(local);

  try {
    const res = await fetch(apiUrl('/api/profile/match'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, ...stats }),
    });
    if (isJsonResponse(res)) {
      const remote = (await res.json()) as PlayerProfile;
      saveLocalProfile(remote);
      return remote;
    }
  } catch {
    // Offline/static hosting fallback already persisted to localStorage
  }
  return local;
}
