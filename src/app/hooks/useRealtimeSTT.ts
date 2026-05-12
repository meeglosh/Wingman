/**
 * useRealtimeSTT — GPT Realtime Whisper streaming transcription
 *
 * Flow:
 *   1. start() fetches an ephemeral token from our Supabase edge function
 *   2. Opens a WebSocket to OpenAI's realtime transcription endpoint
 *   3. Streams PCM16 audio at 24 kHz via AudioWorklet
 *   4. Fires onTranscript(text, false) for each partial delta
 *      and onTranscript(text, true) for each finalized utterance
 *   5. Auto-reconnects on unexpected close; calls onFatalError on hard failures
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

const SESSION_URL = `https://${projectId}.supabase.co/functions/v1/make-server-8474fcb9/realtime-session`;
const WS_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';
const RECONNECT_DELAY_MS = 1500;

// Inline AudioWorklet source: converts Float32 mic samples → Int16 PCM and
// posts the raw ArrayBuffer back to the main thread for WebSocket dispatch.
const WORKLET_SRC = `
class PCM16Processor extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch || ch.length === 0) return true;
    const buf = new Int16Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const v = Math.max(-1, Math.min(1, ch[i]));
      buf[i] = v < 0 ? v * 32768 : v * 32767;
    }
    this.port.postMessage(buf.buffer, [buf.buffer]);
    return true;
  }
}
registerProcessor('pcm16-processor', PCM16Processor);
`;

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return btoa(out);
}

export type RealtimeSTTStatus = 'idle' | 'connecting' | 'listening' | 'error';

export function useRealtimeSTT(
  onTranscript: (text: string, isFinal: boolean) => void,
  onFatalError?: (reason: string) => void,
) {
  const [isListening, setIsListening]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [status, setStatus]             = useState<RealtimeSTTStatus>('idle');

  const shouldRunRef    = useRef(false);
  const wsRef           = useRef<WebSocket | null>(null);
  const audioCtxRef     = useRef<AudioContext | null>(null);
  const workletNodeRef  = useRef<AudioWorkletNode | null>(null);
  const streamRef       = useRef<MediaStream | null>(null);
  const reconnectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workletBlobUrl  = useRef<string | null>(null);
  // Accumulates partial deltas within a single VAD-detected utterance.
  // Reset when a final transcript arrives so the next utterance starts clean.
  const partialAccRef   = useRef('');

  // Always-current callback refs so closures never go stale
  const onTranscriptRef  = useRef(onTranscript);
  const onFatalErrorRef  = useRef(onFatalError);
  useEffect(() => { onTranscriptRef.current  = onTranscript;  });
  useEffect(() => { onFatalErrorRef.current  = onFatalError;  });

  const teardownAudio = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const teardownWS = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      ws.onclose = null; // prevent reconnect loop on intentional close
      ws.onerror = null;
      ws.close();
      wsRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    teardownWS();
    teardownAudio();
    setIsListening(false);
  }, [teardownWS, teardownAudio]);

  // ── connect() sets up one complete WebSocket + audio session ────────────────
  const connect = useCallback(async () => {
    if (!shouldRunRef.current) return;
    teardownWS();
    teardownAudio();
    setStatus('connecting');
    setError(null);

    let token: string;
    try {
      const res = await fetch(SESSION_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${publicAnonKey}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Session fetch failed: ${res.status} ${await res.text()}`);
      const body = await res.json();
      if (!body.token) throw new Error('No ephemeral token in session response');
      token = body.token;
    } catch (err) {
      const msg = `Could not start realtime transcription: ${err}`;
      console.error('[RealtimeSTT]', msg);
      setError(msg);
      setStatus('error');
      onFatalErrorRef.current?.(msg);
      return;
    }

    // Build the AudioContext before the WebSocket so audio is ready on open
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
    } catch (err) {
      const msg = `Microphone access denied: ${err}`;
      console.error('[RealtimeSTT]', msg);
      setError(msg);
      setStatus('error');
      onFatalErrorRef.current?.(msg);
      return;
    }

    const ctx = new AudioContext({ sampleRate: 24000 });
    audioCtxRef.current = ctx;

    // Load inline AudioWorklet (blob URL cached for the lifetime of the hook)
    if (!workletBlobUrl.current) {
      const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' });
      workletBlobUrl.current = URL.createObjectURL(blob);
    }
    try {
      await ctx.audioWorklet.addModule(workletBlobUrl.current);
    } catch (err) {
      console.error('[RealtimeSTT] AudioWorklet load error:', err);
    }

    // Open WebSocket — ephemeral token passed via subprotocol (browser-safe pattern)
    const ws = new WebSocket(WS_URL, [
      'realtime',
      `openai-insecure-api-key.${token}`,
      'openai-beta.realtime-v1',
    ]);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      if (!shouldRunRef.current) { ws.close(); return; }
      console.log('[RealtimeSTT] WebSocket open');

      // Configure the transcription session
      ws.send(JSON.stringify({
        type: 'transcription_session.update',
        session: {
          input_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'gpt-4o-transcribe',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 600,
          },
        },
      }));

      // Wire up AudioWorklet → WebSocket
      const source = ctx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(ctx, 'pcm16-processor');
      workletNodeRef.current = worklet;

      worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: arrayBufferToBase64(e.data),
        }));
      };

      source.connect(worklet);
      // Connect to destination keeps the worklet graph alive (Chrome quirk)
      worklet.connect(ctx.destination);

      setIsListening(true);
      setStatus('listening');
    };

    ws.onmessage = (e: MessageEvent) => {
      let event: Record<string, any>;
      try { event = JSON.parse(e.data as string); } catch { return; }

      // Log all event types during development to surface unknown events
      console.log('[RealtimeSTT event]', event.type);

      const t = event.type as string;

      // Partial delta — accumulate into a running partial for this utterance.
      // Multiple API event-name conventions handled for forward-compatibility.
      if (
        t === 'conversation.item.input_audio_transcription.delta' ||
        t === 'transcript.text.delta' ||
        t === 'input_audio_transcription.delta'
      ) {
        const delta: string = event.delta ?? event.text ?? '';
        if (delta) {
          partialAccRef.current += delta;
          onTranscriptRef.current(partialAccRef.current, false);
        }
      }

      // Speech started → reset accumulator for the new utterance
      else if (t === 'input_audio_buffer.speech_started') {
        partialAccRef.current = '';
      }

      // Final utterance — emit canonical text and reset accumulator
      else if (
        t === 'conversation.item.input_audio_transcription.completed' ||
        t === 'transcript.text.done' ||
        t === 'input_audio_transcription.completed'
      ) {
        const text: string = event.transcript ?? event.text ?? '';
        partialAccRef.current = '';
        if (text.trim()) onTranscriptRef.current(text.trim(), true);
      }

      else if (t === 'error') {
        console.error('[RealtimeSTT] Server error:', event.error);
        setError(event.error?.message ?? 'Realtime STT error');
      }
    };

    ws.onerror = (e) => {
      console.error('[RealtimeSTT] WebSocket error:', e);
      setError('WebSocket error — reconnecting…');
    };

    ws.onclose = (e) => {
      console.log('[RealtimeSTT] WebSocket closed, code:', e.code, 'reason:', e.reason);
      setIsListening(false);
      if (!shouldRunRef.current) return;
      // Reconnect unless the server rejected the session (4xxx codes are fatal)
      if (e.code >= 4000 && e.code < 5000) {
        const msg = `Session rejected (${e.code}): ${e.reason}`;
        setError(msg);
        setStatus('error');
        onFatalErrorRef.current?.(msg);
        return;
      }
      setError('Connection lost — reconnecting…');
      reconnectTimer.current = setTimeout(() => connect(), RECONNECT_DELAY_MS);
    };
  }, [teardownWS, teardownAudio]);

  const start = useCallback(() => {
    shouldRunRef.current = true;
    connect();
  }, [connect]);

  const stop = useCallback(() => {
    shouldRunRef.current = false;
    cleanup();
    setStatus('idle');
    setError(null);
  }, [cleanup]);

  const retry = useCallback(() => {
    setError(null);
    connect();
  }, [connect]);

  // Revoke blob URL on unmount
  useEffect(() => () => {
    shouldRunRef.current = false;
    cleanup();
    if (workletBlobUrl.current) {
      URL.revokeObjectURL(workletBlobUrl.current);
      workletBlobUrl.current = null;
    }
  }, [cleanup]);

  return { isListening, error, status, start, stop, retry };
}
