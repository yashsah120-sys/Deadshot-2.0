import React from 'react';
import { MAPS } from '../shared/maps.ts';
import type { GameSettings, HudState, WeaponId } from '../shared/types.ts';
import { WEAPON_ORDER, WEAPONS } from '../shared/weapons.ts';

interface GameHudProps {
  hud: HudState;
  settings: GameSettings;
  paused: boolean;
  showScoreboard: boolean;
  roomCode?: string;
  onResume: () => void;
  onOpenSettings: () => void;
  onSelectWeapon: (w: WeaponId) => void;
  onLeaveMatch: () => void;
  onPlayAgain: () => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  settings,
  paused,
  showScoreboard,
  roomCode,
  onResume,
  onOpenSettings,
  onSelectWeapon,
  onLeaveMatch,
  onPlayAgain,
}) => {
  const weaponSpec = WEAPONS[hud.weapon];
  const mapDef = MAPS[hud.mapId];
  const isSniperScoped = hud.isScoped && weaponSpec.hasScopeOverlay && hud.alive;
  const sortedPlayers = [...hud.players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);

  // Minimap coordinate converter (-size/2..size/2 -> 0..112)
  const mapSpan = mapDef.size;
  const toMini = (val: number) => ((val + mapSpan / 2) / mapSpan) * 112;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none overflow-hidden">
      {/* Damage Red Vignette */}
      {hud.damageFlash > 0.02 && (
        <div
          style={{
            opacity: Math.min(0.75, hud.damageFlash * 0.65),
            boxShadow: 'inset 0 0 110px 35px rgba(239, 68, 68, 0.85)',
          }}
          className="absolute inset-0 transition-opacity duration-75"
        />
      )}

      {/* Sniper Scope Overlay */}
      {isSniperScoped && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85">
          <div className="relative w-[min(74vh,74vw)] h-[min(74vh,74vw)] rounded-full border-2 border-[#00D2FF]/60 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.92)] overflow-hidden">
            <div className="absolute inset-x-0 top-1/2 h-px bg-[#00D2FF]/45" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-[#00D2FF]/45" />
            <div className="absolute left-1/2 top-1/2 w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#EF4444]" />
            <div className="absolute bottom-6 inset-x-0 text-center font-mono-num text-[11px] text-[#00D2FF]/80">
              KESTREL-9 OPTIC · 3.2x
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Crosshair & Hitmarkers */}
      {hud.alive && !isSniperScoped && !paused && !hud.matchResult && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* Center Dot */}
            <div
              style={{ backgroundColor: settings.crosshairColor }}
              className="w-1 h-1 rounded-full"
            />
            {/* Top / Bottom / Left / Right Dynamic Ticks */}
            <div
              style={{
                backgroundColor: settings.crosshairColor,
                transform: `translateY(-${hud.spreadRadius}px)`,
              }}
              className="absolute w-[2px] h-2.5"
            />
            <div
              style={{
                backgroundColor: settings.crosshairColor,
                transform: `translateY(${hud.spreadRadius}px)`,
              }}
              className="absolute w-[2px] h-2.5"
            />
            <div
              style={{
                backgroundColor: settings.crosshairColor,
                transform: `translateX(-${hud.spreadRadius}px)`,
              }}
              className="absolute h-[2px] w-2.5"
            />
            <div
              style={{
                backgroundColor: settings.crosshairColor,
                transform: `translateX(${hud.spreadRadius}px)`,
              }}
              className="absolute h-[2px] w-2.5"
            />

            {/* Hitmarker X */}
            {hud.hitmarker.active && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className={`w-6 h-0.5 rotate-45 absolute ${
                    hud.hitmarker.kill
                      ? 'bg-[#EF4444]'
                      : hud.hitmarker.headshot
                        ? 'bg-[#F59E0B]'
                        : 'bg-white'
                  }`}
                />
                <div
                  className={`w-6 h-0.5 -rotate-45 absolute ${
                    hud.hitmarker.kill
                      ? 'bg-[#EF4444]'
                      : hud.hitmarker.headshot
                        ? 'bg-[#F59E0B]'
                        : 'bg-white'
                  }`}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOP-LEFT: Minimap Radar + Ping & FPS */}
      <div className="absolute top-3 left-3 flex flex-col gap-1.5">
        <div className="w-28 h-28 rounded-md bg-[#0B1220]/88 border border-slate-700/80 overflow-hidden relative">
          <svg viewBox="0 0 112 112" className="w-full h-full">
            <rect width="112" height="112" fill="#09101D" />
            {mapDef.colliders
              .filter((c) => c.kind !== 'floor')
              .map((c) => {
                const x = toMini(c.minX);
                const y = toMini(c.minZ);
                const w = Math.max(2, toMini(c.maxX) - x);
                const h = Math.max(2, toMini(c.maxZ) - y);
                return (
                  <rect
                    key={c.id}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={c.kind === 'platform' ? '#1E3A5F' : '#1E293B'}
                    stroke="#334155"
                    strokeWidth="0.5"
                  />
                );
              })}
            {hud.minimapPlayers.map((p) => {
              if (!p.alive) return null;
              const cx = toMini(p.x);
              const cy = toMini(p.z);
              if (p.isLocal) {
                const deg = (-p.yaw * 180) / Math.PI;
                return (
                  <g key={p.id} transform={`translate(${cx}, ${cy}) rotate(${deg})`}>
                    <polygon points="0,-5 3.5,4 -3.5,4" fill="#00D2FF" />
                  </g>
                );
              }
              const isAlly = hud.subMode === 'tdm' && p.team === hud.localTeam;
              return (
                <circle
                  key={p.id}
                  cx={cx}
                  cy={cy}
                  r={2.5}
                  fill={isAlly ? '#38BDF8' : '#EF4444'}
                />
              );
            })}
          </svg>
        </div>

        <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#0B1220]/85 border border-slate-800 text-[11px] font-mono-num text-slate-300">
          {settings.showFps && <span>{hud.fps} FPS</span>}
          {settings.showFps && <span className="text-slate-600">·</span>}
          <span>{hud.ping > 0 ? `${hud.ping} ms` : 'LOCAL'}</span>
          {roomCode && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-[#00D2FF]">{roomCode}</span>
            </>
          )}
        </div>
      </div>

      {/* TOP-CENTER: Match Timer & Score Banner */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-1.5 rounded-md bg-[#0B1220]/90 border border-slate-700/80">
        {hud.subMode === 'tdm' ? (
          <>
            <div className="flex items-center gap-2 font-display font-bold text-sm">
              <span className="text-[#00D2FF]">COBALT</span>
              <span className="font-mono-num text-lg text-white">{hud.teamScores[0]}</span>
            </div>
            <div className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono-num text-sm font-semibold text-slate-100">
              {formatTime(hud.timeRemaining)}
            </div>
            <div className="flex items-center gap-2 font-display font-bold text-sm">
              <span className="font-mono-num text-lg text-white">{hud.teamScores[1]}</span>
              <span className="text-[#EF4444]">CRIMSON</span>
            </div>
          </>
        ) : (
          <>
            <div className="font-display font-semibold text-xs uppercase tracking-wider text-slate-300">
              {hud.mode === 'practice' ? 'Practice' : 'Free-for-All'}
            </div>
            <div className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono-num text-sm font-semibold text-[#00D2FF]">
              {hud.mode === 'practice' ? 'SANDBOX' : formatTime(hud.timeRemaining)}
            </div>
            <div className="font-mono-num text-xs text-slate-300">
              {hud.kills} K · {hud.players.length} PLR
            </div>
          </>
        )}
      </div>

      {/* TOP-RIGHT: Kill Feed & Quick Menu Trigger */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 max-w-xs">
        <button
          type="button"
          onClick={paused ? onResume : () => onOpenSettings()}
          className="pointer-events-auto px-2.5 py-1 rounded bg-[#0B1220]/85 border border-slate-700/80 text-xs font-display font-semibold text-slate-300 hover:text-white hover:border-[#00D2FF]/60"
        >
          {settings.mobileControls.enabled ? 'MENU / PAUSE' : 'ESC · PAUSE'}
        </button>

        {hud.killFeed.map((ev) => (
          <div
            key={ev.id}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0B1220]/85 border border-slate-800 text-xs"
          >
            <span className={ev.killerTeam === 2 ? 'text-[#EF4444] font-semibold' : 'text-[#00D2FF] font-semibold'}>
              {ev.killerName}
            </span>
            <span className="text-slate-400 text-[10px] font-mono-num">
              [{WEAPONS[ev.weapon].name.split(' ')[0]}
              {ev.headshot ? ' HS' : ''}]
            </span>
            <span className={ev.victimTeam === 2 ? 'text-[#EF4444]' : 'text-slate-200'}>
              {ev.victimName}
            </span>
          </div>
        ))}
      </div>

      {/* BOTTOM-LEFT: Health Bar (offset up slightly if mobile joystick present) */}
      <div
        className={`absolute left-3 ${
          settings.mobileControls.enabled ? 'bottom-3 hidden sm:block' : 'bottom-4'
        } w-56 px-3.5 py-2.5 rounded-md bg-[#0B1220]/90 border border-slate-700/80`}
      >
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="font-display text-xs uppercase tracking-wider text-slate-400">Armor / HP</span>
          <span
            className={`font-mono-num text-2xl font-bold ${
              hud.health <= 30 ? 'text-[#EF4444]' : 'text-white'
            }`}
          >
            {hud.health}
          </span>
        </div>
        <div className="w-full h-2 rounded-sm bg-slate-800 overflow-hidden">
          <div
            style={{ width: `${Math.max(0, Math.min(100, (hud.health / hud.maxHealth) * 100))}%` }}
            className={`h-full transition-all duration-100 ${
              hud.health <= 30 ? 'bg-[#EF4444]' : 'bg-[#00D2FF]'
            }`}
          />
        </div>
      </div>

      {/* BOTTOM-RIGHT: Weapon & Ammunition */}
      <div
        className={`absolute right-3 ${
          settings.mobileControls.enabled ? 'top-14 right-3 sm:top-auto sm:bottom-4' : 'bottom-4'
        } flex flex-col items-end gap-1.5`}
      >
        <div className="px-3.5 py-2.5 rounded-md bg-[#0B1220]/90 border border-slate-700/80 min-w-44 text-right">
          <div className="flex items-center justify-between gap-4">
            <span className="font-display text-xs uppercase tracking-wider text-[#00D2FF]">
              {weaponSpec.name}
            </span>
            <span className="font-mono-num text-[11px] text-slate-400">{weaponSpec.category}</span>
          </div>
          {hud.reloading ? (
            <div className="mt-1.5">
              <div className="text-xs font-display font-semibold text-[#F59E0B] mb-1">RELOADING...</div>
              <div className="w-full h-1.5 bg-slate-800 rounded-sm overflow-hidden">
                <div
                  style={{ width: `${Math.round(hud.reloadProgress * 100)}%` }}
                  className="h-full bg-[#F59E0B]"
                />
              </div>
            </div>
          ) : (
            <div className="mt-0.5 font-mono-num text-2xl font-bold text-white">
              {hud.ammo}{' '}
              <span className="text-sm font-normal text-slate-400">/ {hud.magSize}</span>
            </div>
          )}
        </div>

        {/* Weapon Quick Slots (Desktop) */}
        {!settings.mobileControls.enabled && (
          <div className="flex items-center gap-1">
            {WEAPON_ORDER.map((wid, idx) => {
              const active = hud.weapon === wid;
              return (
                <div
                  key={wid}
                  className={`px-2 py-0.5 rounded text-[11px] font-mono-num border ${
                    active
                      ? 'bg-[#00D2FF]/20 border-[#00D2FF] text-[#00D2FF]'
                      : 'bg-[#0B1220]/80 border-slate-800 text-slate-400'
                  }`}
                >
                  {idx + 1} {WEAPONS[wid].id.toUpperCase()}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* RESPAWN OVERLAY */}
      {!hud.alive && !hud.matchResult && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
          <div className="px-7 py-5 rounded-lg bg-[#0B1220]/95 border border-[#EF4444]/60 text-center">
            <div className="font-display text-xs uppercase tracking-widest text-[#EF4444]">Eliminated</div>
            {hud.killerName && (
              <div className="mt-1 text-base font-semibold text-white">
                Taken down by <span className="text-[#EF4444]">{hud.killerName}</span>
              </div>
            )}
            <div className="mt-3 font-mono-num text-3xl font-bold text-[#00D2FF]">
              {hud.respawnTimer.toFixed(1)}s
            </div>
            <div className="text-xs text-slate-400 mt-1">Respawning shortly</div>
          </div>
        </div>
      )}

      {/* SCOREBOARD OVERLAY (Tab) */}
      {showScoreboard && !hud.matchResult && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/65 pointer-events-auto">
          <div className="w-full max-w-2xl mx-4 rounded-lg bg-[#0B1220]/95 border border-slate-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="font-display font-bold text-base tracking-wide text-white">
                {mapDef.name} · {hud.subMode.toUpperCase()} SCOREBOARD
              </span>
              <span className="font-mono-num text-xs text-slate-400">
                {hud.players.length} Players
              </span>
            </div>
            <div className="p-4">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-800">
                    <th className="py-2 font-medium">Player</th>
                    <th className="py-2 font-medium text-right">Kills</th>
                    <th className="py-2 font-medium text-right">Deaths</th>
                    <th className="py-2 font-medium text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayers.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-slate-800/50 last:border-0"
                    >
                      <td className="py-2 font-medium text-slate-100 flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-sm ${
                            p.team === 2 ? 'bg-[#EF4444]' : p.team === 1 ? 'bg-[#00D2FF]' : 'bg-slate-400'
                          }`}
                        />
                        <span>{p.name}</span>
                        {p.isBot && <span className="text-[11px] text-slate-500">AI</span>}
                      </td>
                      <td className="py-2 text-right font-mono-num text-white">{p.kills}</td>
                      <td className="py-2 text-right font-mono-num text-slate-400">{p.deaths}</td>
                      <td className="py-2 text-right font-mono-num text-[#00D2FF]">{p.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE / POINTER UNLOCK MENU */}
      {paused && !hud.matchResult && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 pointer-events-auto">
          <div className="w-full max-w-md mx-4 rounded-lg bg-[#0B1220] border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-white">NEON STRIKE</h2>
                <p className="text-xs text-slate-400">
                  {mapDef.name} · WASD Move · Mouse Aim · Shift Sprint · C Crouch · R Reload · Tab Scoreboard
                </p>
              </div>
            </div>

            <div className="mb-4">
              <div className="text-xs font-medium text-slate-400 mb-2">Quick Weapon Switch</div>
              <div className="grid grid-cols-5 gap-1.5">
                {WEAPON_ORDER.map((wid) => (
                  <button
                    key={wid}
                    type="button"
                    onClick={() => onSelectWeapon(wid)}
                    className={`py-2 px-1 rounded text-xs font-display font-semibold border transition-colors ${
                      hud.weapon === wid
                        ? 'bg-[#00D2FF] text-slate-950 border-[#00D2FF]'
                        : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-[#00D2FF]/50'
                    }`}
                  >
                    {wid.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="w-full py-3 rounded-md bg-[#00D2FF] hover:bg-[#38BDF8] text-slate-950 font-display font-bold text-sm tracking-wide transition-colors"
              >
                {settings.mobileControls.enabled ? 'RESUME MATCH' : 'CLICK TO DEPLOY / LOCK MOUSE'}
              </button>
              <button
                type="button"
                onClick={onOpenSettings}
                className="w-full py-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm transition-colors"
              >
                Settings & Controls
              </button>
              <button
                type="button"
                onClick={onLeaveMatch}
                className="w-full py-2.5 rounded-md bg-slate-900 hover:bg-[#EF4444]/20 border border-slate-700 hover:border-[#EF4444]/50 text-slate-300 hover:text-white font-medium text-sm transition-colors"
              >
                Leave Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MATCH RESULTS SCREEN */}
      {hud.matchResult && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 pointer-events-auto p-4">
          <div className="w-full max-w-2xl rounded-lg bg-[#0B1220] border border-slate-700 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-display uppercase tracking-widest text-[#00D2FF]">
                  Match Complete
                </div>
                <h2 className="font-display text-2xl font-bold text-white mt-0.5">
                  {hud.matchResult.winnerName} Wins
                </h2>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">XP Earned</div>
                <div className="font-mono-num text-xl font-bold text-[#F59E0B]">
                  +{hud.matchResult.localStats.xpEarned} XP
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 px-6 py-4 bg-slate-900/60 border-b border-slate-800">
              <div>
                <div className="text-xs text-slate-400">Eliminations</div>
                <div className="font-mono-num text-xl font-bold text-white">
                  {hud.matchResult.localStats.kills}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Deaths</div>
                <div className="font-mono-num text-xl font-bold text-slate-300">
                  {hud.matchResult.localStats.deaths}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Accuracy</div>
                <div className="font-mono-num text-xl font-bold text-[#00D2FF]">
                  {hud.matchResult.localStats.accuracy}%
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-400">Score</div>
                <div className="font-mono-num text-xl font-bold text-white">
                  {hud.matchResult.localStats.score}
                </div>
              </div>
            </div>

            <div className="p-6 max-h-64 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-800">
                    <th className="py-2 font-medium">Player</th>
                    <th className="py-2 font-medium text-right">K</th>
                    <th className="py-2 font-medium text-right">D</th>
                    <th className="py-2 font-medium text-right">Acc</th>
                    <th className="py-2 font-medium text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {hud.matchResult.scoreboard.map((row) => (
                    <tr key={row.id} className="border-b border-slate-800/40 last:border-0">
                      <td className="py-2 font-medium text-slate-100">{row.name}</td>
                      <td className="py-2 text-right font-mono-num text-white">{row.kills}</td>
                      <td className="py-2 text-right font-mono-num text-slate-400">{row.deaths}</td>
                      <td className="py-2 text-right font-mono-num text-slate-300">{row.accuracy}%</td>
                      <td className="py-2 text-right font-mono-num text-[#00D2FF]">{row.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onLeaveMatch}
                className="px-4 py-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-medium transition-colors"
              >
                Return to Lobby
              </button>
              <button
                type="button"
                onClick={onPlayAgain}
                className="px-5 py-2.5 rounded-md bg-[#00D2FF] hover:bg-[#38BDF8] text-slate-950 font-display font-bold text-sm transition-colors"
              >
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
