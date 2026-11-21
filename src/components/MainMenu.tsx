import React, { useEffect, useState } from 'react';
import { Copy, Check, Crosshair, Users, Shield, Trophy, Bot, Play, Download } from 'lucide-react';
import { MAPS } from '../shared/maps.ts';
import type {
  GameSettings,
  MapId,
  PlayerProfile,
  SkinId,
  TeamId,
  WeaponId,
} from '../shared/types.ts';
import { WEAPON_ORDER, WEAPON_SKINS, WEAPONS, xpForLevel } from '../shared/weapons.ts';
import { downloadSourceZip, type SourceBundleScope } from '../storage/exportSource.ts';
import { apiUrl } from '../storage/settings.ts';
import { SettingsPanel } from './SettingsModal.tsx';

export interface PrivateLobbyState {
  roomCode: string;
  isHost: boolean;
  mode: 'ffa' | 'tdm';
  mapId: MapId;
  players: Array<{ id: string; name: string; team: TeamId }>;
}

interface MainMenuProps {
  profile: PlayerProfile;
  settings: GameSettings;
  onlineStats: { totalOnlinePlayers: number; activeRooms: number };
  matchmakingStatus: string | null;
  privateLobby: PrivateLobbyState | null;
  menuError: string | null;
  onUpdateSettings: (next: GameSettings) => void;
  onUpdateProfile: (patch: Partial<Pick<PlayerProfile, 'username' | 'primaryWeapon' | 'equippedSkin'>>) => void;
  onStartOffline: (mode: 'practice' | 'bots', subMode: 'ffa' | 'tdm', mapId: MapId) => void;
  onFindPublicMatch: (subMode: 'ffa' | 'tdm', mapId: MapId) => void;
  onCancelMatchmaking: () => void;
  onCreatePrivateRoom: (subMode: 'ffa' | 'tdm', mapId: MapId) => void;
  onJoinPrivateRoom: (code: string) => void;
  onStartPrivateMatch: (code: string) => void;
  onLeavePrivateLobby: () => void;
}

type MenuTab = 'play' | 'loadout' | 'profile' | 'settings';

export const MainMenu: React.FC<MainMenuProps> = ({
  profile,
  settings,
  onlineStats,
  matchmakingStatus,
  privateLobby,
  menuError,
  onUpdateSettings,
  onUpdateProfile,
  onStartOffline,
  onFindPublicMatch,
  onCancelMatchmaking,
  onCreatePrivateRoom,
  onJoinPrivateRoom,
  onStartPrivateMatch,
  onLeavePrivateLobby,
}) => {
  const [tab, setTab] = useState<MenuTab>('play');
  const [selectedMap, setSelectedMap] = useState<MapId>('neon_district');
  const [selectedMode, setSelectedMode] = useState<'ffa' | 'tdm'>('ffa');
  const [joinCode, setJoinCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [editingName, setEditingName] = useState(profile.username);
  const [inspectedWeapon, setInspectedWeapon] = useState<WeaponId>(profile.primaryWeapon);
  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<
    Array<{
      playerId: string;
      username: string;
      level: number;
      kills: number;
      deaths: number;
      wins: number;
    }>
  >([]);

  useEffect(() => {
    setEditingName(profile.username);
  }, [profile.username]);

  useEffect(() => {
    if (tab === 'profile') {
      fetch(apiUrl('/api/leaderboard'))
        .then((r) => {
          const ct = r.headers.get('content-type') || '';
          if (!r.ok || !ct.toLowerCase().includes('application/json')) return null;
          return r.json();
        })
        .then((rows) => {
          if (Array.isArray(rows)) setLeaderboard(rows);
        })
        .catch(() => {});
    }
  }, [tab]);

  const kdRatio =
    profile.deaths > 0 ? (profile.kills / profile.deaths).toFixed(2) : profile.kills.toFixed(2);
  const accuracy =
    profile.shotsFired > 0
      ? Math.round((profile.shotsHit / profile.shotsFired) * 100)
      : 0;

  // Compute XP bar progress within current level
  let remXp = profile.xp;
  for (let l = 1; l < profile.level; l++) {
    remXp -= xpForLevel(l);
  }
  const neededXp = xpForLevel(profile.level);
  const xpPct = Math.max(0, Math.min(100, Math.round((remXp / neededXp) * 100)));

  const handleCopyCode = () => {
    if (!privateLobby) return;
    navigator.clipboard?.writeText(privateLobby.roomCode).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleExportZip = async (scope: SourceBundleScope) => {
    if (exportStatus === 'loading') return;
    setExportStatus('loading');
    setExportError(null);
    try {
      await downloadSourceZip(scope);
      setExportStatus('done');
      setTimeout(() => setExportStatus('idle'), 2500);
    } catch (err) {
      setExportStatus('error');
      setExportError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070B12] text-slate-100 flex flex-col overflow-y-auto">
      {/* Three-Zone Top Bar */}
      <header className="border-b border-slate-800/90 bg-[#0A101B]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setTab('play')}
            className="font-display text-xl font-bold tracking-wider text-white whitespace-nowrap shrink-0"
          >
            NEON <span className="text-[#00D2FF]">STRIKE</span>
          </button>

          <nav className="flex items-center gap-6 overflow-x-auto">
            {(
              [
                ['play', 'Play'],
                ['loadout', 'Loadout'],
                ['profile', 'Profile'],
                ['settings', 'Settings'],
              ] as Array<[MenuTab, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  tab === id
                    ? 'border-[#00D2FF] text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="hidden sm:flex items-center gap-3 whitespace-nowrap shrink-0">
            <span className="text-sm font-medium text-slate-200">{profile.username}</span>
            <span className="text-slate-600">·</span>
            <span className="font-mono-num text-xs font-semibold text-[#00D2FF]">
              LVL {profile.level}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {menuError && (
          <div className="mb-5 px-4 py-3 rounded-md bg-[#EF4444]/15 border border-[#EF4444]/40 text-sm text-red-200">
            {menuError}
          </div>
        )}

        {/* Matchmaking Searching Banner */}
        {matchmakingStatus && (
          <div className="mb-6 p-6 rounded-lg bg-[#0F172A] border border-[#00D2FF]/50 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <div className="font-display text-lg font-bold text-white">{matchmakingStatus}</div>
              <div className="text-sm text-slate-400 mt-1">
                {MAPS[selectedMap].name} · {selectedMode === 'ffa' ? 'Free-for-All' : 'Team Deathmatch'} ·{' '}
                <span className="font-mono-num text-[#00D2FF]">
                  {onlineStats.totalOnlinePlayers} players online
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancelMatchmaking}
              className="px-5 py-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-sm font-medium text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Private Room Waiting Lobby */}
        {privateLobby && (
          <div className="mb-6 p-6 rounded-lg bg-[#0F172A] border border-[#00D2FF]/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="text-xs font-display uppercase tracking-wider text-[#00D2FF]">
                  Private Match Lobby
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="font-mono-num text-2xl font-bold tracking-widest text-white">
                    {privateLobby.roomCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-[#00D2FF]" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied' : 'Copy Code'}
                  </button>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {MAPS[privateLobby.mapId].name} ·{' '}
                  {privateLobby.mode === 'ffa' ? 'Free-for-All' : 'Team Deathmatch'}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onLeavePrivateLobby}
                  className="px-4 py-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-sm text-slate-200"
                >
                  Leave Room
                </button>
                {privateLobby.isHost ? (
                  <button
                    type="button"
                    onClick={() => onStartPrivateMatch(privateLobby.roomCode)}
                    className="px-5 py-2.5 rounded-md bg-[#00D2FF] hover:bg-[#38BDF8] text-slate-950 font-display font-bold text-sm"
                  >
                    Start Match
                  </button>
                ) : (
                  <span className="text-sm text-slate-300">Waiting for host to start...</span>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-slate-400 mb-2">
                Connected Players ({privateLobby.players.length}/12)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {privateLobby.players.map((p) => (
                  <div
                    key={p.id}
                    className="px-3 py-2 rounded bg-slate-900 border border-slate-800 text-sm font-medium text-slate-100 flex items-center justify-between"
                  >
                    <span className="truncate">{p.name}</span>
                    {privateLobby.mode === 'tdm' && (
                      <span
                        className={`text-xs font-mono-num ${
                          p.team === 1 ? 'text-[#00D2FF]' : 'text-[#EF4444]'
                        }`}
                      >
                        T{p.team}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: PLAY */}
        {tab === 'play' && !privateLobby && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Primary Deployment Column */}
            <div className="lg:col-span-8 space-y-6">
              {/* Arena & Mode Configuration */}
              <div className="p-6 rounded-lg bg-[#0F172A] border border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                  <div>
                    <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
                      Combat Deployment
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                      Equipped: {WEAPONS[profile.primaryWeapon].name} ·{' '}
                      {WEAPON_SKINS[profile.equippedSkin].name}
                    </p>
                  </div>

                  {/* Mode Selector */}
                  <div className="flex items-center gap-1 p-1 rounded-md bg-slate-900 border border-slate-800 self-start">
                    <button
                      type="button"
                      onClick={() => setSelectedMode('ffa')}
                      className={`px-3.5 py-2 rounded text-xs font-display font-bold transition-colors whitespace-nowrap ${
                        selectedMode === 'ffa'
                          ? 'bg-[#00D2FF] text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Free-for-All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMode('tdm')}
                      className={`px-3.5 py-2 rounded text-xs font-display font-bold transition-colors whitespace-nowrap ${
                        selectedMode === 'tdm'
                          ? 'bg-[#00D2FF] text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Team Deathmatch
                    </button>
                  </div>
                </div>

                {/* Map Selector */}
                <div className="mt-5">
                  <div className="text-xs font-medium text-slate-400 mb-2.5">Select Arena</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['neon_district', 'orbital_foundry'] as MapId[]).map((mid) => {
                      const m = MAPS[mid];
                      const active = selectedMap === mid;
                      return (
                        <button
                          key={mid}
                          type="button"
                          onClick={() => setSelectedMap(mid)}
                          className={`text-left p-4 rounded-md border transition-colors ${
                            active
                              ? 'bg-[#00D2FF]/10 border-[#00D2FF]'
                              : 'bg-slate-900/70 border-slate-800 hover:border-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-display font-bold text-base text-white">
                              {m.name}
                            </span>
                            <span className="font-mono-num text-xs text-[#00D2FF]">
                              {m.size}m
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1">{m.subtitle}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Primary Launch Actions */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => onFindPublicMatch(selectedMode, selectedMap)}
                    className="sm:col-span-2 py-3.5 px-5 rounded-md bg-[#00D2FF] hover:bg-[#38BDF8] text-slate-950 font-display font-bold text-base tracking-wide flex items-center justify-center gap-2 transition-colors"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Play Online Match
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartOffline('bots', selectedMode, selectedMap)}
                    className="py-3.5 px-4 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-display font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <Bot className="w-4 h-4 text-[#00D2FF]" />
                    Bot Match
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-[#00D2FF]" />
                    <span>
                      <strong className="font-mono-num text-slate-200">
                        {onlineStats.totalOnlinePlayers}
                      </strong>{' '}
                      players online in{' '}
                      <strong className="font-mono-num text-slate-200">
                        {onlineStats.activeRooms}
                      </strong>{' '}
                      active matches
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartOffline('practice', 'ffa', selectedMap)}
                    className="text-[#00D2FF] hover:text-[#38BDF8] font-medium flex items-center gap-1.5"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    Launch Offline Practice Range
                  </button>
                </div>
              </div>

              {/* Controls Quick Reference */}
              <div className="p-5 rounded-lg bg-[#0F172A] border border-slate-800">
                <div className="text-xs font-display font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Controls Reference
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="font-mono-num text-[#00D2FF]">WASD</span>{' '}
                    <span className="text-slate-300">Move</span>
                  </div>
                  <div>
                    <span className="font-mono-num text-[#00D2FF]">SHIFT / C</span>{' '}
                    <span className="text-slate-300">Sprint / Crouch</span>
                  </div>
                  <div>
                    <span className="font-mono-num text-[#00D2FF]">LMB / RMB</span>{' '}
                    <span className="text-slate-300">Fire / Scope</span>
                  </div>
                  <div>
                    <span className="font-mono-num text-[#00D2FF]">1-5 / R / TAB</span>{' '}
                    <span className="text-slate-300">Guns / Reload / Board</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Private Match & Quick Profile Column */}
            <div className="lg:col-span-4 space-y-6">
              <div className="p-6 rounded-lg bg-[#0F172A] border border-slate-800">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="w-4 h-4 text-[#00D2FF]" />
                  <h2 className="font-display text-lg font-bold text-white">Private Match</h2>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Host a private arena with a shareable room code or join a friend's room directly.
                </p>

                <button
                  type="button"
                  onClick={() => onCreatePrivateRoom(selectedMode, selectedMap)}
                  className="w-full py-2.5 px-4 rounded-md bg-slate-800 hover:bg-slate-700 border border-[#00D2FF]/40 text-sm font-display font-semibold text-white transition-colors mb-4"
                >
                  Create Private Room
                </button>

                <div className="pt-4 border-t border-slate-800">
                  <label className="block text-xs text-slate-400 mb-1.5">Join by Room Code</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={8}
                      placeholder="e.g. NS4K9P"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm font-mono-num uppercase text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00D2FF]"
                    />
                    <button
                      type="button"
                      disabled={joinCode.trim().length < 4}
                      onClick={() => onJoinPrivateRoom(joinCode)}
                      className="px-4 py-2 rounded-md bg-[#00D2FF] disabled:opacity-40 text-slate-950 font-display font-bold text-xs"
                    >
                      Join
                    </button>
                  </div>
                </div>
              </div>

              {/* Career Snapshot */}
              <div className="p-6 rounded-lg bg-[#0F172A] border border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-display text-base font-bold text-white">
                    {profile.username}
                  </span>
                  <span className="font-mono-num text-xs font-bold text-[#00D2FF]">
                    Level {profile.level}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded bg-slate-800 overflow-hidden mb-4">
                  <div style={{ width: `${xpPct}%` }} className="h-full bg-[#00D2FF]" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                    <div className="font-mono-num text-lg font-bold text-white">{profile.kills}</div>
                    <div className="text-[11px] text-slate-400">Kills</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                    <div className="font-mono-num text-lg font-bold text-[#00D2FF]">{kdRatio}</div>
                    <div className="text-[11px] text-slate-400">K/D</div>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
                    <div className="font-mono-num text-lg font-bold text-white">{profile.wins}</div>
                    <div className="text-[11px] text-slate-400">Wins</div>
                  </div>
                </div>
              </div>

              {/* Cloudflare Pages, Full Game & Server-Only ZIP Export */}
              <div className="p-5 rounded-lg bg-[#0F172A] border border-slate-800">
                <div className="font-display text-sm font-bold text-white">
                  Deployment & Source Archives
                </div>
                <p className="text-xs text-slate-400 mt-1 mb-3">
                  Download the compiled static bundle for Cloudflare Pages (zero .tsx files) or raw source packages.
                </p>
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={exportStatus === 'loading'}
                    onClick={() => handleExportZip('cloudflare')}
                    className="w-full py-2.5 px-3 rounded-md bg-[#00D2FF]/15 hover:bg-[#00D2FF]/25 disabled:opacity-60 border border-[#00D2FF]/60 text-xs font-display font-bold text-[#00D2FF] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    {exportStatus === 'loading' ? 'Packaging...' : 'Cloudflare Pages (.zip)'}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={exportStatus === 'loading'}
                      onClick={() => handleExportZip('full')}
                      className="py-2.5 px-3 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-60 border border-slate-700 text-xs font-display font-semibold text-slate-100 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0 text-[#00D2FF]" />
                      Full Game (.zip)
                    </button>
                    <button
                      type="button"
                      disabled={exportStatus === 'loading'}
                      onClick={() => handleExportZip('server')}
                      className="py-2.5 px-3 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-60 border border-slate-700 text-xs font-display font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0 text-[#00D2FF]" />
                      Server Only (.zip)
                    </button>
                  </div>
                </div>
                {exportStatus === 'done' && (
                  <p className="mt-2 text-xs text-[#00D2FF]">Archive downloaded.</p>
                )}
                {exportError && (
                  <p className="mt-2 text-xs text-red-300">{exportError}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LOADOUT */}
        {tab === 'loadout' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-2.5">
              <h2 className="font-display text-lg font-bold text-white mb-3">Weapons Armory</h2>
              {WEAPON_ORDER.map((wid) => {
                const w = WEAPONS[wid];
                const isEquipped = profile.primaryWeapon === wid;
                const isSelected = inspectedWeapon === wid;
                return (
                  <button
                    key={wid}
                    type="button"
                    onClick={() => setInspectedWeapon(wid)}
                    className={`w-full text-left p-4 rounded-lg border transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#0F172A] border-[#00D2FF]'
                        : 'bg-[#0F172A]/60 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div>
                      <div className="font-display font-bold text-base text-white">{w.name}</div>
                      <div className="text-xs text-slate-400">
                        {w.category} · {w.magSize} Rd Mag
                      </div>
                    </div>
                    {isEquipped && (
                      <span className="font-mono-num text-xs font-semibold text-[#00D2FF]">
                        EQUIPPED
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7 space-y-6">
              {(() => {
                const w = WEAPONS[inspectedWeapon];
                const isEquipped = profile.primaryWeapon === w.id;
                return (
                  <div className="p-6 rounded-lg bg-[#0F172A] border border-slate-800">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-display uppercase tracking-wider text-[#00D2FF]">
                          {w.category}
                        </div>
                        <h3 className="font-display text-2xl font-bold text-white mt-0.5">
                          {w.name}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUpdateProfile({ primaryWeapon: w.id })}
                        className={`px-4 py-2 rounded-md font-display font-bold text-xs transition-colors ${
                          isEquipped
                            ? 'bg-slate-800 text-[#00D2FF] border border-[#00D2FF]/50'
                            : 'bg-[#00D2FF] hover:bg-[#38BDF8] text-slate-950'
                        }`}
                      >
                        {isEquipped ? 'Default Primary' : 'Equip Primary'}
                      </button>
                    </div>

                    <p className="text-sm text-slate-300 mt-3">{w.description}</p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800">
                      <div>
                        <div className="text-xs text-slate-400">Body / Head Dmg</div>
                        <div className="font-mono-num text-base font-bold text-white">
                          {w.damageBody} / <span className="text-[#F59E0B]">{w.damageHead}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Fire Rate</div>
                        <div className="font-mono-num text-base font-bold text-white">
                          {w.fireRateRpm} RPM
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Reload Time</div>
                        <div className="font-mono-num text-base font-bold text-white">
                          {w.reloadTimeSec}s
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400">Mobility</div>
                        <div className="font-mono-num text-base font-bold text-[#00D2FF]">
                          {Math.round(w.moveSpeedMult * 100)}%
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Weapon Skins */}
              <div className="p-6 rounded-lg bg-[#0F172A] border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">Cosmetic Finishes</h3>
                    <p className="text-xs text-slate-400">
                      Unlock finishes by leveling up in matches. Purely cosmetic.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Object.keys(WEAPON_SKINS) as SkinId[]).map((sid) => {
                    const skin = WEAPON_SKINS[sid];
                    const unlocked = profile.level >= skin.unlockLevel;
                    const active = profile.equippedSkin === sid;
                    return (
                      <button
                        key={sid}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => onUpdateProfile({ equippedSkin: sid })}
                        className={`p-3.5 rounded-md border text-left flex items-center justify-between transition-colors ${
                          active
                            ? 'bg-[#00D2FF]/15 border-[#00D2FF]'
                            : unlocked
                              ? 'bg-slate-900 border-slate-800 hover:border-slate-600'
                              : 'bg-slate-900/40 border-slate-800/60 opacity-55 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            style={{
                              background: `linear-gradient(135deg, ${skin.primaryHex} 50%, ${skin.accentHex} 50%)`,
                            }}
                            className="w-8 h-8 rounded border border-white/20 shrink-0"
                          />
                          <div>
                            <div className="font-display font-semibold text-sm text-white">
                              {skin.name}
                            </div>
                            <div className="text-xs text-slate-400">
                              {unlocked ? (active ? 'Equipped' : 'Unlocked') : `Unlocks at Level ${skin.unlockLevel}`}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PROFILE & LEADERBOARD */}
        {tab === 'profile' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-lg bg-[#0F172A] border border-slate-800">
                <h2 className="font-display text-lg font-bold text-white mb-4">Operative Profile</h2>

                <label className="block text-xs text-slate-400 mb-1.5">Callsign / Username</label>
                <div className="flex gap-2 mb-5">
                  <input
                    type="text"
                    maxLength={18}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-sm text-white focus:outline-none focus:border-[#00D2FF]"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateProfile({ username: editingName })}
                    className="px-4 py-2 rounded-md bg-[#00D2FF] text-slate-950 font-display font-bold text-xs"
                  >
                    Save
                  </button>
                </div>

                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="font-display font-bold text-white">Level {profile.level}</span>
                  <span className="font-mono-num text-xs text-slate-400">
                    {remXp} / {neededXp} XP
                  </span>
                </div>
                <div className="w-full h-2 rounded bg-slate-800 overflow-hidden mb-6">
                  <div style={{ width: `${xpPct}%` }} className="h-full bg-[#00D2FF]" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">Career Kills</div>
                    <div className="font-mono-num text-xl font-bold text-white">{profile.kills}</div>
                  </div>
                  <div className="p-3 rounded bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">Deaths</div>
                    <div className="font-mono-num text-xl font-bold text-slate-300">{profile.deaths}</div>
                  </div>
                  <div className="p-3 rounded bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">K/D Ratio</div>
                    <div className="font-mono-num text-xl font-bold text-[#00D2FF]">{kdRatio}</div>
                  </div>
                  <div className="p-3 rounded bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">Accuracy</div>
                    <div className="font-mono-num text-xl font-bold text-white">{accuracy}%</div>
                  </div>
                  <div className="p-3 rounded bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">Wins / Losses</div>
                    <div className="font-mono-num text-lg font-bold text-white">
                      {profile.wins} / {profile.losses}
                    </div>
                  </div>
                  <div className="p-3 rounded bg-slate-900 border border-slate-800">
                    <div className="text-xs text-slate-400">Headshots</div>
                    <div className="font-mono-num text-lg font-bold text-[#F59E0B]">
                      {profile.headshots}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 p-6 rounded-lg bg-[#0F172A] border border-slate-800">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-4 h-4 text-[#F59E0B]" />
                <h2 className="font-display text-lg font-bold text-white">Global Leaderboard</h2>
              </div>

              {leaderboard.length === 0 ? (
                <div className="text-sm text-slate-400 py-8 text-center">
                  Complete online or bot matches to rank on the leaderboard.
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-800">
                      <th className="py-2 font-medium">#</th>
                      <th className="py-2 font-medium">Operative</th>
                      <th className="py-2 font-medium text-right">Lvl</th>
                      <th className="py-2 font-medium text-right">Kills</th>
                      <th className="py-2 font-medium text-right">Wins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((row, idx) => (
                      <tr
                        key={row.playerId}
                        className={`border-b border-slate-800/50 last:border-0 ${
                          row.playerId === profile.playerId ? 'text-[#00D2FF]' : 'text-slate-200'
                        }`}
                      >
                        <td className="py-2.5 font-mono-num text-xs text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 font-medium">{row.username}</td>
                        <td className="py-2.5 text-right font-mono-num">{row.level}</td>
                        <td className="py-2.5 text-right font-mono-num font-semibold">{row.kills}</td>
                        <td className="py-2.5 text-right font-mono-num">{row.wins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SETTINGS */}
        {tab === 'settings' && (
          <SettingsPanel settings={settings} onChange={onUpdateSettings} />
        )}
      </main>
    </div>
  );
};
