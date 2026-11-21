import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud.tsx';
import { MainMenu, type PrivateLobbyState } from './components/MainMenu.tsx';
import { MobileControls } from './components/MobileControls.tsx';
import { SettingsPanel } from './components/SettingsModal.tsx';
import { GameEngine } from './engine/GameEngine.ts';
import { MultiplayerClient, type EngineMatchConfig } from './net/MultiplayerClient.ts';
import type {
  GameSettings,
  HudState,
  MapId,
  MatchResultSummary,
  PlayerProfile,
  WeaponId,
} from './shared/types.ts';
import {
  apiUrl,
  fetchPlayerProfile,
  getOrCreatePlayerId,
  loadSettings,
  saveSettings,
  submitMatchProfileStats,
  updatePlayerProfile,
} from './storage/settings.ts';

function createInitialHud(config: EngineMatchConfig): HudState {
  return {
    health: 100,
    maxHealth: 100,
    alive: true,
    respawnTimer: 0,
    weapon: config.initialWeapon,
    ammo: 30,
    magSize: 30,
    reloading: false,
    reloadProgress: 0,
    isScoped: false,
    spreadRadius: 12,
    kills: 0,
    deaths: 0,
    score: 0,
    streak: 0,
    timeRemaining: config.mode === 'practice' ? 999 : 180,
    teamScores: [0, 0],
    localTeam: config.localTeam,
    mode: config.mode,
    subMode: config.subMode,
    mapId: config.mapId,
    players: [],
    killFeed: [],
    ping: 0,
    fps: 60,
    isPointerLocked: false,
    hitmarker: { active: false, headshot: false, kill: false, id: 0 },
    damageFlash: 0,
    minimapPlayers: [],
    matchResult: null,
  };
}

export default function App() {
  const [playerId] = useState(() => getOrCreatePlayerId());
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [profile, setProfile] = useState<PlayerProfile>({
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
    unlockedSkins: ['standard', 'cobalt_carbon'],
  });

  const [onlineStats, setOnlineStats] = useState({ totalOnlinePlayers: 0, activeRooms: 0 });
  const [matchmakingStatus, setMatchmakingStatus] = useState<string | null>(null);
  const [privateLobby, setPrivateLobby] = useState<PrivateLobbyState | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);

  const [activeMatch, setActiveMatch] = useState<EngineMatchConfig | null>(null);
  const [activeRoomCode, setActiveRoomCode] = useState<string | undefined>(undefined);
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [inGameSettingsOpen, setInGameSettingsOpen] = useState(false);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const mpClientRef = useRef<MultiplayerClient | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Load persistent profile from server on mount
  useEffect(() => {
    fetchPlayerProfile(playerId)
      .then((p) => setProfile(p))
      .catch(() => {});
  }, [playerId]);

  // Poll live server player count while in menu
  useEffect(() => {
    if (activeMatch) return;
    const loadStats = () => {
      fetch(apiUrl('/api/stats'))
        .then((r) => {
          const ct = r.headers.get('content-type') || '';
          if (!r.ok || !ct.toLowerCase().includes('application/json')) return null;
          return r.json();
        })
        .then((data) => {
          if (data && typeof data.totalOnlinePlayers === 'number') {
            setOnlineStats(data);
          }
        })
        .catch(() => {});
    };
    loadStats();
    const timer = setInterval(loadStats, 4000);
    return () => clearInterval(timer);
  }, [activeMatch]);

  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    saveSettings(next);
    engineRef.current?.updateSettings(next);
  }, []);

  const handleUpdateProfile = useCallback(
    async (patch: Partial<Pick<PlayerProfile, 'username' | 'primaryWeapon' | 'equippedSkin'>>) => {
      try {
        const updated = await updatePlayerProfile(playerId, patch);
        setProfile(updated);
      } catch {
        setProfile((prev) => ({ ...prev, ...patch }));
      }
    },
    [playerId],
  );

  // Mount & Unmount 3D GameEngine when activeMatch changes
  useEffect(() => {
    if (!activeMatch || !canvasContainerRef.current) return;

    setHud(createInitialHud(activeMatch));
    setPaused(!settingsRef.current.mobileControls.enabled);
    setShowScoreboard(false);

    const engine = new GameEngine(
      canvasContainerRef.current,
      activeMatch,
      settingsRef.current,
      {
        onHudUpdate: (nextHud) => setHud(nextHud),
        onScoreboardToggle: (open) => setShowScoreboard(open),
        onPauseToggle: (p) => setPaused(p),
        onLocalMatchFinish: (summary: MatchResultSummary) => {
          submitMatchProfileStats(playerId, {
            kills: summary.localStats.kills,
            deaths: summary.localStats.deaths,
            shotsFired: summary.localStats.shotsFired,
            shotsHit: summary.localStats.shotsHit,
            headshots: summary.localStats.headshots,
            won: summary.localStats.won,
            xpEarned: summary.localStats.xpEarned,
          })
            .then((updated) => setProfile(updated))
            .catch(() => {});
        },
      },
      activeMatch.isOnline ? mpClientRef.current : null,
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [activeMatch, playerId]);

  const ensureMpClient = useCallback(async () => {
    if (!mpClientRef.current) {
      mpClientRef.current = new MultiplayerClient();
    }
    await mpClientRef.current.connect();
    return mpClientRef.current;
  }, []);

  // Listen to lobby / matchmaking WebSocket messages
  useEffect(() => {
    const client = mpClientRef.current;
    if (!client) return;
    return client.onMessage((msg) => {
      if (msg.type === 'joined_room') {
        setMenuError(null);
        setMatchmakingStatus(null);
        if (msg.isPrivate && msg.waitingToStart && msg.roomCode) {
          setPrivateLobby({
            roomCode: msg.roomCode,
            isHost: msg.isHost,
            mode: msg.mode,
            mapId: msg.mapId,
            players: msg.players.map((p) => ({ id: p.id, name: p.name, team: p.team })),
          });
        } else {
          setPrivateLobby(null);
          setActiveRoomCode(msg.roomCode);
          setActiveMatch({
            mode: msg.isPrivate ? 'private' : msg.mode,
            subMode: msg.mode,
            mapId: msg.mapId,
            playerId: msg.playerId,
            playerName: profile.username,
            localTeam: msg.team,
            initialWeapon: profile.primaryWeapon,
            skin: profile.equippedSkin,
            isOnline: true,
            initialPlayers: msg.players,
          });
        }
      } else if (msg.type === 'room_lobby_update') {
        setPrivateLobby((prev) =>
          prev
            ? {
                ...prev,
                isHost: msg.hostId === playerId,
                players: msg.players,
              }
            : null,
        );
      } else if (msg.type === 'match_started') {
        setPrivateLobby((prev) => {
          if (!prev) return null;
          setActiveRoomCode(prev.roomCode);
          const me = prev.players.find((p) => p.id === playerId);
          setActiveMatch({
            mode: 'private',
            subMode: msg.mode,
            mapId: msg.mapId,
            playerId,
            playerName: profile.username,
            localTeam: me?.team ?? 0,
            initialWeapon: profile.primaryWeapon,
            skin: profile.equippedSkin,
            isOnline: true,
            initialTimeRemaining: msg.timeRemaining,
          });
          return null;
        });
      } else if (msg.type === 'match_end') {
        fetchPlayerProfile(playerId)
          .then((p) => setProfile(p))
          .catch(() => {});
      } else if (msg.type === 'error') {
        setMatchmakingStatus(null);
        setMenuError(msg.message);
      }
    });
  }, [playerId, profile.equippedSkin, profile.primaryWeapon, profile.username, matchmakingStatus, privateLobby]);

  const handleStartOffline = (mode: 'practice' | 'bots', subMode: 'ffa' | 'tdm', mapId: MapId) => {
    setMenuError(null);
    setActiveRoomCode(undefined);
    setActiveMatch({
      mode,
      subMode,
      mapId,
      playerId,
      playerName: profile.username,
      localTeam: subMode === 'tdm' ? 1 : 0,
      initialWeapon: profile.primaryWeapon,
      skin: profile.equippedSkin,
      isOnline: false,
    });
  };

  const handleFindPublicMatch = async (subMode: 'ffa' | 'tdm', mapId: MapId) => {
    setMenuError(null);
    setMatchmakingStatus('Connecting to Matchmaking Server...');
    try {
      const client = await ensureMpClient();
      client.send({
        type: 'join_public',
        playerId,
        name: profile.username,
        mode: subMode,
        mapId,
        weapon: profile.primaryWeapon,
        skin: profile.equippedSkin,
      });
    } catch {
      setMatchmakingStatus(null);
      setMenuError('Unable to reach multiplayer server. Try Bot Match or Practice Mode.');
    }
  };

  const handleCreatePrivateRoom = async (subMode: 'ffa' | 'tdm', mapId: MapId) => {
    setMenuError(null);
    try {
      const client = await ensureMpClient();
      client.send({
        type: 'create_private',
        playerId,
        name: profile.username,
        mode: subMode,
        mapId,
        weapon: profile.primaryWeapon,
        skin: profile.equippedSkin,
      });
    } catch {
      setMenuError('Could not connect to multiplayer server to create private room.');
    }
  };

  const handleJoinPrivateRoom = async (code: string) => {
    setMenuError(null);
    try {
      const client = await ensureMpClient();
      client.send({
        type: 'join_private',
        roomCode: code.trim().toUpperCase(),
        playerId,
        name: profile.username,
        weapon: profile.primaryWeapon,
        skin: profile.equippedSkin,
      });
    } catch {
      setMenuError('Could not connect to multiplayer server.');
    }
  };

  const handleLeaveMatch = () => {
    if (activeMatch?.isOnline && mpClientRef.current) {
      mpClientRef.current.send({ type: 'leave_room' });
    }
    setActiveMatch(null);
    setActiveRoomCode(undefined);
    setHud(null);
    setPaused(false);
    setInGameSettingsOpen(false);
  };

  const handlePlayAgain = () => {
    if (!activeMatch) return;
    if (activeMatch.isOnline) {
      const { subMode, mapId } = activeMatch;
      handleLeaveMatch();
      void handleFindPublicMatch(subMode, mapId);
    } else {
      const cfg = { ...activeMatch };
      setActiveMatch(null);
      setTimeout(() => setActiveMatch(cfg), 20);
    }
  };

  if (activeMatch) {
    return (
      <div className="relative w-full h-screen bg-[#070B12] overflow-hidden">
        {/* Isolated WebGL Viewport Container */}
        <div
          ref={canvasContainerRef}
          onClick={() => {
            if (!settings.mobileControls.enabled && !paused && !inGameSettingsOpen) {
              engineRef.current?.requestPointerLock();
            }
          }}
          className="w-full h-full"
        />

        {/* In-Game HUD */}
        {hud && (
          <GameHud
            hud={hud}
            settings={settings}
            paused={paused && !inGameSettingsOpen}
            showScoreboard={showScoreboard}
            roomCode={activeRoomCode}
            onResume={() => {
              engineRef.current?.setPaused(false);
              engineRef.current?.requestPointerLock();
            }}
            onOpenSettings={() => setInGameSettingsOpen(true)}
            onSelectWeapon={(w: WeaponId) => {
              engineRef.current?.equipWeapon(w, profile.equippedSkin);
            }}
            onLeaveMatch={handleLeaveMatch}
            onPlayAgain={handlePlayAgain}
          />
        )}

        {/* Mobile Touch Controls */}
        {settings.mobileControls.enabled && hud && !paused && !hud.matchResult && !inGameSettingsOpen && (
          <MobileControls
            engine={engineRef.current}
            config={settings.mobileControls}
            isScoped={hud.isScoped}
            onToggleScoreboard={() => setShowScoreboard((v) => !v)}
          />
        )}

        {/* In-Game Settings Overlay */}
        {inGameSettingsOpen && (
          <SettingsPanel
            settings={settings}
            onChange={handleUpdateSettings}
            onClose={() => setInGameSettingsOpen(false)}
            isModal
          />
        )}
      </div>
    );
  }

  return (
    <MainMenu
      profile={profile}
      settings={settings}
      onlineStats={onlineStats}
      matchmakingStatus={matchmakingStatus}
      privateLobby={privateLobby}
      menuError={menuError}
      onUpdateSettings={handleUpdateSettings}
      onUpdateProfile={handleUpdateProfile}
      onStartOffline={handleStartOffline}
      onFindPublicMatch={handleFindPublicMatch}
      onCancelMatchmaking={() => {
        mpClientRef.current?.send({ type: 'leave_room' });
        setMatchmakingStatus(null);
      }}
      onCreatePrivateRoom={handleCreatePrivateRoom}
      onJoinPrivateRoom={handleJoinPrivateRoom}
      onStartPrivateMatch={(code) => {
        mpClientRef.current?.send({ type: 'start_private_match', roomCode: code });
      }}
      onLeavePrivateLobby={() => {
        mpClientRef.current?.send({ type: 'leave_room' });
        setPrivateLobby(null);
      }}
    />
  );
}
