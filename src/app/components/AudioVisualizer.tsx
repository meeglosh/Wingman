import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, X, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioDevice {
  deviceId: string;
  label: string;
  isDefault: boolean;
}

// ─── Hook: Enumerate audio input devices ──────────────────────────────────────

export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // First enumerate without requesting permission -
      // labels will be populated if permission was already granted.
      let all = await navigator.mediaDevices.enumerateDevices();
      const alreadyHasLabels = all.some(d => d.kind === 'audioinput' && d.label);

      if (!alreadyHasLabels) {
        // Permission not yet granted - ask for it now (user opened settings deliberately).
        try {
          const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          tempStream.getTracks().forEach(t => t.stop());
          all = await navigator.mediaDevices.enumerateDevices();
        } catch {
          // Permission denied - continue with generic labels, no hard error.
        }
      }

      const inputs = all
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
          isDefault: d.deviceId === 'default' || i === 0,
        }));
      setDevices(inputs);
    } catch (err: any) {
      console.error('Failed to enumerate audio devices:', err);
      setError(err?.message || 'Could not list audio devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Do NOT auto-refresh on mount - only attach the device-change listener.
    // refresh() is called explicitly when the user opens the settings panel.
    const handler = () => refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [refresh]);

  return { devices, loading, error, refresh };
}

// ─── Hook: Real-time audio analyser ───────────────────────────────────────────

const BAR_COUNT = 28;

export function useAudioAnalyser(isActive: boolean, deviceId?: string) {
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(0));
  const [volume, setVolume] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!isActive) {
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      contextRef.current?.close().catch(() => {});
      contextRef.current = null;
      setBars(Array(BAR_COUNT).fill(0));
      setVolume(0);
      return;
    }

    let cancelled = false;

    const constraints: MediaStreamConstraints = {
      audio: deviceId && deviceId !== 'default'
        ? { deviceId: { ideal: deviceId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true },
    };

    navigator.mediaDevices
      .getUserMedia(constraints)
      .then(stream => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;

        const ctx = new AudioContext();
        contextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);

        const binCount = analyser.frequencyBinCount; // 64
        const freqData = new Uint8Array(binCount);

        const tick = () => {
          analyser.getByteFrequencyData(freqData);

          const step = Math.max(1, Math.floor(binCount / BAR_COUNT));
          const newBars: number[] = [];
          for (let i = 0; i < BAR_COUNT; i++) {
            let sum = 0;
            const count = Math.min(step, binCount - i * step);
            for (let j = 0; j < count; j++) sum += freqData[i * step + j] ?? 0;
            // Boost mid-frequencies slightly for better visual response
            const boost = i > 4 && i < BAR_COUNT - 4 ? 1.3 : 1.0;
            newBars.push(Math.min(1, (sum / count / 180) * boost));
          }

          const avgVol = freqData.reduce((a, b) => a + b, 0) / binCount / 255;
          setBars(newBars);
          setVolume(avgVol);

          animRef.current = requestAnimationFrame(tick);
        };

        tick();
      })
      .catch(err => console.warn('AudioAnalyser getUserMedia:', err));

    return () => {
      cancelled = true;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      contextRef.current?.close().catch(() => {});
      contextRef.current = null;
    };
  }, [isActive, deviceId]);

  return { bars, volume };
}

// ─── Waveform Visualizer ──────────────────────────────────────────────────────

interface WaveformVisualizerProps {
  bars: number[];
  isListening: boolean;
}

export function WaveformVisualizer({ bars, isListening }: WaveformVisualizerProps) {
  return (
    <div
      className="flex items-end"
      style={{ gap: 2.5, height: 32, width: BAR_COUNT * (3 + 2.5) - 2.5 }}
      aria-hidden="true"
    >
      {bars.map((val, i) => {
        const minH = isListening ? 4 : 2;
        const h = Math.round(minH + val * (30 - minH));
        const opacity = 0.25 + val * 0.75;
        // Apply a subtle bell-curve envelope so center bars are naturally taller
        const envMult = 1 - Math.abs((i - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2)) * 0.25;
        return (
          <div
            key={i}
            style={{
              width: 3,
              height: Math.max(2, h * envMult),
              borderRadius: 2,
              background: 'linear-gradient(to top, #7C3AED, #A78BFA)',
              opacity,
              transition: 'height 70ms ease, opacity 70ms ease',
              flexShrink: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Audio-reactive mic orb (rendered inside the mic button) ─────────────────

interface AudioOrbProps {
  volume: number;
  isListening: boolean;
}

export function AudioOrb({ volume, isListening }: AudioOrbProps) {
  if (!isListening) return null;

  const clampedVol = Math.min(1, volume * 4); // amplify for better visual
  const scale = 1 + clampedVol * 1.1;
  const outerInset = -(8 + clampedVol * 18);

  return (
    <>
      {/* Inner volume-reactive glow */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          transform: `scale(${scale})`,
          background: `radial-gradient(circle, rgba(239,68,68,${0.15 + clampedVol * 0.35}) 0%, transparent 70%)`,
          transition: 'transform 60ms ease',
          zIndex: 0,
        }}
      />
      {/* Outer ambient reactive ring */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          inset: outerInset,
          border: `1.5px solid rgba(239, 68, 68, ${0.12 + clampedVol * 0.55})`,
          borderRadius: '50%',
          transition: 'inset 60ms ease, border-color 60ms ease',
          zIndex: 0,
        }}
      />
      {/* Second outer ring with lag */}
      {clampedVol > 0.3 && (
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: outerInset - 10 - clampedVol * 8,
            border: `1px solid rgba(239, 68, 68, ${0.07 + clampedVol * 0.2})`,
            borderRadius: '50%',
            transition: 'inset 120ms ease, border-color 120ms ease',
            zIndex: 0,
          }}
        />
      )}
    </>
  );
}

// ─── Audio Device Settings Panel ──────────────────────────────────────────────

interface AudioDeviceSettingsProps {
  devices: AudioDevice[];
  loading: boolean;
  error: string | null;
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}

export function AudioDeviceSettings({
  devices,
  loading,
  error,
  selectedDeviceId,
  onSelect,
  onClose,
  onRefresh,
}: AudioDeviceSettingsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: '#141520',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.1)',
        minWidth: 300,
        maxWidth: 360,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{ background: 'rgba(124,58,237,0.2)' }}
          >
            <Mic size={13} style={{ color: '#A78BFA' }} />
          </div>
          <span className="text-white text-sm font-semibold">Audio Input</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
            title="Refresh devices"
          >
            <RefreshCw size={13} style={{ color: '#64748B' }} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
          >
            <X size={13} style={{ color: '#64748B' }} />
          </button>
        </div>
      </div>

      {/* Device list */}
      <div className="py-1.5 max-h-64 overflow-y-auto">
        {error ? (
          <div className="flex items-start gap-3 px-4 py-3">
            <AlertCircle size={15} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-sm font-medium" style={{ color: '#EF4444' }}>Microphone access denied</p>
              <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                Allow microphone access in your browser settings, then refresh.
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="w-4 h-4 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
            <span style={{ color: '#64748B', fontSize: 13 }}>Detecting devices…</span>
          </div>
        ) : devices.length === 0 ? (
          <p className="px-4 py-3 text-sm" style={{ color: '#64748B' }}>No microphones detected</p>
        ) : (
          devices.map(device => {
            const isSelected =
              device.deviceId === selectedDeviceId ||
              (selectedDeviceId === '' && device.isDefault);
            return (
              <button
                key={device.deviceId}
                onClick={() => onSelect(device.deviceId)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
              >
                <div
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    borderColor: isSelected ? '#7C3AED' : 'rgba(255,255,255,0.2)',
                    background: isSelected ? '#7C3AED' : 'transparent',
                  }}
                >
                  {isSelected && <Check size={11} color="white" strokeWidth={3} />}
                </div>
                <div className="min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: isSelected ? '#C4B5FD' : '#E2E8F0' }}
                  >
                    {device.label}
                  </p>
                  {device.isDefault && (
                    <p className="text-xs" style={{ color: '#475569' }}>System default</p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer note */}
      <div
        className="px-4 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p style={{ color: '#475569', fontSize: 11, lineHeight: 1.5 }}>
          <span style={{ color: '#64748B', fontWeight: 600 }}>Note:</span>{' '}
          Browser speech recognition uses your system's default mic. The selected device drives the live audio visualizer. To change the speech input, set your system default microphone in OS settings.
        </p>
      </div>
    </motion.div>
  );
}