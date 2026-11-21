import type { WebSocket, WebSocketServer } from 'ws';
import { MAPS } from '../shared/maps.ts';
import {
  PLAYER_EYE_CROUCH,
  PLAYER_EYE_STAND,
  raycastMap,
  raycastPlayerHitbox,
  stepPlayerPhysics,
  type PhysicsBody,
} from '../shared/physics.ts';
import type {
  ClientWsMessage,
  KillFeedItem,
  MapId,
  MatchResultSummary,
  NetPlayerSnapshot,
  PlayerInputState,
  ServerWsMessage,
  SkinId,
  TeamId,
  WeaponId,
} from '../shared/types.ts';
import { WEAPON_ORDER, WEAPONS } from '../shared/weapons.ts';
import type { ProfileStore } from './ProfileStore.ts';

interface ServerPlayer {
  id: string;
  name: string;
  ws: WebSocket;
  team: TeamId;
  body: PhysicsBody;
  health: number;
  maxHealth: number;
  alive: boolean;
  respawnTimer: number;
  weapon: WeaponId;
  skin: SkinId;
  ammo: Record<WeaponId, number>;
  reloading: boolean;
  reloadTimer: number;
  lastShotAt: number;
  kills: number;
  deaths: number;
  score: number;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  lastAckSeq: number;
  pendingInputs: PlayerInputState[];
}

interface GameRoom {
  id: string;
  roomCode?: string;
  isPrivate: boolean;
  hostId: string;
  mode: 'ffa' | 'tdm';
  mapId: MapId;
  started: boolean;
  ended: boolean;
  timeRemaining: number;
  teamScores: [number, number];
  tickCount: number;
  players: Map<string, ServerPlayer>;
}

const MAX_PLAYERS_PER_ROOM = 12;
const MATCH_DURATION_SEC = 180;
const RESPAWN_DELAY_SEC = 2.5;
const FFA_SCORE_LIMIT = 25;
const TDM_SCORE_LIMIT = 40;

export class GameServer {
  private wss: WebSocketServer;
  private profileStore: ProfileStore;
  private rooms = new Map<string, GameRoom>();
  private socketToRoom = new Map<WebSocket, { roomId: string; playerId: string }>();
  private tickInterval: NodeJS.Timeout | null = null;
  private lastTickMs = Date.now();

  constructor(wss: WebSocketServer, profileStore: ProfileStore) {
    this.wss = wss;
    this.profileStore = profileStore;
    this.bindWs();
    this.startLoop();
  }

  private bindWs(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw)) as ClientWsMessage;
          this.handleMessage(ws, msg);
        } catch {
          this.send(ws, { type: 'error', message: 'Invalid message format.' });
        }
      });

      ws.on('close', () => {
        this.removeSocket(ws);
      });

      ws.on('error', () => {
        this.removeSocket(ws);
      });
    });
  }

  private send(ws: WebSocket, msg: ServerWsMessage): void {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }

  private broadcast(room: GameRoom, msg: ServerWsMessage): void {
    const payload = JSON.stringify(msg);
    for (const p of room.players.values()) {
      if (p.ws.readyState === 1) {
        p.ws.send(payload);
      }
    }
  }

  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      const clash = Array.from(this.rooms.values()).some((r) => r.roomCode === code);
      if (!clash) return code;
    }
    return `NS${Math.floor(1000 + Math.random() * 8999)}`;
  }

  private pickSpawn(room: GameRoom, team: TeamId) {
    const map = MAPS[room.mapId];
    const pool = map.spawns.filter((s) => room.mode === 'ffa' || s.team === team || s.team === 0);
    const candidates = pool.length > 0 ? pool : map.spawns;

    let best = candidates[0];
    let bestMinDist = -1;
    for (const sp of candidates) {
      let minDist = 999;
      for (const other of room.players.values()) {
        if (!other.alive) continue;
        if (room.mode === 'tdm' && other.team === team) continue;
        const d = Math.hypot(sp.x - other.body.x, sp.z - other.body.z);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        best = sp;
      }
    }
    return best;
  }

  private createPlayer(
    room: GameRoom,
    ws: WebSocket,
    playerId: string,
    name: string,
    weapon: WeaponId,
    skin: SkinId,
  ): ServerPlayer {
    let team: TeamId = 0;
    if (room.mode === 'tdm') {
      let t1 = 0;
      let t2 = 0;
      for (const p of room.players.values()) {
        if (p.team === 1) t1++;
        else if (p.team === 2) t2++;
      }
      team = t1 <= t2 ? 1 : 2;
    }

    const sp = this.pickSpawn(room, team);
    const validWeapon = WEAPON_ORDER.includes(weapon) ? weapon : 'ar';

    return {
      id: playerId,
      name: name.slice(0, 18) || 'Striker',
      ws,
      team,
      body: {
        x: sp.x,
        y: sp.y,
        z: sp.z,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: sp.yaw,
        pitch: 0,
        grounded: true,
        crouching: false,
        sprinting: false,
      },
      health: 100,
      maxHealth: 100,
      alive: true,
      respawnTimer: 0,
      weapon: validWeapon,
      skin: skin || 'standard',
      ammo: {
        ar: WEAPONS.ar.magSize,
        sniper: WEAPONS.sniper.magSize,
        smg: WEAPONS.smg.magSize,
        shotgun: WEAPONS.shotgun.magSize,
        pistol: WEAPONS.pistol.magSize,
      },
      reloading: false,
      reloadTimer: 0,
      lastShotAt: 0,
      kills: 0,
      deaths: 0,
      score: 0,
      shotsFired: 0,
      shotsHit: 0,
      headshots: 0,
      lastAckSeq: 0,
      pendingInputs: [],
    };
  }

  private toSnapshot(p: ServerPlayer): NetPlayerSnapshot {
    return {
      id: p.id,
      name: p.name,
      team: p.team,
      x: p.body.x,
      y: p.body.y,
      z: p.body.z,
      vx: p.body.vx,
      vy: p.body.vy,
      vz: p.body.vz,
      yaw: p.body.yaw,
      pitch: p.body.pitch,
      health: p.health,
      maxHealth: p.maxHealth,
      alive: p.alive,
      crouching: p.body.crouching,
      sprinting: p.body.sprinting,
      grounded: p.body.grounded,
      weapon: p.weapon,
      skin: p.skin,
      kills: p.kills,
      deaths: p.deaths,
      score: p.score,
      respawnTimer: Math.max(0, p.respawnTimer),
    };
  }

  private removeSocket(ws: WebSocket): void {
    const link = this.socketToRoom.get(ws);
    if (!link) return;
    this.socketToRoom.delete(ws);

    const room = this.rooms.get(link.roomId);
    if (!room) return;
    room.players.delete(link.playerId);

    if (room.players.size === 0) {
      this.rooms.delete(room.id);
      return;
    }

    if (room.hostId === link.playerId) {
      const nextHost = room.players.values().next().value;
      if (nextHost) room.hostId = nextHost.id;
    }

    if (room.isPrivate && !room.started && room.roomCode) {
      this.broadcast(room, {
        type: 'room_lobby_update',
        roomCode: room.roomCode,
        players: Array.from(room.players.values()).map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team,
        })),
        mode: room.mode,
        mapId: room.mapId,
        hostId: room.hostId,
      });
    }
  }

  private handleMessage(ws: WebSocket, msg: ClientWsMessage): void {
    if (msg.type === 'ping') {
      this.send(ws, { type: 'pong', t: msg.t });
      return;
    }

    if (msg.type === 'leave_room') {
      this.removeSocket(ws);
      return;
    }

    if (msg.type === 'join_public') {
      this.removeSocket(ws);
      const mapId: MapId = MAPS[msg.mapId] ? msg.mapId : 'neon_district';
      const mode: 'ffa' | 'tdm' = msg.mode === 'tdm' ? 'tdm' : 'ffa';

      let targetRoom: GameRoom | undefined;
      for (const r of this.rooms.values()) {
        if (!r.isPrivate && !r.ended && r.mode === mode && r.mapId === mapId && r.players.size < MAX_PLAYERS_PER_ROOM) {
          targetRoom = r;
          break;
        }
      }

      if (!targetRoom) {
        const roomId = `pub_${mode}_${mapId}_${Date.now()}`;
        targetRoom = {
          id: roomId,
          isPrivate: false,
          hostId: msg.playerId,
          mode,
          mapId,
          started: true,
          ended: false,
          timeRemaining: MATCH_DURATION_SEC,
          teamScores: [0, 0],
          tickCount: 0,
          players: new Map(),
        };
        this.rooms.set(roomId, targetRoom);
      }

      const player = this.createPlayer(targetRoom, ws, msg.playerId, msg.name, msg.weapon, msg.skin);
      targetRoom.players.set(player.id, player);
      this.socketToRoom.set(ws, { roomId: targetRoom.id, playerId: player.id });

      this.send(ws, {
        type: 'joined_room',
        roomId: targetRoom.id,
        isPrivate: false,
        isHost: targetRoom.hostId === player.id,
        waitingToStart: false,
        playerId: player.id,
        mode: targetRoom.mode,
        mapId: targetRoom.mapId,
        team: player.team,
        players: Array.from(targetRoom.players.values()).map((p) => this.toSnapshot(p)),
      });
      return;
    }

    if (msg.type === 'create_private') {
      this.removeSocket(ws);
      const mapId: MapId = MAPS[msg.mapId] ? msg.mapId : 'neon_district';
      const mode: 'ffa' | 'tdm' = msg.mode === 'tdm' ? 'tdm' : 'ffa';
      const roomCode = this.generateRoomCode();
      const roomId = `priv_${roomCode}`;

      const room: GameRoom = {
        id: roomId,
        roomCode,
        isPrivate: true,
        hostId: msg.playerId,
        mode,
        mapId,
        started: false,
        ended: false,
        timeRemaining: MATCH_DURATION_SEC,
        teamScores: [0, 0],
        tickCount: 0,
        players: new Map(),
      };
      this.rooms.set(roomId, room);

      const player = this.createPlayer(room, ws, msg.playerId, msg.name, msg.weapon, msg.skin);
      room.players.set(player.id, player);
      this.socketToRoom.set(ws, { roomId: room.id, playerId: player.id });

      this.send(ws, {
        type: 'joined_room',
        roomId: room.id,
        roomCode,
        isPrivate: true,
        isHost: true,
        waitingToStart: true,
        playerId: player.id,
        mode: room.mode,
        mapId: room.mapId,
        team: player.team,
        players: [this.toSnapshot(player)],
      });
      return;
    }

    if (msg.type === 'join_private') {
      this.removeSocket(ws);
      const code = msg.roomCode.trim().toUpperCase();
      const room = Array.from(this.rooms.values()).find((r) => r.isPrivate && r.roomCode === code);
      if (!room) {
        this.send(ws, { type: 'error', message: `Room "${code}" not found.` });
        return;
      }
      if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
        this.send(ws, { type: 'error', message: 'Private room is full.' });
        return;
      }
      if (room.ended) {
        this.send(ws, { type: 'error', message: 'That match has already finished.' });
        return;
      }

      const player = this.createPlayer(room, ws, msg.playerId, msg.name, msg.weapon, msg.skin);
      room.players.set(player.id, player);
      this.socketToRoom.set(ws, { roomId: room.id, playerId: player.id });

      this.send(ws, {
        type: 'joined_room',
        roomId: room.id,
        roomCode: room.roomCode,
        isPrivate: true,
        isHost: room.hostId === player.id,
        waitingToStart: !room.started,
        playerId: player.id,
        mode: room.mode,
        mapId: room.mapId,
        team: player.team,
        players: Array.from(room.players.values()).map((p) => this.toSnapshot(p)),
      });

      if (!room.started && room.roomCode) {
        this.broadcast(room, {
          type: 'room_lobby_update',
          roomCode: room.roomCode,
          players: Array.from(room.players.values()).map((p) => ({
            id: p.id,
            name: p.name,
            team: p.team,
          })),
          mode: room.mode,
          mapId: room.mapId,
          hostId: room.hostId,
        });
      }
      return;
    }

    const link = this.socketToRoom.get(ws);
    if (!link) return;
    const room = this.rooms.get(link.roomId);
    if (!room) return;
    const player = room.players.get(link.playerId);
    if (!player) return;

    if (msg.type === 'start_private_match') {
      if (room.isPrivate && room.hostId === player.id && !room.started) {
        room.started = true;
        room.timeRemaining = MATCH_DURATION_SEC;
        this.broadcast(room, {
          type: 'match_started',
          mode: room.mode,
          mapId: room.mapId,
          timeRemaining: room.timeRemaining,
        });
      }
      return;
    }

    if (!room.started || room.ended) return;

    if (msg.type === 'input') {
      if (player.pendingInputs.length < 30) {
        player.pendingInputs.push({
          seq: msg.seq,
          dt: Math.min(0.05, Math.max(0.001, msg.dt)),
          forward: Math.max(-1, Math.min(1, msg.forward)),
          right: Math.max(-1, Math.min(1, msg.right)),
          yaw: msg.yaw,
          pitch: msg.pitch,
          jump: Boolean(msg.jump),
          crouch: Boolean(msg.crouch),
          sprint: Boolean(msg.sprint),
        });
      }
    } else if (msg.type === 'switch_weapon') {
      if (WEAPON_ORDER.includes(msg.weapon)) {
        player.weapon = msg.weapon;
        player.reloading = false;
        player.reloadTimer = 0;
      }
    } else if (msg.type === 'reload') {
      const spec = WEAPONS[player.weapon];
      if (!player.reloading && player.alive && player.ammo[player.weapon] < spec.magSize) {
        player.reloading = true;
        player.reloadTimer = spec.reloadTimeSec;
      }
    } else if (msg.type === 'shoot') {
      this.processShot(room, player, msg.weapon, msg.dir);
    }
  }

  private processShot(
    room: GameRoom,
    shooter: ServerPlayer,
    weaponId: WeaponId,
    rawDir: [number, number, number],
  ): void {
    if (!shooter.alive || shooter.reloading) return;
    const weapon = WEAPON_ORDER.includes(weaponId) ? weaponId : shooter.weapon;
    shooter.weapon = weapon;
    const spec = WEAPONS[weapon];

    const now = Date.now();
    const minIntervalMs = (60 / spec.fireRateRpm) * 1000 * 0.85;
    if (now - shooter.lastShotAt < minIntervalMs) return;
    if (shooter.ammo[weapon] <= 0) return;

    shooter.lastShotAt = now;
    shooter.ammo[weapon] -= 1;
    shooter.shotsFired += 1;

    const map = MAPS[room.mapId];
    const eyeY = shooter.body.y + (shooter.body.crouching ? PLAYER_EYE_CROUCH : PLAYER_EYE_STAND);
    const origin: [number, number, number] = [shooter.body.x, eyeY, shooter.body.z];

    const dLen = Math.hypot(rawDir[0], rawDir[1], rawDir[2]) || 1;
    const baseDir: [number, number, number] = [rawDir[0] / dLen, rawDir[1] / dLen, rawDir[2] / dLen];

    const speed = Math.hypot(shooter.body.vx, shooter.body.vz);
    const spread = speed > 2 ? spec.spreadMoving * 0.55 : spec.spreadBase;
    const hitPoints: Array<[number, number, number]> = [];

    for (let i = 0; i < spec.pellets; i++) {
      const dx = baseDir[0] + (Math.random() - 0.5) * spread * 1.4;
      const dy = baseDir[1] + (Math.random() - 0.5) * spread * 1.4;
      const dz = baseDir[2] + (Math.random() - 0.5) * spread * 1.4;
      const l = Math.hypot(dx, dy, dz) || 1;
      const dir: [number, number, number] = [dx / l, dy / l, dz / l];

      const mapHit = raycastMap(origin, dir, spec.range, map);
      let maxDist = mapHit ? mapHit.distance : spec.range;
      let hitTarget: ServerPlayer | null = null;
      let isHeadshot = false;
      let hitPt: [number, number, number] = mapHit
        ? mapHit.point
        : [origin[0] + dir[0] * maxDist, origin[1] + dir[1] * maxDist, origin[2] + dir[2] * maxDist];

      for (const other of room.players.values()) {
        if (other.id === shooter.id || !other.alive) continue;
        if (room.mode === 'tdm' && other.team === shooter.team) continue;

        const pHit = raycastPlayerHitbox(
          origin,
          dir,
          maxDist,
          other.body.x,
          other.body.y,
          other.body.z,
          other.body.crouching,
        );
        if (pHit && pHit.distance < maxDist) {
          maxDist = pHit.distance;
          hitTarget = other;
          isHeadshot = pHit.headshot;
          hitPt = pHit.point;
        }
      }

      hitPoints.push(hitPt);

      if (hitTarget) {
        shooter.shotsHit += 1;
        if (isHeadshot) shooter.headshots += 1;
        const dmg = isHeadshot ? spec.damageHead : spec.damageBody;
        hitTarget.health = Math.max(0, hitTarget.health - dmg);

        const killed = hitTarget.health <= 0;
        this.send(shooter.ws, {
          type: 'hit_confirm',
          targetId: hitTarget.id,
          damage: dmg,
          headshot: isHeadshot,
          killed,
        });

        this.send(hitTarget.ws, {
          type: 'damaged',
          attackerId: shooter.id,
          attackerName: shooter.name,
          damage: dmg,
          health: hitTarget.health,
        });

        if (killed && hitTarget.alive) {
          this.handlePlayerKilled(room, shooter, hitTarget, weapon, isHeadshot);
        }
      }
    }

    this.broadcast(room, {
      type: 'shot_fx',
      shooterId: shooter.id,
      weapon,
      origin,
      hits: hitPoints,
    });
  }

  private handlePlayerKilled(
    room: GameRoom,
    killer: ServerPlayer,
    victim: ServerPlayer,
    weapon: WeaponId,
    headshot: boolean,
  ): void {
    victim.alive = false;
    victim.health = 0;
    victim.deaths += 1;
    victim.respawnTimer = RESPAWN_DELAY_SEC;

    killer.kills += 1;
    killer.score += headshot ? 125 : 100;

    if (room.mode === 'tdm') {
      if (killer.team === 1) room.teamScores[0] += 1;
      else if (killer.team === 2) room.teamScores[1] += 1;
    }

    const event: KillFeedItem = {
      id: `${Date.now()}_${Math.random()}`,
      killerId: killer.id,
      killerName: killer.name,
      killerTeam: killer.team,
      victimId: victim.id,
      victimName: victim.name,
      victimTeam: victim.team,
      weapon,
      headshot,
      timestamp: Date.now(),
    };
    this.broadcast(room, { type: 'kill_feed', event });

    const scoreReached =
      (room.mode === 'ffa' && killer.kills >= FFA_SCORE_LIMIT) ||
      (room.mode === 'tdm' && (room.teamScores[0] >= TDM_SCORE_LIMIT || room.teamScores[1] >= TDM_SCORE_LIMIT));

    if (scoreReached) {
      this.endMatch(room);
    }
  }

  private endMatch(room: GameRoom): void {
    if (room.ended) return;
    room.ended = true;

    const scoreboard = Array.from(room.players.values())
      .map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        kills: p.kills,
        deaths: p.deaths,
        score: p.score,
        accuracy: p.shotsFired > 0 ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0,
      }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

    let winnerName = scoreboard[0]?.name ?? 'Draw';
    let winnerTeam: TeamId = scoreboard[0]?.team ?? 0;

    if (room.mode === 'tdm') {
      winnerTeam = room.teamScores[0] >= room.teamScores[1] ? 1 : 2;
      winnerName = winnerTeam === 1 ? 'COBALT SQUAD' : 'CRIMSON SQUAD';
    }

    for (const p of room.players.values()) {
      const won =
        room.mode === 'tdm'
          ? p.team === winnerTeam
          : scoreboard[0]?.id === p.id;
      const acc = p.shotsFired > 0 ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
      const xpEarned = p.kills * 40 + (won ? 140 : 50) + p.headshots * 15;

      this.profileStore.recordMatchStats(p.id, {
        kills: p.kills,
        deaths: p.deaths,
        shotsFired: p.shotsFired,
        shotsHit: p.shotsHit,
        headshots: p.headshots,
        won,
        xpEarned,
      });

      const summary: MatchResultSummary = {
        winnerName,
        winnerTeam,
        mode: room.mode,
        teamScores: [...room.teamScores] as [number, number],
        scoreboard,
        localStats: {
          kills: p.kills,
          deaths: p.deaths,
          score: p.score,
          shotsFired: p.shotsFired,
          shotsHit: p.shotsHit,
          headshots: p.headshots,
          accuracy: acc,
          xpEarned,
          won,
        },
      };

      this.send(p.ws, { type: 'match_end', summary });
    }
  }

  private startLoop(): void {
    this.tickInterval = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.1, (now - this.lastTickMs) / 1000);
      this.lastTickMs = now;

      for (const room of this.rooms.values()) {
        if (!room.started || room.ended) continue;
        room.tickCount++;
        const map = MAPS[room.mapId];

        room.timeRemaining = Math.max(0, room.timeRemaining - dt);
        if (room.timeRemaining <= 0) {
          this.endMatch(room);
          continue;
        }

        for (const p of room.players.values()) {
          if (!p.alive) {
            p.respawnTimer -= dt;
            if (p.respawnTimer <= 0) {
              const sp = this.pickSpawn(room, p.team);
              p.body.x = sp.x;
              p.body.y = sp.y;
              p.body.z = sp.z;
              p.body.vx = 0;
              p.body.vy = 0;
              p.body.vz = 0;
              p.body.yaw = sp.yaw;
              p.body.pitch = 0;
              p.health = 100;
              p.alive = true;
              p.reloading = false;
              for (const w of WEAPON_ORDER) p.ammo[w] = WEAPONS[w].magSize;
              p.pendingInputs = [];
            }
            continue;
          }

          if (p.reloading) {
            p.reloadTimer -= dt;
            if (p.reloadTimer <= 0) {
              p.reloading = false;
              p.ammo[p.weapon] = WEAPONS[p.weapon].magSize;
            }
          }

          const speedMult = WEAPONS[p.weapon].moveSpeedMult;
          while (p.pendingInputs.length > 0) {
            const inp = p.pendingInputs.shift()!;
            stepPlayerPhysics(p.body, inp, map, speedMult);
            p.lastAckSeq = inp.seq;
          }
        }

        const snapshots = Array.from(room.players.values()).map((p) => this.toSnapshot(p));
        for (const p of room.players.values()) {
          this.send(p.ws, {
            type: 'snapshot',
            tick: room.tickCount,
            ackSeq: p.lastAckSeq,
            timeRemaining: room.timeRemaining,
            teamScores: room.teamScores,
            players: snapshots,
          });
        }
      }
    }, 50);
  }

  public getPublicRoomStats(): { totalOnlinePlayers: number; activeRooms: number } {
    let totalOnlinePlayers = 0;
    for (const r of this.rooms.values()) {
      totalOnlinePlayers += r.players.size;
    }
    return {
      totalOnlinePlayers,
      activeRooms: this.rooms.size,
    };
  }

  public dispose(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
  }
}
