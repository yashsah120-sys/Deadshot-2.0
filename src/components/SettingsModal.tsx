import React, { useState } from 'react';
import { Download } from 'lucide-react';
import type { GameSettings, GraphicsQuality } from '../shared/types.ts';
import { downloadSourceZip, type SourceBundleScope } from '../storage/exportSource.ts';
import { getServerBaseUrl, setServerBaseUrl, validateServerUrl } from '../storage/settings.ts';
import { MobileLayoutEditor } from './MobileLayoutEditor.tsx';

interface SettingsPanelProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onClose?: () => void;
  isModal?: boolean;
}

const CROSSHAIR_COLORS = ['#00D2FF', '#FFFFFF', '#22C55E', '#F59E0B', '#EF4444'];

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onChange,
  onClose,
  isModal = false,
}) => {
  const [editingMobileLayout, setEditingMobileLayout] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [serverUrlInput, setServerUrlInput] = useState(() => getServerBaseUrl());
  const [serverUrlFeedback, setServerUrlFeedback] = useState<'idle' | 'saved' | 'error'>('idle');

  const handleSaveServerUrl = () => {
    const validated = validateServerUrl(serverUrlInput);
    if (validated === null) {
      setServerUrlFeedback('error');
      return;
    }
    setServerBaseUrl(validated);
    setServerUrlInput(validated);
    setServerUrlFeedback('saved');
    setTimeout(() => setServerUrlFeedback('idle'), 2000);
  };

  const handleExportZip = async (scope: SourceBundleScope) => {
    if (exportState === 'loading') return;
    setExportState('loading');
    try {
      await downloadSourceZip(scope);
      setExportState('done');
      setTimeout(() => setExportState('idle'), 2500);
    } catch {
      setExportState('error');
    }
  };

  if (editingMobileLayout) {
    return (
      <MobileLayoutEditor
        config={settings.mobileControls}
        onChange={(mc) => onChange({ ...settings, mobileControls: mc })}
        onClose={() => setEditingMobileLayout(false)}
      />
    );
  }

  const content = (
    <div className="w-full max-w-3xl mx-auto rounded-lg bg-[#0F172A] border border-slate-800 p-6">
      <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
        <div>
          <h2 className="font-display text-xl font-bold text-white">Settings & Controls</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Adjust aiming sensitivity, graphics fidelity, audio, and touch controls
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-sm font-medium text-white transition-colors"
          >
            Done
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Aim & Camera */}
        <div className="space-y-4">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-[#00D2FF]">
            Aim & Camera
          </h3>

          <label className="block">
            <div className="flex justify-between text-xs text-slate-300 mb-1.5">
              <span>Mouse Sensitivity</span>
              <span className="font-mono-num text-[#00D2FF]">{settings.mouseSensitivity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="3.0"
              step="0.05"
              value={settings.mouseSensitivity}
              onChange={(e) => onChange({ ...settings, mouseSensitivity: Number(e.target.value) })}
              className="w-full accent-[#00D2FF]"
            />
          </label>

          <label className="block">
            <div className="flex justify-between text-xs text-slate-300 mb-1.5">
              <span>Scope / ADS Multiplier</span>
              <span className="font-mono-num text-[#00D2FF]">{settings.adsSensitivityMult.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.2"
              step="0.05"
              value={settings.adsSensitivityMult}
              onChange={(e) => onChange({ ...settings, adsSensitivityMult: Number(e.target.value) })}
              className="w-full accent-[#00D2FF]"
            />
          </label>

          <label className="block">
            <div className="flex justify-between text-xs text-slate-300 mb-1.5">
              <span>Touch Look Sensitivity</span>
              <span className="font-mono-num text-[#00D2FF]">{settings.touchSensitivity.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="3.0"
              step="0.05"
              value={settings.touchSensitivity}
              onChange={(e) => onChange({ ...settings, touchSensitivity: Number(e.target.value) })}
              className="w-full accent-[#00D2FF]"
            />
          </label>

          <label className="block">
            <div className="flex justify-between text-xs text-slate-300 mb-1.5">
              <span>Field of View (FOV)</span>
              <span className="font-mono-num text-[#00D2FF]">{settings.fov}°</span>
            </div>
            <input
              type="range"
              min="70"
              max="110"
              step="1"
              value={settings.fov}
              onChange={(e) => onChange({ ...settings, fov: Number(e.target.value) })}
              className="w-full accent-[#00D2FF]"
            />
          </label>

          <div>
            <div className="text-xs text-slate-300 mb-2">Crosshair Color</div>
            <div className="flex items-center gap-2">
              {CROSSHAIR_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => onChange({ ...settings, crosshairColor: hex })}
                  style={{ backgroundColor: hex }}
                  className={`w-7 h-7 rounded-md border-2 transition-transform ${
                    settings.crosshairColor === hex
                      ? 'border-white scale-110'
                      : 'border-slate-700 opacity-75 hover:opacity-100'
                  }`}
                  aria-label={`Crosshair color ${hex}`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Graphics, Audio & Mobile */}
        <div className="space-y-4">
          <h3 className="font-display text-sm font-bold uppercase tracking-wider text-[#00D2FF]">
            Performance & Audio
          </h3>

          <div>
            <div className="text-xs text-slate-300 mb-1.5">Graphics Quality</div>
            <div className="grid grid-cols-3 gap-2">
              {(['low', 'medium', 'high'] as GraphicsQuality[]).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onChange({ ...settings, graphicsQuality: q })}
                  className={`py-2 rounded-md text-xs font-display font-semibold uppercase border transition-colors ${
                    settings.graphicsQuality === q
                      ? 'bg-[#00D2FF] text-slate-950 border-[#00D2FF]'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <div className="flex justify-between text-xs text-slate-300 mb-1.5">
              <span>Master Volume</span>
              <span className="font-mono-num text-[#00D2FF]">
                {settings.muted ? 'MUTED' : `${Math.round(settings.masterVolume * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={settings.masterVolume}
              onChange={(e) =>
                onChange({ ...settings, masterVolume: Number(e.target.value), muted: false })
              }
              className="w-full accent-[#00D2FF]"
            />
          </label>

          <div className="flex items-center justify-between py-2 border-t border-slate-800">
            <span className="text-sm text-slate-200">Mute Audio</span>
            <button
              type="button"
              onClick={() => onChange({ ...settings, muted: !settings.muted })}
              className={`px-3.5 py-1.5 rounded text-xs font-display font-bold ${
                settings.muted ? 'bg-[#EF4444] text-white' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {settings.muted ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-slate-800">
            <span className="text-sm text-slate-200">Show FPS Counter</span>
            <button
              type="button"
              onClick={() => onChange({ ...settings, showFps: !settings.showFps })}
              className={`px-3.5 py-1.5 rounded text-xs font-display font-bold ${
                settings.showFps ? 'bg-[#00D2FF] text-slate-950' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {settings.showFps ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="flex items-center justify-between py-2 border-t border-slate-800">
            <div>
              <div className="text-sm text-slate-200">Touch Controls Overlay</div>
              <div className="text-xs text-slate-400">Auto-enabled on Android & touch devices</div>
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...settings,
                  mobileControls: {
                    ...settings.mobileControls,
                    enabled: !settings.mobileControls.enabled,
                  },
                })
              }
              className={`px-3.5 py-1.5 rounded text-xs font-display font-bold ${
                settings.mobileControls.enabled
                  ? 'bg-[#00D2FF] text-slate-950'
                  : 'bg-slate-800 text-slate-300'
              }`}
            >
              {settings.mobileControls.enabled ? 'ON' : 'OFF'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setEditingMobileLayout(true)}
            className="w-full py-2.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-[#00D2FF]/40 text-sm font-display font-semibold text-[#00D2FF] transition-colors"
          >
            Customize Mobile Button Layout
          </button>

          <div className="pt-3 border-t border-slate-800 space-y-2">
            <label className="block">
              <div className="text-xs font-medium text-slate-300 mb-1">
                Multiplayer Server URL <span className="text-slate-500">(optional for static hosts)</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://your-server.example.com"
                  value={serverUrlInput}
                  onChange={(e) => {
                    setServerUrlInput(e.target.value);
                    setServerUrlFeedback('idle');
                  }}
                  className="flex-1 px-3 py-1.5 rounded-md bg-slate-900 border border-slate-700 text-xs font-mono-num text-white placeholder:text-slate-500 focus:outline-none focus:border-[#00D2FF]"
                />
                <button
                  type="button"
                  onClick={handleSaveServerUrl}
                  className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-[#00D2FF]/40 text-xs font-display font-semibold text-[#00D2FF] whitespace-nowrap"
                >
                  Apply
                </button>
              </div>
            </label>
            {serverUrlFeedback === 'saved' && (
              <p className="text-[11px] text-[#00D2FF]">Server URL updated.</p>
            )}
            {serverUrlFeedback === 'error' && (
              <p className="text-[11px] text-red-300">Enter a valid http:// or https:// URL (or leave blank).</p>
            )}
          </div>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={exportState === 'loading'}
              onClick={() => handleExportZip('cloudflare')}
              className="w-full py-2.5 px-3 rounded-md bg-[#00D2FF]/15 hover:bg-[#00D2FF]/25 disabled:opacity-60 border border-[#00D2FF]/60 text-xs font-display font-semibold text-[#00D2FF] flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              {exportState === 'loading' ? 'Packaging...' : 'Cloudflare Pages (.zip)'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={exportState === 'loading'}
                onClick={() => handleExportZip('full')}
                className="py-2.5 px-3 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-60 border border-slate-700 text-xs font-display font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-[#00D2FF] shrink-0" />
                Full Game (.zip)
              </button>
              <button
                type="button"
                disabled={exportState === 'loading'}
                onClick={() => handleExportZip('server')}
                className="py-2.5 px-3 rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-60 border border-slate-700 text-xs font-display font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-[#00D2FF] shrink-0" />
                Server Only (.zip)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
        {content}
      </div>
    );
  }
  return content;
};
