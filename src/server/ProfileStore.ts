import fs from 'node:fs/promises';
import path from 'node:path';
import type { PlayerProfile, SkinId, WeaponId } from '../shared/types.ts';
import { WEAPON_ORDER, WEAPON_SKINS, xpForLevel } from '../shared/weapons.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'profiles.json');

function sanitizeUsername(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/[^a-zA-Z0-9_\- ]/g, '') : '';
  return (s.slice(0, 18) || 'Striker').trim();
}

function sanitizePlayerId(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim().replace(/[^a-zA-Z0-9_\-]/g, '') : '';
  return s.slice(0, 48);
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

export class ProfileStore {
  private profiles = new Map<string, PlayerProfile>();
  private writePending = false;
  private writing = false;
  private loaded = false;

  public async init(): Promise<void> {
    if (this.loaded) return;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const raw = await fs.readFile(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, PlayerProfile>;
      for (const [id, prof] of Object.entries(parsed)) {
        if (prof && typeof prof.playerId === 'string') {
          this.profiles.set(id, prof);
        }
      }
    } catch {
      // Fresh DB file on first run
    }
    this.loaded = true;
  }

  private scheduleSave(): void {
    this.writePending = true;
    if (this.writing) return;
    void this.flushSave();
  }

  private async flushSave(): Promise<void> {
    if (!this.writePending || this.writing) return;
    this.writing = true;
    this.writePending = false;
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const obj: Record<string, PlayerProfile> = {};
      for (const [k, v] of this.profiles.entries()) {
        obj[k] = v;
      }
      const tmp = `${DB_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
      await fs.rename(tmp, DB_FILE);
    } catch (err) {
      console.error('ProfileStore save error:', err);
    } finally {
      this.writing = false;
      if (this.writePending) {
        void this.flushSave();
      }
    }
  }

  public getOrCreate(playerIdRaw: string, usernameRaw?: string): PlayerProfile {
    const playerId = sanitizePlayerId(playerIdRaw) || `guest_${Date.now()}`;
    let existing = this.profiles.get(playerId);
    if (!existing) {
      existing = {
        playerId,
        username: sanitizeUsername(usernameRaw || `Operative_${playerId.slice(-4).toUpperCase()}`),
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
      this.profiles.set(playerId, existing);
      this.scheduleSave();
    }
    return existing;
  }

  public updateLoadoutAndName(
    playerIdRaw: string,
    patch: {
      username?: string;
      primaryWeapon?: WeaponId;
      secondaryWeapon?: WeaponId;
      equippedSkin?: SkinId;
    },
  ): PlayerProfile {
    const profile = this.getOrCreate(playerIdRaw, patch.username);
    if (typeof patch.username === 'string' && patch.username.trim().length > 0) {
      profile.username = sanitizeUsername(patch.username);
    }
    if (patch.primaryWeapon && WEAPON_ORDER.includes(patch.primaryWeapon)) {
      profile.primaryWeapon = patch.primaryWeapon;
    }
    if (patch.secondaryWeapon && WEAPON_ORDER.includes(patch.secondaryWeapon)) {
      profile.secondaryWeapon = patch.secondaryWeapon;
    }
    if (patch.equippedSkin && WEAPON_SKINS[patch.equippedSkin]) {
      const unlocked = unlockedSkinsForLevel(profile.level);
      if (unlocked.includes(patch.equippedSkin)) {
        profile.equippedSkin = patch.equippedSkin;
      }
    }
    profile.unlockedSkins = unlockedSkinsForLevel(profile.level);
    this.scheduleSave();
    return profile;
  }

  public recordMatchStats(
    playerIdRaw: string,
    stats: {
      kills: number;
      deaths: number;
      shotsFired: number;
      shotsHit: number;
      headshots: number;
      won: boolean;
      xpEarned: number;
    },
  ): PlayerProfile {
    const profile = this.getOrCreate(playerIdRaw);
    const safeInt = (n: number, max: number) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));

    profile.kills += safeInt(stats.kills, 100);
    profile.deaths += safeInt(stats.deaths, 100);
    profile.shotsFired += safeInt(stats.shotsFired, 5000);
    profile.shotsHit += safeInt(stats.shotsHit, 5000);
    profile.headshots += safeInt(stats.headshots, 100);
    profile.matchesPlayed += 1;
    if (stats.won) profile.wins += 1;
    else profile.losses += 1;

    profile.xp += safeInt(stats.xpEarned, 2000);
    profile.level = computeLevel(profile.xp);
    profile.unlockedSkins = unlockedSkinsForLevel(profile.level);
    this.scheduleSave();
    return profile;
  }

  public getLeaderboard(limit = 20): Array<{
    playerId: string;
    username: string;
    level: number;
    kills: number;
    deaths: number;
    wins: number;
    matchesPlayed: number;
  }> {
    return Array.from(this.profiles.values())
      .sort((a, b) => b.kills - a.kills || b.wins - a.wins || b.level - a.level)
      .slice(0, limit)
      .map((p) => ({
        playerId: p.playerId,
        username: p.username,
        level: p.level,
        kills: p.kills,
        deaths: p.deaths,
        wins: p.wins,
        matchesPlayed: p.matchesPlayed,
      }));
  }
}
