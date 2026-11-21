import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
  GameSettings,
  HudState,
  KillFeedItem,
  MapDefinition,
  MatchResultSummary,
  NetPlayerSnapshot,
  PlayerInputState,
  ServerWsMessage,
  SkinId,
  TeamId,
  WeaponId,
} from '../shared/types.ts';
import { WEAPON_ORDER, WEAPONS, xpForLevel } from '../shared/weapons.ts';
import type { EngineMatchConfig, LocalMatchHooks, MultiplayerClient } from '../net/MultiplayerClient.ts';
import { soundEngine } from './audio.ts';
import { createCharacterAvatar, type CharacterAvatar } from './characterModel.ts';
import { EffectsPool } from './effectsPool.ts';
import { buildArenaScene, type BuiltMapScene } from './mapBuilder.ts';
import { createWeaponViewmodel, type WeaponViewmodel } from './weaponModels.ts';

interface RemoteActor {
  id: string;
  snapshot: NetPlayerSnapshot;
  avatar: CharacterAvatar;
  renderX: number;
  renderY: number;
  renderZ: number;
  renderYaw: number;
  hitFlashTimer: number;
}

interface BotActor {
  id: string;
  name: string;
  team: TeamId;
  body: PhysicsBody;
  health: number;
  maxHealth: number;
  alive: boolean;
  respawnTimer: number;
  weapon: WeaponId;
  kills: number;
  deaths: number;
  score: number;
  fireCooldown: number;
  strafeDir: number;
  strafeTimer: number;
  targetYaw: number;
  targetPitch: number;
  avatar: CharacterAvatar;
  hitFlashTimer: number;
}

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

export class GameEngine {
  private container: HTMLElement;
  private config: EngineMatchConfig;
  private settings: GameSettings;
  private hooks: LocalMatchHooks;
  private mpClient: MultiplayerClient | null;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private pmremTexture: THREE.Texture | null = null;
  private builtMap: BuiltMapScene | null = null;
  private effects!: EffectsPool;
  private isSoftwareGl = false;

  private mapDef: MapDefinition;
  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private hudEmitTimer = 0;
  private fpsFrames = 0;
  private fpsTimer = 0;
  private currentFps = 60;

  // Local Player State
  private localBody: PhysicsBody = {
    x: 0,
    y: 0.1,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    grounded: true,
    crouching: false,
    sprinting: false,
  };
  private localHealth = 100;
  private localAlive = true;
  private localRespawnTimer = 0;
  private localKillerName: string | undefined;
  private localTeam: TeamId;
  private localKills = 0;
  private localDeaths = 0;
  private localScore = 0;
  private localStreak = 0;
  private localShotsFired = 0;
  private localShotsHit = 0;
  private localHeadshots = 0;

  // Weapon & Viewmodel State
  private currentWeapon: WeaponId;
  private weaponAmmo: Record<WeaponId, number>;
  private reloading = false;
  private reloadTimer = 0;
  private fireCooldown = 0;
  private isScoped = false;
  private viewmodel: WeaponViewmodel | null = null;
  private viewmodelAnchor = new THREE.Group();
  private recoilKickZ = 0;
  private recoilKickPitch = 0;
  private muzzleFlashTimer = 0;
  private bobPhase = 0;
  private footstepTimer = 0;
  private currentEyeHeight = PLAYER_EYE_STAND;

  // Input State
  private keys = new Set<string>();
  private mouseFireHeld = false;
  private touchMove = { x: 0, y: 0 };
  private touchFireHeld = false;
  private touchSprint = false;
  private touchCrouch = false;
  private pendingTouchJump = false;
  private isPointerLocked = false;
  private paused = false;

  // Networking & Reconciliation
  private inputSeq = 0;
  private pendingInputs: PlayerInputState[] = [];
  private netSendTimer = 0;
  private remoteActors = new Map<string, RemoteActor>();
  private unsubWs: (() => void) | null = null;

  // Local Bots (Practice / Bot Match)
  private bots: BotActor[] = [];
  private botKillFeed: KillFeedItem[] = [];
  private matchTimeRemaining = 240;
  private teamScores: [number, number] = [0, 0];
  private matchEnded = false;
  private matchResult: MatchResultSummary | null = null;

  // Feedback State
  private hitmarkerState = { active: false, headshot: false, kill: false, id: 0 };
  private hitmarkerTimer = 0;
  private damageFlash = 0;
  private onlineSnapshots: NetPlayerSnapshot[] = [];

  constructor(
    container: HTMLElement,
    config: EngineMatchConfig,
    settings: GameSettings,
    hooks: LocalMatchHooks,
    mpClient: MultiplayerClient | null,
  ) {
    this.container = container;
    this.config = config;
    this.settings = settings;
    this.hooks = hooks;
    this.mpClient = mpClient;
    this.mapDef = MAPS[config.mapId];
    this.localTeam = config.localTeam;
    this.currentWeapon = config.initialWeapon;
    this.matchTimeRemaining = config.initialTimeRemaining ?? (config.mode === 'practice' ? 999 : 180);

    this.weaponAmmo = {
      ar: WEAPONS.ar.magSize,
      sniper: WEAPONS.sniper.magSize,
      smg: WEAPONS.smg.magSize,
      shotgun: WEAPONS.shotgun.magSize,
      pistol: WEAPONS.pistol.magSize,
    };

    soundEngine.setSettings(settings.masterVolume, settings.muted);

    this.initThree();
    this.spawnLocalInitial();
    this.equipWeapon(this.currentWeapon, this.config.skin);

    if (this.config.isOnline && this.mpClient) {
      this.setupMultiplayer();
    } else {
      this.setupOfflineOrBots();
    }

    this.bindInputs();
    this.lastTime = performance.now();
    this.tick();
  }

  private detectSoftwareGl(): boolean {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private initThree(): void {
    this.isSoftwareGl = this.detectSoftwareGl();
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && this.settings.graphicsQuality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    const qualityRatioCap =
      this.settings.graphicsQuality === 'low' ? 1 : this.settings.graphicsQuality === 'medium' ? 1.5 : 2;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, qualityRatioCap));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && this.settings.graphicsQuality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    // Mandatory studio environment reflection
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.pmremTexture = pmrem.fromScene(roomEnv, 0.04).texture;
    this.scene.environment = this.pmremTexture;
    roomEnv.dispose();
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, width / height, 0.08, 280);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.camera.add(this.viewmodelAnchor);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.builtMap = buildArenaScene(
      this.mapDef,
      this.scene,
      maxAniso,
      this.settings.graphicsQuality,
      this.isSoftwareGl,
    );
    this.effects = new EffectsPool(this.scene);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private spawnLocalInitial(): void {
    const teamSpawns = this.mapDef.spawns.filter(
      (s) => this.config.subMode === 'ffa' || s.team === this.localTeam || s.team === 0,
    );
    const list = teamSpawns.length > 0 ? teamSpawns : this.mapDef.spawns;
    const sp = list[Math.floor(Math.random() * list.length)];
    this.localBody.x = sp.x;
    this.localBody.y = sp.y;
    this.localBody.z = sp.z;
    this.localBody.vx = 0;
    this.localBody.vy = 0;
    this.localBody.vz = 0;
    this.localBody.yaw = sp.yaw;
    this.localBody.pitch = 0;
    this.localHealth = 100;
    this.localAlive = true;

    if (this.config.initialPlayers) {
      const me = this.config.initialPlayers.find((p) => p.id === this.config.playerId);
      if (me) {
        this.localBody.x = me.x;
        this.localBody.y = me.y;
        this.localBody.z = me.z;
        this.localBody.yaw = me.yaw;
      }
      this.syncRemoteActors(this.config.initialPlayers);
    }
  }

  private setupMultiplayer(): void {
    if (!this.mpClient) return;
    this.unsubWs = this.mpClient.onMessage((msg) => {
      this.handleServerMessage(msg);
    });
  }

  private handleServerMessage(msg: ServerWsMessage): void {
    if (msg.type === 'snapshot') {
      this.matchTimeRemaining = msg.timeRemaining;
      this.teamScores = msg.teamScores;
      this.onlineSnapshots = msg.players;

      const me = msg.players.find((p) => p.id === this.config.playerId);
      if (me) {
        const wasDead = !this.localAlive;
        this.localHealth = me.health;
        this.localAlive = me.alive;
        this.localRespawnTimer = me.respawnTimer;
        this.localKills = me.kills;
        this.localDeaths = me.deaths;
        this.localScore = me.score;
        this.localTeam = me.team;

        if (!this.localAlive) {
          this.isScoped = false;
        }
        if (wasDead && this.localAlive) {
          // Respawned: snap to authoritative spawn position & refill mags
          this.localBody.x = me.x;
          this.localBody.y = me.y;
          this.localBody.z = me.z;
          this.localBody.vx = 0;
          this.localBody.vy = 0;
          this.localBody.vz = 0;
          this.localBody.yaw = me.yaw;
          this.localBody.pitch = me.pitch;
          this.pendingInputs = [];
          this.refillAllAmmo();
        } else if (this.localAlive) {
          // Server reconciliation: discard acked inputs, replay remaining
          this.pendingInputs = this.pendingInputs.filter((inp) => inp.seq > msg.ackSeq);
          const simBody: PhysicsBody = {
            x: me.x,
            y: me.y,
            z: me.z,
            vx: me.vx,
            vy: me.vy,
            vz: me.vz,
            yaw: this.localBody.yaw,
            pitch: this.localBody.pitch,
            grounded: me.grounded,
            crouching: me.crouching,
            sprinting: me.sprinting,
          };
          const speedMult = WEAPONS[this.currentWeapon].moveSpeedMult;
          for (const inp of this.pendingInputs) {
            stepPlayerPhysics(simBody, inp, this.mapDef, speedMult);
          }
          const drift = Math.hypot(
            simBody.x - this.localBody.x,
            simBody.y - this.localBody.y,
            simBody.z - this.localBody.z,
          );
          if (drift > 0.35) {
            this.localBody.x = THREE.MathUtils.lerp(this.localBody.x, simBody.x, 0.5);
            this.localBody.y = THREE.MathUtils.lerp(this.localBody.y, simBody.y, 0.5);
            this.localBody.z = THREE.MathUtils.lerp(this.localBody.z, simBody.z, 0.5);
            this.localBody.vx = simBody.vx;
            this.localBody.vy = simBody.vy;
            this.localBody.vz = simBody.vz;
          }
        }
      }

      this.syncRemoteActors(msg.players);
    } else if (msg.type === 'shot_fx') {
      if (msg.shooterId !== this.config.playerId) {
        const spec = WEAPONS[msg.weapon];
        const dist = Math.hypot(
          msg.origin[0] - this.localBody.x,
          msg.origin[1] - this.localBody.y,
          msg.origin[2] - this.localBody.z,
        );
        soundEngine.playShot(msg.weapon, Math.max(0.1, 1 - dist / 45));
        for (const hit of msg.hits) {
          this.effects.spawnTracer(msg.origin, hit, spec.tracerColor, 0.09);
          this.effects.spawnImpact(hit, 3);
        }
      }
    } else if (msg.type === 'hit_confirm') {
      this.localShotsHit += 1;
      if (msg.headshot) this.localHeadshots += 1;
      if (msg.killed) this.localStreak += 1;
      this.triggerHitmarker(msg.headshot, msg.killed);
      const actor = this.remoteActors.get(msg.targetId);
      if (actor) actor.hitFlashTimer = 0.1;
    } else if (msg.type === 'damaged') {
      this.damageFlash = 1.0;
      this.localKillerName = msg.attackerName;
      soundEngine.playDamageTaken();
    } else if (msg.type === 'kill_feed') {
      this.botKillFeed = [msg.event, ...this.botKillFeed].slice(0, 5);
    } else if (msg.type === 'match_end') {
      this.matchEnded = true;
      this.matchResult = msg.summary;
      if (this.isPointerLocked) document.exitPointerLock?.();
    }
  }

  private syncRemoteActors(players: NetPlayerSnapshot[]): void {
    const activeIds = new Set<string>();
    for (const p of players) {
      if (p.id === this.config.playerId) continue;
      activeIds.add(p.id);
      let actor = this.remoteActors.get(p.id);
      if (!actor) {
        const avatar = createCharacterAvatar(p.team);
        const isAlly = this.config.subMode === 'tdm' && p.team === this.localTeam;
        avatar.setTeamColor(p.team, isAlly);
        avatar.setWeaponPose(p.weapon);
        avatar.root.position.set(p.x, p.y, p.z);
        this.scene.add(avatar.root);
        actor = {
          id: p.id,
          snapshot: p,
          avatar,
          renderX: p.x,
          renderY: p.y,
          renderZ: p.z,
          renderYaw: p.yaw,
          hitFlashTimer: 0,
        };
        this.remoteActors.set(p.id, actor);
      } else {
        actor.snapshot = p;
        const isAlly = this.config.subMode === 'tdm' && p.team === this.localTeam;
        actor.avatar.setTeamColor(p.team, isAlly);
        actor.avatar.setWeaponPose(p.weapon);
      }
      actor.avatar.root.visible = p.alive;
    }

    for (const [id, actor] of this.remoteActors) {
      if (!activeIds.has(id)) {
        this.scene.remove(actor.avatar.root);
        actor.avatar.dispose();
        this.remoteActors.delete(id);
      }
    }
  }

  private setupOfflineOrBots(): void {
    const botNames = ['Vortex-AI', 'Kestrel-02', 'Cipher-7', 'PulseUnit', 'Stryker-X', 'Nova-9'];
    const botWeapons: WeaponId[] = ['ar', 'smg', 'shotgun', 'sniper', 'pistol'];
    const botCount = this.config.mode === 'practice' ? 3 : 5;

    for (let i = 0; i < botCount; i++) {
      const team: TeamId = this.config.subMode === 'tdm' ? (i % 2 === 0 ? 2 : 1) : 0;
      const sp = this.pickBestSpawn(team);
      const weapon = botWeapons[i % botWeapons.length];
      const avatar = createCharacterAvatar(team);
      const isAlly = this.config.subMode === 'tdm' && team === this.localTeam;
      avatar.setTeamColor(team, isAlly);
      avatar.setWeaponPose(weapon);
      avatar.root.position.set(sp.x, sp.y, sp.z);
      this.scene.add(avatar.root);

      this.bots.push({
        id: `bot_${i}`,
        name: botNames[i % botNames.length],
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
        weapon,
        kills: 0,
        deaths: 0,
        score: 0,
        fireCooldown: 1 + Math.random(),
        strafeDir: Math.random() > 0.5 ? 1 : -1,
        strafeTimer: 1.5,
        targetYaw: sp.yaw,
        targetPitch: 0,
        avatar,
        hitFlashTimer: 0,
      });
    }
  }

  private pickBestSpawn(team: TeamId): { x: number; y: number; z: number; yaw: number } {
    const pool = this.mapDef.spawns.filter(
      (s) => this.config.subMode === 'ffa' || s.team === team || s.team === 0,
    );
    const list = pool.length > 0 ? pool : this.mapDef.spawns;
    // Choose spawn farthest from local player & bots
    let best = list[0];
    let bestScore = -1;
    for (const sp of list) {
      let minDist = Math.hypot(sp.x - this.localBody.x, sp.z - this.localBody.z);
      for (const b of this.bots) {
        if (!b.alive) continue;
        minDist = Math.min(minDist, Math.hypot(sp.x - b.body.x, sp.z - b.body.z));
      }
      if (minDist > bestScore) {
        bestScore = minDist;
        best = sp;
      }
    }
    return best;
  }

  public equipWeapon(weapon: WeaponId, skin?: SkinId): void {
    if (this.viewmodel) {
      this.viewmodelAnchor.remove(this.viewmodel.group);
      this.viewmodel.dispose();
    }
    this.currentWeapon = weapon;
    this.reloading = false;
    this.reloadTimer = 0;
    this.isScoped = false;
    this.viewmodel = createWeaponViewmodel(weapon, skin ?? this.config.skin);
    this.viewmodelAnchor.add(this.viewmodel.group);
    if (this.config.isOnline && this.mpClient) {
      this.mpClient.send({ type: 'switch_weapon', weapon });
    }
  }

  private refillAllAmmo(): void {
    for (const w of WEAPON_ORDER) {
      this.weaponAmmo[w] = WEAPONS[w].magSize;
    }
  }

  public updateSettings(next: GameSettings): void {
    const prevQuality = this.settings.graphicsQuality;
    this.settings = next;
    soundEngine.setSettings(next.masterVolume, next.muted);
    if (this.camera) {
      this.camera.fov = next.fov;
      this.camera.updateProjectionMatrix();
    }
    if (prevQuality !== next.graphicsQuality && this.builtMap) {
      this.builtMap.dispose();
      const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
      this.builtMap = buildArenaScene(
        this.mapDef,
        this.scene,
        maxAniso,
        next.graphicsQuality,
        this.isSoftwareGl,
      );
      this.renderer.shadowMap.enabled = !this.isSoftwareGl && next.graphicsQuality !== 'low';
    }
  }

  public requestPointerLock(): void {
    if (!this.settings.mobileControls.enabled && !this.matchEnded) {
      this.renderer.domElement.requestPointerLock?.();
    }
  }

  public setPaused(p: boolean): void {
    this.paused = p;
    if (p) {
      this.keys.clear();
      this.mouseFireHeld = false;
      this.isScoped = false;
      if (this.isPointerLocked) {
        document.exitPointerLock?.();
      }
    }
    this.hooks.onPauseToggle(p);
  }

  // Mobile Touch Control APIs
  public setTouchMove(x: number, y: number): void {
    this.touchMove.x = Math.max(-1, Math.min(1, x));
    this.touchMove.y = Math.max(-1, Math.min(1, y));
  }

  public addTouchLook(dx: number, dy: number): void {
    if (!this.localAlive || this.paused || this.matchEnded) return;
    const sens = 0.0032 * this.settings.touchSensitivity * (this.isScoped ? this.settings.adsSensitivityMult : 1);
    this.localBody.yaw -= dx * sens;
    this.localBody.pitch = Math.max(-1.48, Math.min(1.48, this.localBody.pitch - dy * sens));
  }

  public setTouchFire(firing: boolean): void {
    this.touchFireHeld = firing;
    if (firing && !WEAPONS[this.currentWeapon].automatic) {
      this.tryShoot();
    }
  }

  public triggerJump(): void {
    this.pendingTouchJump = true;
  }

  public toggleCrouch(): void {
    this.touchCrouch = !this.touchCrouch;
  }

  public toggleSprint(): void {
    this.touchSprint = !this.touchSprint;
  }

  public toggleScope(): void {
    if (this.localAlive && !this.reloading) {
      this.isScoped = !this.isScoped;
    }
  }

  public triggerReload(): void {
    this.startReload();
  }

  public cycleWeapon(): void {
    const idx = WEAPON_ORDER.indexOf(this.currentWeapon);
    const next = WEAPON_ORDER[(idx + 1) % WEAPON_ORDER.length];
    this.equipWeapon(next);
  }

  private bindInputs(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  private onResize = (): void => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onPointerLockChange = (): void => {
    this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.isPointerLocked && !this.settings.mobileControls.enabled && !this.matchEnded) {
      this.keys.clear();
      this.mouseFireHeld = false;
      this.isScoped = false;
      this.paused = true;
      this.hooks.onPauseToggle(true);
    } else if (this.isPointerLocked) {
      this.paused = false;
      this.hooks.onPauseToggle(false);
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') {
      e.preventDefault();
      this.hooks.onScoreboardToggle(true);
      return;
    }
    if (this.paused || this.matchEnded) return;
    this.keys.add(e.code);

    if (e.code === 'KeyR') this.startReload();
    else if (e.code === 'Digit1') this.equipWeapon('ar');
    else if (e.code === 'Digit2') this.equipWeapon('sniper');
    else if (e.code === 'Digit3') this.equipWeapon('smg');
    else if (e.code === 'Digit4') this.equipWeapon('shotgun');
    else if (e.code === 'Digit5') this.equipWeapon('pistol');
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Tab') {
      e.preventDefault();
      this.hooks.onScoreboardToggle(false);
      return;
    }
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isPointerLocked || this.paused || !this.localAlive || this.matchEnded) return;
    const sens =
      0.0022 * this.settings.mouseSensitivity * (this.isScoped ? this.settings.adsSensitivityMult : 1);
    this.localBody.yaw -= e.movementX * sens;
    this.localBody.pitch = Math.max(-1.48, Math.min(1.48, this.localBody.pitch - e.movementY * sens));
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.settings.mobileControls.enabled) return;
    if (!this.isPointerLocked || this.paused || this.matchEnded) return;
    if (e.button === 0) {
      this.mouseFireHeld = true;
      this.tryShoot();
    } else if (e.button === 2) {
      if (this.localAlive && !this.reloading) {
        this.isScoped = true;
      }
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseFireHeld = false;
    else if (e.button === 2) this.isScoped = false;
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.isPointerLocked) e.preventDefault();
  };

  private startReload(): void {
    const spec = WEAPONS[this.currentWeapon];
    if (this.reloading || !this.localAlive) return;
    if (this.weaponAmmo[this.currentWeapon] >= spec.magSize) return;
    this.reloading = true;
    this.isScoped = false;
    this.reloadTimer = spec.reloadTimeSec;
    soundEngine.playReload();
    if (this.config.isOnline && this.mpClient) {
      this.mpClient.send({ type: 'reload' });
    }
  }

  private tryShoot(): void {
    if (!this.localAlive || this.reloading || this.fireCooldown > 0 || this.paused || this.matchEnded) {
      return;
    }
    const spec = WEAPONS[this.currentWeapon];
    if (this.weaponAmmo[this.currentWeapon] <= 0) {
      this.startReload();
      return;
    }

    this.weaponAmmo[this.currentWeapon] -= 1;
    this.fireCooldown = 60 / spec.fireRateRpm;
    this.localShotsFired += 1;

    soundEngine.playShot(this.currentWeapon, 1);
    this.muzzleFlashTimer = 0.045;
    this.recoilKickZ = Math.min(0.14, this.recoilKickZ + 0.055);
    this.recoilKickPitch = Math.min(0.24, this.recoilKickPitch + spec.recoilPitch * 1.4);

    // Apply subtle camera recoil
    this.localBody.pitch = Math.min(1.48, this.localBody.pitch + spec.recoilPitch);
    this.localBody.yaw += (Math.random() - 0.5) * spec.recoilYaw;

    // Eye origin & forward direction
    const eyeY = this.localBody.y + (this.localBody.crouching ? PLAYER_EYE_CROUCH : PLAYER_EYE_STAND);
    const origin: [number, number, number] = [this.localBody.x, eyeY, this.localBody.z];

    _euler.set(this.localBody.pitch, this.localBody.yaw, 0, 'YXZ');
    _vecA.set(0, 0, -1).applyEuler(_euler).normalize();

    const speed = Math.hypot(this.localBody.vx, this.localBody.vz);
    const spread = this.isScoped
      ? spec.spreadAds
      : speed > 1.5 || !this.localBody.grounded
        ? spec.spreadMoving
        : spec.spreadBase;

    // Muzzle world position for visual tracer origin
    let muzzleOrigin: [number, number, number] = origin;
    if (this.viewmodel) {
      this.viewmodel.muzzlePoint.getWorldPosition(_vecB);
      muzzleOrigin = [_vecB.x, _vecB.y, _vecB.z];
    }

    if (this.config.isOnline && this.mpClient) {
      // Send exact look direction; server spawns pellets/checks authoritative hits
      this.mpClient.send({
        type: 'shoot',
        weapon: this.currentWeapon,
        origin,
        dir: [_vecA.x, _vecA.y, _vecA.z],
        clientTime: performance.now(),
      });

      // Local optimistic tracer visuals
      for (let i = 0; i < spec.pellets; i++) {
        const dx = _vecA.x + (Math.random() - 0.5) * spread * 2;
        const dy = _vecA.y + (Math.random() - 0.5) * spread * 2;
        const dz = _vecA.z + (Math.random() - 0.5) * spread * 2;
        const len = Math.hypot(dx, dy, dz);
        const dir: [number, number, number] = [dx / len, dy / len, dz / len];
        const mapHit = raycastMap(origin, dir, spec.range, this.mapDef);
        const endPt: [number, number, number] = mapHit
          ? mapHit.point
          : [origin[0] + dir[0] * spec.range, origin[1] + dir[1] * spec.range, origin[2] + dir[2] * spec.range];
        this.effects.spawnTracer(muzzleOrigin, endPt, spec.tracerColor, 0.085);
        if (mapHit) this.effects.spawnImpact(mapHit.point, 3);
      }
    } else {
      // Offline Practice / Bot Match Hitscan Resolution
      for (let i = 0; i < spec.pellets; i++) {
        const dx = _vecA.x + (Math.random() - 0.5) * spread * 2;
        const dy = _vecA.y + (Math.random() - 0.5) * spread * 2;
        const dz = _vecA.z + (Math.random() - 0.5) * spread * 2;
        const len = Math.hypot(dx, dy, dz);
        const dir: [number, number, number] = [dx / len, dy / len, dz / len];

        const mapHit = raycastMap(origin, dir, spec.range, this.mapDef);
        let maxDist = mapHit ? mapHit.distance : spec.range;
        let hitBot: BotActor | null = null;
        let isHead = false;
        let hitPt: [number, number, number] = mapHit
          ? mapHit.point
          : [origin[0] + dir[0] * maxDist, origin[1] + dir[1] * maxDist, origin[2] + dir[2] * maxDist];

        for (const bot of this.bots) {
          if (!bot.alive) continue;
          if (this.config.subMode === 'tdm' && bot.team === this.localTeam) continue;
          const bHit = raycastPlayerHitbox(
            origin,
            dir,
            maxDist,
            bot.body.x,
            bot.body.y,
            bot.body.z,
            bot.body.crouching,
          );
          if (bHit && bHit.distance < maxDist) {
            maxDist = bHit.distance;
            hitBot = bot;
            isHead = bHit.headshot;
            hitPt = bHit.point;
          }
        }

        this.effects.spawnTracer(muzzleOrigin, hitPt, spec.tracerColor, 0.085);
        this.effects.spawnImpact(hitPt, hitBot ? 5 : 3);

        if (hitBot) {
          this.localShotsHit += 1;
          if (isHead) this.localHeadshots += 1;
          const dmg = isHead ? spec.damageHead : spec.damageBody;
          hitBot.health -= dmg;
          hitBot.hitFlashTimer = 0.12;
          const killed = hitBot.health <= 0;
          this.triggerHitmarker(isHead, killed);
          if (killed) {
            this.handleBotEliminated(hitBot, this.config.playerId, this.config.playerName, this.localTeam, this.currentWeapon, isHead);
          }
        }
      }
    }

    if (this.weaponAmmo[this.currentWeapon] === 0) {
      this.startReload();
    }
  }

  private handleBotEliminated(
    victim: BotActor,
    killerId: string,
    killerName: string,
    killerTeam: TeamId,
    weapon: WeaponId,
    headshot: boolean,
  ): void {
    victim.alive = false;
    victim.health = 0;
    victim.deaths += 1;
    victim.respawnTimer = 2.5;
    victim.avatar.root.visible = false;

    if (killerId === this.config.playerId) {
      this.localKills += 1;
      this.localStreak += 1;
      this.localScore += headshot ? 125 : 100;
    } else {
      const kb = this.bots.find((b) => b.id === killerId);
      if (kb) {
        kb.kills += 1;
        kb.score += headshot ? 125 : 100;
      }
    }

    if (this.config.subMode === 'tdm') {
      if (killerTeam === 1) this.teamScores[0] += 1;
      else if (killerTeam === 2) this.teamScores[1] += 1;
    }

    this.botKillFeed = [
      {
        id: `${Date.now()}_${Math.random()}`,
        killerId,
        killerName,
        killerTeam,
        victimId: victim.id,
        victimName: victim.name,
        victimTeam: victim.team,
        weapon,
        headshot,
        timestamp: Date.now(),
      },
      ...this.botKillFeed,
    ].slice(0, 5);

    if (this.config.mode !== 'practice') {
      const targetKills = this.config.subMode === 'tdm' ? 30 : 20;
      if (
        (this.config.subMode === 'ffa' && this.localKills >= targetKills) ||
        (this.config.subMode === 'tdm' && (this.teamScores[0] >= targetKills || this.teamScores[1] >= targetKills))
      ) {
        this.finishLocalMatch();
      }
    }
  }

  private triggerHitmarker(headshot: boolean, kill: boolean): void {
    this.hitmarkerState = { active: true, headshot, kill, id: this.hitmarkerState.id + 1 };
    this.hitmarkerTimer = 0.16;
    soundEngine.playHitmarker(headshot, kill);
  }

  private finishLocalMatch(): void {
    if (this.matchEnded) return;
    this.matchEnded = true;
    if (this.isPointerLocked) document.exitPointerLock?.();

    const board = [
      {
        id: this.config.playerId,
        name: this.config.playerName,
        team: this.localTeam,
        kills: this.localKills,
        deaths: this.localDeaths,
        score: this.localScore,
        accuracy: this.localShotsFired > 0 ? Math.round((this.localShotsHit / this.localShotsFired) * 100) : 0,
        isBot: false,
      },
      ...this.bots.map((b) => ({
        id: b.id,
        name: b.name,
        team: b.team,
        kills: b.kills,
        deaths: b.deaths,
        score: b.score,
        accuracy: 28,
        isBot: true,
      })),
    ].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

    let winnerName = board[0]?.name ?? this.config.playerName;
    let winnerTeam: TeamId = board[0]?.team ?? this.localTeam;
    let won = board[0]?.id === this.config.playerId;

    if (this.config.subMode === 'tdm') {
      winnerTeam = this.teamScores[0] >= this.teamScores[1] ? 1 : 2;
      winnerName = winnerTeam === 1 ? 'COBALT SQUAD' : 'CRIMSON SQUAD';
      won = winnerTeam === this.localTeam;
    }

    const acc = this.localShotsFired > 0 ? Math.round((this.localShotsHit / this.localShotsFired) * 100) : 0;
    const xpEarned = this.localKills * 35 + (won ? 120 : 45) + this.localHeadshots * 15;

    this.matchResult = {
      winnerName,
      winnerTeam,
      mode: this.config.subMode,
      teamScores: [...this.teamScores] as [number, number],
      scoreboard: board,
      localStats: {
        kills: this.localKills,
        deaths: this.localDeaths,
        score: this.localScore,
        shotsFired: this.localShotsFired,
        shotsHit: this.localShotsHit,
        headshots: this.localHeadshots,
        accuracy: acc,
        xpEarned,
        won,
      },
    };
    this.hooks.onLocalMatchFinish?.(this.matchResult);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    // FPS Counter
    this.fpsFrames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsTimer);
      this.fpsFrames = 0;
      this.fpsTimer = 0;
    }

    this.updateLocalPlayer(dt, now);
    if (!this.config.isOnline) {
      this.updateBots(dt);
    } else {
      this.updateRemoteActors(dt, now);
    }
    this.effects.update(dt);
    this.updateCameraAndViewmodel(dt);

    this.renderer.render(this.scene, this.camera);

    this.hudEmitTimer += dt;
    if (this.hudEmitTimer >= 0.05) {
      this.hudEmitTimer = 0;
      this.emitHudState();
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateLocalPlayer(dt: number, nowMs: number): void {
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
      if (this.hitmarkerTimer <= 0) this.hitmarkerState.active = false;
    }
    if (this.damageFlash > 0) {
      this.damageFlash = Math.max(0, this.damageFlash - dt * 2.8);
    }
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.muzzleFlashTimer > 0) this.muzzleFlashTimer -= dt;

    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.weaponAmmo[this.currentWeapon] = WEAPONS[this.currentWeapon].magSize;
      }
    }

    if (!this.config.isOnline && !this.matchEnded && this.config.mode !== 'practice') {
      this.matchTimeRemaining = Math.max(0, this.matchTimeRemaining - dt);
      if (this.matchTimeRemaining <= 0) {
        this.finishLocalMatch();
        return;
      }
    }

    if (!this.localAlive) {
      if (!this.config.isOnline) {
        this.localRespawnTimer -= dt;
        if (this.localRespawnTimer <= 0) {
          const sp = this.pickBestSpawn(this.localTeam);
          this.localBody.x = sp.x;
          this.localBody.y = sp.y;
          this.localBody.z = sp.z;
          this.localBody.vx = 0;
          this.localBody.vy = 0;
          this.localBody.vz = 0;
          this.localBody.yaw = sp.yaw;
          this.localBody.pitch = 0;
          this.localHealth = 100;
          this.localAlive = true;
          this.localKillerName = undefined;
          this.refillAllAmmo();
        }
      }
      return;
    }

    if (this.paused || this.matchEnded) return;

    // Collect Keyboard + Touch inputs
    let fwd = 0;
    let right = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fwd += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fwd -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) right += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) right -= 1;

    if (Math.abs(this.touchMove.x) > 0.08 || Math.abs(this.touchMove.y) > 0.08) {
      fwd += this.touchMove.y;
      right += this.touchMove.x;
    }
    fwd = Math.max(-1, Math.min(1, fwd));
    right = Math.max(-1, Math.min(1, right));

    const jump = this.keys.has('Space') || this.pendingTouchJump;
    this.pendingTouchJump = false;
    const crouch = this.keys.has('KeyC') || this.keys.has('ControlLeft') || this.touchCrouch;
    const sprint = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchSprint) && !this.isScoped;

    this.inputSeq += 1;
    const inp: PlayerInputState = {
      seq: this.inputSeq,
      dt,
      forward: fwd,
      right,
      yaw: this.localBody.yaw,
      pitch: this.localBody.pitch,
      jump,
      crouch,
      sprint,
    };

    stepPlayerPhysics(this.localBody, inp, this.mapDef, WEAPONS[this.currentWeapon].moveSpeedMult);

    // Footstep Audio
    const hSpeed = Math.hypot(this.localBody.vx, this.localBody.vz);
    if (this.localBody.grounded && hSpeed > 2.2) {
      this.bobPhase += dt * (this.localBody.sprinting ? 14 : 10);
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = this.localBody.sprinting ? 0.29 : 0.42;
        soundEngine.playFootstep();
      }
    } else {
      this.bobPhase = THREE.MathUtils.lerp(this.bobPhase, 0, dt * 4);
    }

    // Automatic firing
    if ((this.mouseFireHeld || this.touchFireHeld) && WEAPONS[this.currentWeapon].automatic) {
      this.tryShoot();
    }

    // Send input to multiplayer server
    if (this.config.isOnline && this.mpClient) {
      this.pendingInputs.push(inp);
      if (this.pendingInputs.length > 90) this.pendingInputs.shift();

      this.netSendTimer += dt;
      if (this.netSendTimer >= 0.033 || jump) {
        this.netSendTimer = 0;
        this.mpClient.send({
          type: 'input',
          ...inp,
        });
      }
    }
    void nowMs;
  }

  private updateBots(dt: number): void {
    const nowSec = performance.now() / 1000;
    for (const bot of this.bots) {
      if (bot.hitFlashTimer > 0) {
        bot.hitFlashTimer -= dt;
        bot.avatar.setHitFlash(bot.hitFlashTimer > 0);
      }

      if (!bot.alive) {
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) {
          const sp = this.pickBestSpawn(bot.team);
          bot.body.x = sp.x;
          bot.body.y = sp.y;
          bot.body.z = sp.z;
          bot.body.vx = 0;
          bot.body.vy = 0;
          bot.body.vz = 0;
          bot.health = bot.maxHealth;
          bot.alive = true;
          bot.avatar.root.visible = true;
        }
        continue;
      }

      // Target acquisition: find nearest living enemy (player or opposing bot)
      let targetX = this.localBody.x;
      let targetY = this.localBody.y + 1.25;
      let targetZ = this.localBody.z;
      let targetId: string | null = null;
      let bestDist = Infinity;

      const canTargetPlayer =
        this.config.mode !== 'practice' &&
        this.localAlive &&
        (this.config.subMode === 'ffa' || bot.team !== this.localTeam);

      if (canTargetPlayer) {
        bestDist = Math.hypot(targetX - bot.body.x, targetZ - bot.body.z);
        targetId = this.config.playerId;
      }

      for (const other of this.bots) {
        if (other.id === bot.id || !other.alive) continue;
        if (this.config.subMode === 'tdm' && other.team === bot.team) continue;
        const d = Math.hypot(other.body.x - bot.body.x, other.body.z - bot.body.z);
        if (d < bestDist) {
          bestDist = d;
          targetX = other.body.x;
          targetY = other.body.y + 1.25;
          targetZ = other.body.z;
          targetId = other.id;
        }
      }

      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = 1.1 + Math.random() * 1.4;
        bot.strafeDir = Math.random() > 0.5 ? 1 : -1;
      }

      let fwd = 0.6;
      let right = bot.strafeDir * 0.55;
      let jump = false;

      if (this.config.mode === 'practice') {
        // Practice bots patrol gently around arena for target practice
        bot.targetYaw += dt * 0.35 * bot.strafeDir;
        fwd = 0.35;
        right = 0;
      } else if (targetId) {
        const dx = targetX - bot.body.x;
        const dy = targetY - (bot.body.y + 1.45);
        const dz = targetZ - bot.body.z;
        const horiz = Math.max(0.1, Math.hypot(dx, dz));
        const desiredYaw = Math.atan2(-dx, -dz);
        const desiredPitch = Math.atan2(dy, horiz);

        // Smooth aim tracking
        let yawDiff = desiredYaw - bot.targetYaw;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        bot.targetYaw += yawDiff * Math.min(1, dt * 6);
        bot.targetPitch = THREE.MathUtils.lerp(bot.targetPitch, desiredPitch, Math.min(1, dt * 6));

        fwd = horiz > 13 ? 0.9 : horiz < 5 ? -0.4 : 0.25;
        if (Math.random() < 0.006 && bot.body.grounded) jump = true;

        // Line of sight check & shoot
        bot.fireCooldown -= dt;
        const len = Math.hypot(dx, dy, dz);
        const dir: [number, number, number] = [dx / len, dy / len, dz / len];
        const botEye: [number, number, number] = [bot.body.x, bot.body.y + 1.48, bot.body.z];
        const wallCheck = raycastMap(botEye, dir, len, this.mapDef);
        const hasLos = !wallCheck || wallCheck.distance > len - 0.6;

        if (hasLos && bot.fireCooldown <= 0 && Math.abs(yawDiff) < 0.35) {
          const spec = WEAPONS[bot.weapon];
          bot.fireCooldown = Math.max(0.28, (60 / spec.fireRateRpm) * 2.2);
          soundEngine.playShot(bot.weapon, Math.max(0.1, 1 - len / 40));

          // Slight inaccuracy so player can dodge with movement
          const inaccuracy = 0.065;
          const sdx = dir[0] + (Math.random() - 0.5) * inaccuracy;
          const sdy = dir[1] + (Math.random() - 0.5) * inaccuracy;
          const sdz = dir[2] + (Math.random() - 0.5) * inaccuracy;
          const slen = Math.hypot(sdx, sdy, sdz);
          const sdir: [number, number, number] = [sdx / slen, sdy / slen, sdz / slen];

          const mHit = raycastMap(botEye, sdir, spec.range, this.mapDef);
          let mDist = mHit ? mHit.distance : spec.range;
          let hitPt: [number, number, number] = mHit
            ? mHit.point
            : [botEye[0] + sdir[0] * mDist, botEye[1] + sdir[1] * mDist, botEye[2] + sdir[2] * mDist];

          if (targetId === this.config.playerId && this.localAlive) {
            const pHit = raycastPlayerHitbox(
              botEye,
              sdir,
              mDist,
              this.localBody.x,
              this.localBody.y,
              this.localBody.z,
              this.localBody.crouching,
            );
            if (pHit && pHit.distance < mDist) {
              hitPt = pHit.point;
              const dmg = Math.round((pHit.headshot ? spec.damageHead : spec.damageBody) * 0.65);
              this.localHealth -= dmg;
              this.damageFlash = 0.9;
              soundEngine.playDamageTaken();
              if (this.localHealth <= 0) {
                this.localHealth = 0;
                this.localAlive = false;
                this.localDeaths += 1;
                this.localStreak = 0;
                this.localRespawnTimer = 2.5;
                this.localKillerName = bot.name;
                this.isScoped = false;
                bot.kills += 1;
                bot.score += 100;
                if (this.config.subMode === 'tdm') {
                  if (bot.team === 1) this.teamScores[0] += 1;
                  else if (bot.team === 2) this.teamScores[1] += 1;
                }
                this.botKillFeed = [
                  {
                    id: `${Date.now()}_${Math.random()}`,
                    killerId: bot.id,
                    killerName: bot.name,
                    killerTeam: bot.team,
                    victimId: this.config.playerId,
                    victimName: this.config.playerName,
                    victimTeam: this.localTeam,
                    weapon: bot.weapon,
                    headshot: pHit.headshot,
                    timestamp: Date.now(),
                  },
                  ...this.botKillFeed,
                ].slice(0, 5);
              }
            }
          } else {
            const victimBot = this.bots.find((b) => b.id === targetId);
            if (victimBot && victimBot.alive) {
              const bHit = raycastPlayerHitbox(
                botEye,
                sdir,
                mDist,
                victimBot.body.x,
                victimBot.body.y,
                victimBot.body.z,
                victimBot.body.crouching,
              );
              if (bHit && bHit.distance < mDist) {
                hitPt = bHit.point;
                const dmg = bHit.headshot ? spec.damageHead : spec.damageBody;
                victimBot.health -= dmg;
                victimBot.hitFlashTimer = 0.1;
                if (victimBot.health <= 0) {
                  this.handleBotEliminated(victimBot, bot.id, bot.name, bot.team, bot.weapon, bHit.headshot);
                }
              }
            }
          }

          this.effects.spawnTracer(botEye, hitPt, spec.tracerColor, 0.085);
          this.effects.spawnImpact(hitPt, 2);
        }
      }

      stepPlayerPhysics(
        bot.body,
        {
          seq: 0,
          dt,
          forward: fwd,
          right,
          yaw: bot.targetYaw,
          pitch: bot.targetPitch,
          jump,
          crouch: false,
          sprint: fwd > 0.7,
        },
        this.mapDef,
        WEAPONS[bot.weapon].moveSpeedMult,
      );

      // Bounce off walls if stuck
      if (Math.hypot(bot.body.vx, bot.body.vz) < 0.8 && fwd > 0.2) {
        bot.targetYaw += Math.PI * 0.45 * bot.strafeDir;
      }

      bot.avatar.root.position.set(bot.body.x, bot.body.y, bot.body.z);
      bot.avatar.root.rotation.y = bot.body.yaw;
      const spd = Math.hypot(bot.body.vx, bot.body.vz);
      bot.avatar.updateAnimation(spd, bot.body.crouching, bot.body.pitch, nowSec);
    }
  }

  private updateRemoteActors(dt: number, nowMs: number): void {
    const tSec = nowMs / 1000;
    const dampLambda = 18;
    for (const actor of this.remoteActors.values()) {
      const p = actor.snapshot;
      if (actor.hitFlashTimer > 0) {
        actor.hitFlashTimer -= dt;
        actor.avatar.setHitFlash(actor.hitFlashTimer > 0);
      }
      if (!p.alive) continue;

      actor.renderX = THREE.MathUtils.damp(actor.renderX, p.x, dampLambda, dt);
      actor.renderY = THREE.MathUtils.damp(actor.renderY, p.y, dampLambda, dt);
      actor.renderZ = THREE.MathUtils.damp(actor.renderZ, p.z, dampLambda, dt);

      // Shortest-angle yaw damping
      let yawDiff = p.yaw - actor.renderYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      actor.renderYaw += yawDiff * Math.min(1, dt * 18);

      actor.avatar.root.position.set(actor.renderX, actor.renderY, actor.renderZ);
      actor.avatar.root.rotation.y = actor.renderYaw;
      const spd = Math.hypot(p.vx, p.vz);
      actor.avatar.updateAnimation(spd, p.crouching, p.pitch, tSec);
    }
  }

  private updateCameraAndViewmodel(dt: number): void {
    const targetEye = this.localBody.crouching ? PLAYER_EYE_CROUCH : PLAYER_EYE_STAND;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 16, dt);

    const hSpeed = Math.hypot(this.localBody.vx, this.localBody.vz);
    const bobY = this.localBody.grounded && hSpeed > 1.5 ? Math.sin(this.bobPhase) * 0.025 : 0;

    this.camera.position.set(this.localBody.x, this.localBody.y + this.currentEyeHeight + bobY, this.localBody.z);
    this.camera.rotation.set(this.localBody.pitch, this.localBody.yaw, 0, 'YXZ');

    // Dynamic FOV (Sprint + Scope)
    const spec = WEAPONS[this.currentWeapon];
    let targetFov = this.settings.fov;
    if (this.isScoped && this.localAlive) {
      targetFov = spec.adsFov;
    } else if (this.localBody.sprinting && hSpeed > 6) {
      targetFov = this.settings.fov + 5;
    }
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
      this.camera.updateProjectionMatrix();
    }

    // Viewmodel Positioning, Recoil & Reload Animation
    if (this.viewmodel) {
      const hideForSniperScope = this.isScoped && spec.hasScopeOverlay;
      this.viewmodel.group.visible = this.localAlive && !hideForSniperScope;

      this.recoilKickZ = THREE.MathUtils.damp(this.recoilKickZ, 0, 18, dt);
      this.recoilKickPitch = THREE.MathUtils.damp(this.recoilKickPitch, 0, 16, dt);

      const targetX = this.isScoped ? 0.0 : 0.24;
      const targetY = this.isScoped ? -0.14 : -0.22;
      const targetZ = this.isScoped ? -0.34 : -0.44;
      const bobX = this.localBody.grounded && hSpeed > 1.5 && !this.isScoped ? Math.cos(this.bobPhase * 0.5) * 0.012 : 0;
      const reloadDrop = this.reloading ? Math.sin((this.reloadTimer / spec.reloadTimeSec) * Math.PI) * 0.16 : 0;
      const reloadTilt = this.reloading ? 0.45 : 0;

      this.viewmodelAnchor.position.x = THREE.MathUtils.damp(this.viewmodelAnchor.position.x, targetX + bobX, 16, dt);
      this.viewmodelAnchor.position.y = THREE.MathUtils.damp(
        this.viewmodelAnchor.position.y,
        targetY - reloadDrop - Math.abs(bobY) * 0.3,
        16,
        dt,
      );
      this.viewmodelAnchor.position.z = THREE.MathUtils.damp(
        this.viewmodelAnchor.position.z,
        targetZ + this.recoilKickZ,
        20,
        dt,
      );

      const sprintTilt = this.localBody.sprinting && !this.isScoped ? -0.16 : 0;
      this.viewmodelAnchor.rotation.x = THREE.MathUtils.damp(
        this.viewmodelAnchor.rotation.x,
        this.recoilKickPitch + sprintTilt - reloadTilt,
        16,
        dt,
      );

      this.viewmodel.muzzleFlash.visible = this.muzzleFlashTimer > 0 && !hideForSniperScope;
      if (this.viewmodel.muzzleFlash.visible) {
        this.viewmodel.muzzleFlash.rotation.z += dt * 45;
      }
    }
  }

  private emitHudState(): void {
    const spec = WEAPONS[this.currentWeapon];
    const hSpeed = Math.hypot(this.localBody.vx, this.localBody.vz);
    const spreadPx = this.isScoped ? 4 : Math.round(10 + hSpeed * 1.6 + this.recoilKickPitch * 90 + (this.localBody.grounded ? 0 : 12));

    let playersList: NetPlayerSnapshot[] = [];
    if (this.config.isOnline) {
      playersList = this.onlineSnapshots;
    } else {
      playersList = [
        {
          id: this.config.playerId,
          name: this.config.playerName,
          team: this.localTeam,
          x: this.localBody.x,
          y: this.localBody.y,
          z: this.localBody.z,
          vx: this.localBody.vx,
          vy: this.localBody.vy,
          vz: this.localBody.vz,
          yaw: this.localBody.yaw,
          pitch: this.localBody.pitch,
          health: this.localHealth,
          maxHealth: 100,
          alive: this.localAlive,
          crouching: this.localBody.crouching,
          sprinting: this.localBody.sprinting,
          grounded: this.localBody.grounded,
          weapon: this.currentWeapon,
          skin: this.config.skin,
          kills: this.localKills,
          deaths: this.localDeaths,
          score: this.localScore,
          respawnTimer: this.localRespawnTimer,
          isBot: false,
        },
        ...this.bots.map((b) => ({
          id: b.id,
          name: b.name,
          team: b.team,
          x: b.body.x,
          y: b.body.y,
          z: b.body.z,
          vx: b.body.vx,
          vy: b.body.vy,
          vz: b.body.vz,
          yaw: b.body.yaw,
          pitch: b.body.pitch,
          health: b.health,
          maxHealth: b.maxHealth,
          alive: b.alive,
          crouching: b.body.crouching,
          sprinting: b.body.sprinting,
          grounded: b.body.grounded,
          weapon: b.weapon,
          skin: 'standard' as SkinId,
          kills: b.kills,
          deaths: b.deaths,
          score: b.score,
          respawnTimer: b.respawnTimer,
          isBot: true,
        })),
      ];
    }

    const minimapPlayers = playersList.map((p) => ({
      id: p.id,
      x: p.x,
      z: p.z,
      yaw: p.yaw,
      team: p.team,
      alive: p.alive,
      isLocal: p.id === this.config.playerId,
    }));

    this.hooks.onHudUpdate({
      health: this.localHealth,
      maxHealth: 100,
      alive: this.localAlive,
      respawnTimer: Math.max(0, this.localRespawnTimer),
      killerName: this.localKillerName,
      weapon: this.currentWeapon,
      ammo: this.weaponAmmo[this.currentWeapon],
      magSize: spec.magSize,
      reloading: this.reloading,
      reloadProgress: this.reloading ? 1 - this.reloadTimer / spec.reloadTimeSec : 0,
      isScoped: this.isScoped,
      spreadRadius: spreadPx,
      kills: this.localKills,
      deaths: this.localDeaths,
      score: this.localScore,
      streak: this.localStreak,
      timeRemaining: this.matchTimeRemaining,
      teamScores: this.teamScores,
      localTeam: this.localTeam,
      mode: this.config.mode,
      subMode: this.config.subMode,
      mapId: this.config.mapId,
      players: playersList,
      killFeed: this.botKillFeed,
      ping: this.config.isOnline && this.mpClient ? this.mpClient.currentPing : 0,
      fps: this.currentFps,
      isPointerLocked: this.isPointerLocked,
      hitmarker: { ...this.hitmarkerState },
      damageFlash: this.damageFlash,
      minimapPlayers,
      matchResult: this.matchResult,
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    if (this.unsubWs) this.unsubWs();
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);

    for (const actor of this.remoteActors.values()) {
      this.scene.remove(actor.avatar.root);
      actor.avatar.dispose();
    }
    this.remoteActors.clear();

    for (const bot of this.bots) {
      this.scene.remove(bot.avatar.root);
      bot.avatar.dispose();
    }
    this.bots = [];

    if (this.viewmodel) {
      this.viewmodel.dispose();
      this.viewmodel = null;
    }
    this.effects.dispose();
    if (this.builtMap) {
      this.builtMap.dispose();
      this.builtMap = null;
    }
    if (this.pmremTexture) {
      this.pmremTexture.dispose();
      this.pmremTexture = null;
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

export function computeLevelFromXp(totalXp: number): { level: number; currentLevelXp: number; nextLevelXp: number } {
  let level = 1;
  let remaining = totalXp;
  while (remaining >= xpForLevel(level) && level < 99) {
    remaining -= xpForLevel(level);
    level++;
  }
  return {
    level,
    currentLevelXp: remaining,
    nextLevelXp: xpForLevel(level),
  };
}
