import React, { useRef, useState } from 'react';
import type { MobileButtonLayout, MobileControlsConfig } from '../shared/types.ts';
import { getDefaultMobileControls } from '../storage/settings.ts';

interface MobileLayoutEditorProps {
  config: MobileControlsConfig;
  onChange: (next: MobileControlsConfig) => void;
  onClose: () => void;
}

type ControlKey = keyof Omit<MobileControlsConfig, 'enabled'>;

const LABELS: Record<ControlKey, string> = {
  joystick: 'Move Stick',
  fire: 'Fire',
  scope: 'ADS / Scope',
  jump: 'Jump',
  crouch: 'Crouch',
  reload: 'Reload',
  sprint: 'Sprint',
  weaponSwitch: 'Weapon',
};

export const MobileLayoutEditor: React.FC<MobileLayoutEditorProps> = ({
  config,
  onChange,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<ControlKey>('fire');
  const dragging = useRef<ControlKey | null>(null);

  const handlePointerDown = (key: ControlKey, e: React.PointerEvent) => {
    e.stopPropagation();
    setSelected(key);
    dragging.current = key;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = Math.max(6, Math.min(94, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(10, Math.min(92, ((e.clientY - rect.top) / rect.height) * 100));
    onChange({
      ...config,
      [dragging.current]: {
        ...config[dragging.current],
        x: Math.round(xPct * 10) / 10,
        y: Math.round(yPct * 10) / 10,
      },
    });
  };

  const handlePointerUp = () => {
    dragging.current = null;
  };

  const selectedLayout: MobileButtonLayout = config[selected];

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="fixed inset-0 z-50 bg-[#070B12] select-none touch-none-canvas"
    >
      {/* Top Toolbar */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-3 px-4 py-2.5 rounded-lg bg-[#0F172A] border border-slate-700">
        <span className="font-display font-bold text-sm text-white">
          {LABELS[selected]}
        </span>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <span>Size</span>
          <input
            type="range"
            min="0.7"
            max="1.5"
            step="0.05"
            value={selectedLayout.scale}
            onChange={(e) =>
              onChange({
                ...config,
                [selected]: { ...selectedLayout, scale: Number(e.target.value) },
              })
            }
            className="accent-[#00D2FF] w-24"
          />
          <span className="font-mono-num w-9">{selectedLayout.scale.toFixed(2)}x</span>
        </label>
        <button
          type="button"
          onClick={() => onChange({ ...getDefaultMobileControls(), enabled: config.enabled })}
          className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1.5 rounded bg-[#00D2FF] text-slate-950 text-xs font-display font-bold"
        >
          Done
        </button>
      </div>

      {/* Draggable Buttons */}
      {(Object.keys(LABELS) as ControlKey[]).map((key) => {
        const layout = config[key];
        const isSel = selected === key;
        return (
          <div
            key={key}
            onPointerDown={(e) => handlePointerDown(key, e)}
            style={{
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              transform: `translate(-50%, -50%) scale(${layout.scale})`,
            }}
            className={`absolute cursor-move flex items-center justify-center rounded-full border-2 font-display text-xs font-bold ${
              key === 'joystick' ? 'w-28 h-28' : key === 'fire' ? 'w-20 h-20' : 'w-14 h-14'
            } ${
              isSel
                ? 'border-[#00D2FF] bg-[#00D2FF]/25 text-white'
                : 'border-slate-500 bg-slate-800/80 text-slate-200'
            }`}
          >
            {LABELS[key]}
          </div>
        );
      })}
    </div>
  );
};
