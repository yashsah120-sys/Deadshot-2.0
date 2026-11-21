import React, { useRef, useState } from 'react';
import { Crosshair, ArrowUp, RotateCw, Zap, Shield, Repeat } from 'lucide-react';
import type { MobileButtonLayout, MobileControlsConfig } from '../shared/types.ts';
import type { GameEngine } from '../engine/GameEngine.ts';

interface MobileControlsProps {
  engine: GameEngine | null;
  config: MobileControlsConfig;
  isScoped: boolean;
  onToggleScoreboard: () => void;
}

export const MobileControls: React.FC<MobileControlsProps> = ({
  engine,
  config,
  isScoped,
  onToggleScoreboard,
}) => {
  const joyTouchId = useRef<number | null>(null);
  const joyCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookTouchId = useRef<number | null>(null);
  const lastLookPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const fireTouchId = useRef<number | null>(null);

  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [crouchActive, setCrouchActive] = useState(false);
  const [sprintActive, setSprintActive] = useState(false);

  const maxRadius = 46 * config.joystick.scale;

  const handleJoyStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (joyTouchId.current !== null) return;
    const t = e.changedTouches[0];
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    joyTouchId.current = t.identifier;
    joyCenter.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateJoystick(t.clientX, t.clientY);
  };

  const handleJoyMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (joyTouchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchId.current) {
        updateJoystick(t.clientX, t.clientY);
        break;
      }
    }
  };

  const handleJoyEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchId.current) {
        joyTouchId.current = null;
        setKnobOffset({ x: 0, y: 0 });
        engine?.setTouchMove(0, 0);
        break;
      }
    }
  };

  const updateJoystick = (cx: number, cy: number) => {
    let dx = cx - joyCenter.current.x;
    let dy = cy - joyCenter.current.y;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    engine?.setTouchMove(dx / maxRadius, -dy / maxRadius);
  };

  // Look Zone (captures free touches across screen not claimed by buttons)
  const handleLookStart = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (
        lookTouchId.current === null &&
        t.identifier !== joyTouchId.current &&
        t.identifier !== fireTouchId.current
      ) {
        lookTouchId.current = t.identifier;
        lastLookPos.current = { x: t.clientX, y: t.clientY };
        break;
      }
    }
  };

  const handleLookMove = (e: React.TouchEvent) => {
    if (lookTouchId.current === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === lookTouchId.current) {
        const dx = t.clientX - lastLookPos.current.x;
        const dy = t.clientY - lastLookPos.current.y;
        lastLookPos.current = { x: t.clientX, y: t.clientY };
        engine?.addTouchLook(dx, dy);
        break;
      }
    }
  };

  const handleLookEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId.current) {
        lookTouchId.current = null;
        break;
      }
    }
  };

  const btnStyle = (layout: MobileButtonLayout): React.CSSProperties => ({
    left: `${layout.x}%`,
    top: `${layout.y}%`,
    transform: `translate(-50%, -50%) scale(${layout.scale})`,
  });

  return (
    <div
      className="fixed inset-0 z-20 touch-none-canvas pointer-events-auto"
      onTouchStart={handleLookStart}
      onTouchMove={handleLookMove}
      onTouchEnd={handleLookEnd}
      onTouchCancel={handleLookEnd}
    >
      {/* Virtual Movement Joystick */}
      <div
        style={btnStyle(config.joystick)}
        onTouchStart={handleJoyStart}
        onTouchMove={handleJoyMove}
        onTouchEnd={handleJoyEnd}
        onTouchCancel={handleJoyEnd}
        className="absolute w-28 h-28 rounded-full border-2 border-[#00D2FF]/45 bg-[#0B1220]/55 flex items-center justify-center"
      >
        <div
          style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }}
          className="w-12 h-12 rounded-full bg-[#00D2FF]/80 border-2 border-white/80 shadow-lg"
        />
      </div>

      {/* Primary Fire Button (also allows simultaneous drag-aiming while holding fire!) */}
      <button
        type="button"
        style={btnStyle(config.fire)}
        onTouchStart={(e) => {
          e.stopPropagation();
          const t = e.changedTouches[0];
          fireTouchId.current = t.identifier;
          lastLookPos.current = { x: t.clientX, y: t.clientY };
          engine?.setTouchFire(true);
        }}
        onTouchMove={(e) => {
          e.stopPropagation();
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === fireTouchId.current) {
              const dx = t.clientX - lastLookPos.current.x;
              const dy = t.clientY - lastLookPos.current.y;
              lastLookPos.current = { x: t.clientX, y: t.clientY };
              engine?.addTouchLook(dx, dy);
              break;
            }
          }
        }}
        onTouchEnd={(e) => {
          e.stopPropagation();
          fireTouchId.current = null;
          engine?.setTouchFire(false);
        }}
        onTouchCancel={() => {
          fireTouchId.current = null;
          engine?.setTouchFire(false);
        }}
        className="absolute w-20 h-20 rounded-full bg-[#EF4444]/75 active:bg-[#EF4444] border-2 border-white/70 flex items-center justify-center text-white shadow-lg"
        aria-label="Fire"
      >
        <Crosshair className="w-8 h-8" />
      </button>

      {/* Scope / ADS */}
      <button
        type="button"
        style={btnStyle(config.scope)}
        onTouchStart={(e) => {
          e.stopPropagation();
          engine?.toggleScope();
        }}
        className={`absolute w-14 h-14 rounded-full border-2 flex items-center justify-center text-xs font-display font-bold ${
          isScoped
            ? 'bg-[#00D2FF] text-slate-950 border-white'
            : 'bg-[#0B1220]/70 text-slate-100 border-[#00D2FF]/50'
        }`}
        aria-label="Scope"
      >
        ADS
      </button>

      {/* Jump */}
      <button
        type="button"
        style={btnStyle(config.jump)}
        onTouchStart={(e) => {
          e.stopPropagation();
          engine?.triggerJump();
        }}
        className="absolute w-14 h-14 rounded-full bg-[#0B1220]/70 active:bg-[#00D2FF]/40 border border-white/30 flex items-center justify-center text-white"
        aria-label="Jump"
      >
        <ArrowUp className="w-6 h-6" />
      </button>

      {/* Crouch */}
      <button
        type="button"
        style={btnStyle(config.crouch)}
        onTouchStart={(e) => {
          e.stopPropagation();
          setCrouchActive((v) => !v);
          engine?.toggleCrouch();
        }}
        className={`absolute w-12 h-12 rounded-full border flex items-center justify-center ${
          crouchActive
            ? 'bg-[#F59E0B]/80 text-slate-950 border-white'
            : 'bg-[#0B1220]/70 text-slate-200 border-white/25'
        }`}
        aria-label="Crouch"
      >
        <Shield className="w-5 h-5" />
      </button>

      {/* Reload */}
      <button
        type="button"
        style={btnStyle(config.reload)}
        onTouchStart={(e) => {
          e.stopPropagation();
          engine?.triggerReload();
        }}
        className="absolute w-12 h-12 rounded-full bg-[#0B1220]/70 active:bg-[#00D2FF]/40 border border-white/25 flex items-center justify-center text-white"
        aria-label="Reload"
      >
        <RotateCw className="w-5 h-5" />
      </button>

      {/* Sprint Toggle */}
      <button
        type="button"
        style={btnStyle(config.sprint)}
        onTouchStart={(e) => {
          e.stopPropagation();
          setSprintActive((v) => !v);
          engine?.toggleSprint();
        }}
        className={`absolute w-12 h-12 rounded-full border flex items-center justify-center ${
          sprintActive
            ? 'bg-[#00D2FF]/85 text-slate-950 border-white'
            : 'bg-[#0B1220]/70 text-slate-200 border-white/25'
        }`}
        aria-label="Sprint"
      >
        <Zap className="w-5 h-5" />
      </button>

      {/* Weapon Cycle */}
      <button
        type="button"
        style={btnStyle(config.weaponSwitch)}
        onTouchStart={(e) => {
          e.stopPropagation();
          engine?.cycleWeapon();
        }}
        className="absolute w-14 h-12 rounded-lg bg-[#0B1220]/75 active:bg-[#00D2FF]/40 border border-[#00D2FF]/40 flex items-center justify-center text-xs font-display font-bold text-white gap-1"
        aria-label="Switch Weapon"
      >
        <Repeat className="w-4 h-4" />
      </button>

      {/* Quick Scoreboard Button on Mobile */}
      <button
        type="button"
        onTouchStart={(e) => {
          e.stopPropagation();
          onToggleScoreboard();
        }}
        className="absolute top-3 left-36 px-3 py-2 rounded-md bg-[#0B1220]/80 border border-white/20 text-xs font-display font-semibold text-slate-100"
      >
        SCORE
      </button>
    </div>
  );
};
