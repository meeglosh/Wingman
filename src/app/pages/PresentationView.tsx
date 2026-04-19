import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Edit3, X, Square, Layers, ChevronLeft, ChevronRight, Settings2, Captions, Play } from 'lucide-react';
import { getPresentation } from '../utils/storage';
import { usePresentations } from '../context/PresentationContext';
import { toTitleCase, removeFiller, cleanBullet, formatBulletPoint, extractUnsplashQuery, generateSlideFromSpeech, generateSlideWithAI } from '../utils/slideGenerator';
import { fetchUnsplashImage } from '../utils/unsplash';
import { isTypingTarget } from '../utils/keyboard';
import { LiveSlideView } from '../components/LiveSlideView';
import {
  useAudioDevices,
  useAudioAnalyser,
  WaveformVisualizer,
  AudioDeviceSettings,
} from '../components/AudioVisualizer';
import type { Presentation, Slide } from '../types/presentation';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

type PresentationPhase = 'loading' | 'intro' | 'speaking' | 'ended';

const DEVICE_STORAGE_KEY = 'wingman-audio-device';
const CC_STORAGE_PREFIX  = 'wingman-cc-';

const IS_EMBEDDED = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

// ─── End-of-presentation phrase detection ────────────────────────────────────
const END_PHRASES = [
  "thank you for attending", "thank you for your time", "thank you for listening",
  "thank you for being here", "thank you all", "thanks everyone", "thanks for attending",
  "that's the end", "that is the end", "this is the end",
  "that concludes", "this concludes",
  "in conclusion,", "in closing,",
  "to wrap up", "to summarize,", "in summary,",
  "that's a wrap", "that's all from me", "that's all i have",
  "end of my presentation", "end of the presentation", "end of our presentation",
  "i hope you enjoyed", "thank you for coming",
];

function detectEndPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return END_PHRASES.some(phrase => lower.includes(phrase));
}

// ─── Force-next slide phrases ─────────────────────────────────────────────────
// Strict: these only fire when the utterance IS essentially the command.
// Substring matching ("…a new slide layout…") would cause phantom slides.
const FORCE_NEXT_PHRASES = [
  "next slide please",
  "next slide",
  "new slide please",
  "new slide",
];

// ─── Explicit voice commands ──────────────────────────────────────────────────
type VoiceCommand =
  | { type: 'new_bullet';     arg: string }
  | { type: 'new_title';      arg: string }
  | { type: 'new_background'; arg: string };

// Each pattern must appear at the very START of the trimmed utterance
const CMD_PATTERNS: Array<{ re: RegExp; type: VoiceCommand['type'] }> = [
  // Bullet commands
  { re: /^(new bullet( point)?|add( a)? (new )?bullet( point)?)[,.]?\s*/i, type: 'new_bullet' },
  // Title commands
  { re: /^(new title|add( a)? (new )?title|change( the)? title|update( the)? title)[,.]?\s*/i, type: 'new_title' },
  // Background commands
  { re: /^(new background|change( the)? background|update( the)? background)[,.]?\s*/i, type: 'new_background' },
];

function detectVoiceCommand(text: string): VoiceCommand | null {
  const trimmed = text.trim();
  for (const { re, type } of CMD_PATTERNS) {
    const m = trimmed.match(re);
    if (m) {
      return { type, arg: trimmed.slice(m[0].length).trim() };
    }
  }
  return null;
}

/**
 * Returns '' when the utterance IS the force-next command (with optional
 * leading filler like "okay" / "alright"). Returns null otherwise — we do NOT
 * strip embedded occurrences because that produces phantom slides when users
 * naturally mention "next slide" in passing.
 */
function stripForceNextPhrase(text: string): string | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return null;
  const normalized = words.join(' ').toLowerCase().replace(/[.!?,;]+$/, '').trim();
  // Optional leading filler word
  const cleaned = normalized.replace(/^(okay|alright|so|right|well|um|uh),?\s+/, '').trim();
  return FORCE_NEXT_PHRASES.includes(cleaned) ? '' : null;
}

// ─── Sentence buffer helpers ─────────────────────────────────────────────────
/** Returns true if the text ends with sentence-ending punctuation. */
function endsWithSentenceBoundary(text: string): boolean {
  return /[.?!]\s*$/.test(text.trim());
}

/** Counts words with more than 2 alphabetic characters (excludes noise/filler). */
function countMeaningfulWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.replace(/[^a-z]/gi, '').length > 2).length;
}

const SENTENCE_MIN_WORDS  = 4;    // bullets must have at least this many meaningful words
const SENTENCE_BUFFER_CAP = 80;   // if buffer grows beyond this with no punctuation, drop oldest half

// ─── Speech Recognition Hook ─────────────────────────────────────────────────
function useSpeechRecognition(
  onTranscript: (text: string, isFinal: boolean) => void,
  onFatalError?: (reason: string) => void,
) {
  const recognitionRef    = useRef<any>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const shouldRestartRef  = useRef(false);
  const restartTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveErrRef = useRef(0);

  // Always-current callback refs so the closed-over effect never goes stale
  const onTranscriptRef = useRef(onTranscript);
  const onFatalErrorRef = useRef(onFatalError);
  useEffect(() => { onTranscriptRef.current = onTranscript; });
  useEffect(() => { onFatalErrorRef.current = onFatalError; });

  useEffect(() => {
    const SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn('[Wingman STT] Web Speech API not available in this browser.');
      return;
    }
    setIsSupported(true);

    const rec = new SpeechRec();
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = 'en-US';
    rec.maxAlternatives = 1;

    // ── Diagnostic events ──────────────────────────────────────────
    rec.onaudiostart  = () => console.log('[Wingman STT] Audio capture started ✓');
    rec.onsoundstart  = () => console.log('[Wingman STT] Sound detected ✓');
    rec.onspeechstart = () => console.log('[Wingman STT] Speech detected ✓');
    rec.onspeechend   = () => console.log('[Wingman STT] Speech ended');
    rec.onaudioend    = () => console.log('[Wingman STT] Audio capture ended');

    rec.onresult = (event: any) => {
      consecutiveErrRef.current = 0; // successful result → reset error count
      setError(null);
      let interim = '';
      let final   = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final   += t;
        else                           interim += t;
      }
      if (final)        onTranscriptRef.current(final,   true);
      else if (interim) onTranscriptRef.current(interim, false);
    };

    rec.onerror = (e: any) => {
      console.error('[Wingman STT] Error:', e.error, e.message ?? '');

      // 'aborted' fires when we call rec.stop()/rec.abort() ourselves — ignore
      if (e.error === 'aborted') return;

      // 'no-speech': normal timeout, onend will restart — clear any stale error
      if (e.error === 'no-speech') {
        setError(null);
        return;
      }

      consecutiveErrRef.current += 1;

      // Fatal errors: stop the restart loop and surface the problem to the user
      const isFatal =
        e.error === 'not-allowed'          ||
        e.error === 'service-not-allowed'  ||
        e.error === 'audio-capture'        || // was silently looping forever
        consecutiveErrRef.current >= 4;

      if (isFatal) {
        shouldRestartRef.current = false;
        const msg =
          e.error === 'not-allowed' || e.error === 'service-not-allowed'
            ? 'Microphone access denied. Allow it in your browser settings then click Retry.'
            : e.error === 'audio-capture'
              ? 'Could not capture audio from the microphone. Another app may have an exclusive lock on it, or the browser requires HTTPS.'
              : `Speech recognition failed (${e.error}). Click Retry to try again.`;
        setError(msg);
        onFatalErrorRef.current?.(msg);
      } else {
        setError(`Speech error: ${e.error} — retrying…`);
      }
    };

    rec.onend = () => {
      console.log(
        '[Wingman STT] Session ended. shouldRestart:', shouldRestartRef.current,
        '| consecutiveErrors:', consecutiveErrRef.current,
      );
      setIsListening(false);

      if (!shouldRestartRef.current) return;

      // Clear any previously-scheduled restart before queuing another
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);

      // Exponential back-off: 150 → 300 → 600 → 1 200 ms cap
      const delay = Math.min(150 * Math.pow(2, consecutiveErrRef.current), 1200);
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!shouldRestartRef.current) return;
        try {
          rec.start();
          setIsListening(true);
          console.log('[Wingman STT] Restarted after', delay, 'ms');
        } catch (err) {
          console.warn('[Wingman STT] Restart threw:', err);
        }
      }, delay);
    };

    recognitionRef.current = rec;

    return () => {
      shouldRestartRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      try { rec.abort(); } catch {}
    };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) {
      console.warn('[Wingman STT] start() called but recognition not initialised');
      return;
    }
    setError(null);
    shouldRestartRef.current  = true;
    consecutiveErrRef.current = 0;
    try {
      recognitionRef.current.start();
      setIsListening(true);
      console.log('[Wingman STT] Started');
    } catch (e) {
      console.warn('[Wingman STT] start() threw (may already be running):', e);
    }
  }, []);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    setIsListening(false);
    try { recognitionRef.current?.stop(); } catch {}
  }, []);

  const retry = useCallback(() => {
    consecutiveErrRef.current = 0;
    setError(null);
    shouldRestartRef.current = true;
    try {
      recognitionRef.current?.start();
      setIsListening(true);
      console.log('[Wingman STT] Retried');
    } catch (e) {
      console.warn('[Wingman STT] retry start() threw:', e);
    }
  }, []);

  return { isSupported, isListening, error, start, stop, retry };
}

// ─── Whisper STT Hook (fallback for environments where Web Speech API is blocked) ──
// Silently swallowed whisper hallucinations / silence artefacts to drop
const WHISPER_NOISE = new Set([
  '', 'you', 'thank you', 'thank you.', 'thanks.', 'thanks', '.', '...', '….', '…',
  '[blank_audio]', '(silence)', '[silence]', '[music]', '(music)', '[applause]',
  'subtitles by the amara.org community', 'www.mooji.org',
]);

function isWhisperNoise(text: string): boolean {
  const t = text.toLowerCase().trim().replace(/[.!?,]+$/, '').trim();
  if (t.length < 2) return true;
  if (WHISPER_NOISE.has(t)) return true;
  // Hallucinated single-word filler
  if (t.split(/\s+/).length === 1 && ['um', 'uh', 'hmm', 'mm', 'ah', 'oh', 'okay', 'ok'].includes(t)) return true;
  return false;
}

function useWhisperSTT(
  onTranscript: (text: string, isFinal: boolean) => void,
  isActive: boolean,
) {
  const [isListening, setIsListening] = useState(false);
  const [ready, setReady]             = useState(false); // true once getUserMedia succeeds
  const [error, setError]             = useState<string | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; });

  useEffect(() => {
    if (!isActive) {
      setIsListening(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let consecutiveErrors = 0; // only surface errors after several consecutive failures
    // Detect best supported mime type for Whisper
    const mimeType =
      MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
      MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' :
      MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')  ? 'audio/ogg;codecs=opus'  :
      '';
    const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';

    // Record CHUNK_SECS of audio, transcribe it, repeat
    const CHUNK_SECS = 5;

    const recordChunk = () => {
      if (cancelled || !stream) return;

      const chunks: Blob[] = [];
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        if (cancelled) return;
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });

        if (blob.size > 1500) {
          try {
            const fd = new FormData();
            fd.append('audio', blob, `audio.${ext}`);
            const res = await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-8474fcb9/transcribe`,
              { method: 'POST', headers: { Authorization: `Bearer ${publicAnonKey}` }, body: fd },
            );
            if (res.ok) {
              const { text } = await res.json();
              consecutiveErrors = 0;       // success — reset counter
              if (!cancelled) setError(null); // clear any previous error
              if (text && !isWhisperNoise(text)) {
                console.log('[Whisper STT] Transcript:', text);
                onTranscriptRef.current(text.trim(), true);
              }
            } else {
              consecutiveErrors++;
              const err = await res.text();
              console.warn('[Whisper STT] Server error:', err);
              // Only surface the error after 3 consecutive failures
              if (!cancelled && consecutiveErrors >= 3) setError(`Transcription unavailable (${res.status}). Check your connection.`);
            }
          } catch (fetchErr) {
            consecutiveErrors++;
            console.warn('[Whisper STT] Fetch error:', fetchErr);
            if (!cancelled && consecutiveErrors >= 3) setError('Transcription unavailable. Check your connection.');
          }
        } else {
          console.log('[Whisper STT] Chunk too small (silence?), skipping');
        }

        // Queue next chunk
        if (!cancelled) setTimeout(recordChunk, 100);
      };

      recorder.start();
      // Stop after CHUNK_SECS to trigger onstop → transcribe
      setTimeout(() => {
        if (!cancelled && recorder?.state === 'recording') recorder.stop();
      }, CHUNK_SECS * 1000);
    };

    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        setIsListening(true);
        setReady(true);
        setError(null);
        console.log('[Whisper STT] Stream acquired, starting', CHUNK_SECS, 's chunk recording');
        recordChunk();
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[Whisper STT] getUserMedia error:', err);
        setError('Microphone access denied: ' + err.message);
      });

    return () => {
      cancelled = true;
      try { recorder?.state === 'recording' && recorder.stop(); } catch {}
      stream?.getTracks().forEach(t => t.stop());
      stream = null;
      setIsListening(false);
      setReady(false);
    };
  }, [isActive]);

  return { isListening, ready, error };
}

// ─── Slide History Thumbnail ──────────────────────────────────────────────────
function SlideThumbnail({
  slide,
  index,
  isActive,
  onClick,
}: {
  slide: Slide;
  index: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-xl overflow-hidden transition-all text-left"
      style={{
        border: isActive ? '2px solid #7C3AED' : '2px solid rgba(255,255,255,0.08)',
        boxShadow: isActive ? '0 0 0 3px rgba(124,58,237,0.2)' : 'none',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          height: 90,
          overflow: 'hidden',
          position: 'relative',
          background: slide.backgroundImageUrl ? 'transparent' : '#1A1B25',
        }}
      >
        {slide.backgroundImageUrl ? (
          <img src={slide.backgroundImageUrl} alt={slide.content.title} className="w-full h-full object-cover" style={{ filter: 'brightness(0.6)' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1A1040, #0D0B1E)' }} />
        )}
        <div className="absolute inset-0 flex flex-col justify-end p-2" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)' }}>
          <p style={{ color: 'white', fontSize: 9, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
            {slide.content.title}
          </p>
        </div>
        <div className="absolute top-1.5 left-1.5">
          <span style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.7)', fontSize: 8, padding: '1px 5px', borderRadius: 3 }}>
            {index + 1}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PresentationView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addSlide, updateSlide, saveOrUpdate } = usePresentations();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<PresentationPhase>('loading');
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [activeBullets, setActiveBullets] = useState<string[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isFetchingImage, setIsFetchingImage] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewingSlideIdx, setViewingSlideIdx] = useState<number | null>(null); // for history panel review
  const [showHistory, setShowHistory] = useState(false);
  const [showAudioSettings, setShowAudioSettings] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [permissionPending, setPermissionPending] = useState(false);
  const [micPermissionState, setMicPermissionState] = useState<PermissionState | 'unknown'>('unknown');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    () => localStorage.getItem(DEVICE_STORAGE_KEY) ?? '',
  );
  // CC: off by default; persisted per presentation ID
  const [showCC, setShowCC] = useState(false);
  // STT mode: try Web Speech API first; auto-fall back to Whisper on network errors
  // Pre-select Whisper when embedded (iframe) since Web Speech API is always blocked there
  const [sttMode, setSttMode] = useState<'webspeech' | 'whisper'>(IS_EMBEDDED ? 'whisper' : 'webspeech');
  // Delayed error display — only show an error to the user after 5 s of real failures
  const [showSpeechError, setShowSpeechError] = useState(false);
  const speakingStartRef = useRef<number>(0);
  // Voice-command feedback toast  (keyed by counter so repeated same command re-animates)
  const [cmdFeedback, setCmdFeedback] = useState<{ msg: string; id: number } | null>(null);
  const cmdFeedbackTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cmdFeedbackCounterRef = useRef(0);

  // ── Refs to avoid stale closures ────────────────────────────────────────────
  const presentationRef = useRef<Presentation | null>(null);
  const activeSlideIdRef = useRef<string | null>(null);
  const activeBulletsRef = useRef<string[]>([]);
  const phaseRef = useRef<PresentationPhase>('loading');
  const stopRef = useRef<() => void>(() => {});

  // ── Speech buffer refs ───────────────────────────────────────────────────────
  // Accumulates final transcript chunks; flushed when enough content builds up
  const transcriptBufferRef = useRef<string>('');
  const isGeneratingRef = useRef<boolean>(false);

  // ── Sentence buffer ─────────────────────────────────────────────────────────
  // Raw speech accumulates here. A bullet is only produced when the buffer
  // ends with sentence-ending punctuation AND has enough meaningful words.
  // Fragments stay buffered until the speaker completes a thought.
  const sentenceBufferRef = useRef<string>('');

  // ── Blank-slide sentinel ─────────────────────────────────────────────────────
  // When a "next slide" command creates a blank placeholder slide, its ID is
  // stored here so generateSlideFromBuffer can update it in-place (rather than
  // stacking a new slide on top of the empty one).
  const blankSlideIdRef = useRef<string | null>(null);

  const syncState = (p: Presentation | null, slideId: string | null, bullets: string[], ph: PresentationPhase) => {
    presentationRef.current = p;
    activeSlideIdRef.current = slideId;
    activeBulletsRef.current = bullets;
    phaseRef.current = ph;
  };

  useEffect(() => { presentationRef.current = presentation; }, [presentation]);
  useEffect(() => { activeSlideIdRef.current = activeSlideId; }, [activeSlideId]);
  useEffect(() => { activeBulletsRef.current = activeBullets; }, [activeBullets]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const activeSlide = presentation?.slides.find(s => s.id === activeSlideId) ?? null;
  const displayedSlide = viewingSlideIdx !== null
    ? presentation?.slides[viewingSlideIdx] ?? activeSlide
    : activeSlide;

  // ── Audio / mic ─────────────────────────────────────────────────────────────
  const { devices, loading: devicesLoading, error: devicesError, refresh: refreshDevices } = useAudioDevices();
  // During speaking, always use the system default device so the visualiser
  // reflects the SAME audio source the Web Speech API is listening to.
  // (Web Speech API always uses the OS-level default; it ignores deviceId.)
  const { bars } = useAudioAnalyser(
    phase === 'speaking',
    phase === 'speaking' ? undefined : (selectedDeviceId || undefined),
  );

  useEffect(() => {
    if (selectedDeviceId) localStorage.setItem(DEVICE_STORAGE_KEY, selectedDeviceId);
  }, [selectedDeviceId]);

  // Probe mic permission
  useEffect(() => {
    if (!navigator.permissions?.query) return;
    let status: PermissionStatus | null = null;
    const onChange = () => { if (status) setMicPermissionState(status.state); };
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then(s => { status = s; setMicPermissionState(s.state); s.addEventListener('change', onChange); })
      .catch(() => setMicPermissionState('unknown'));
    return () => { status?.removeEventListener('change', onChange); };
  }, []);

  // ── Finalize current slide (save bullets to storage) ───────────────────────
  const finalizeCurrentSlide = useCallback(() => {
    const pres = presentationRef.current;
    const slideId = activeSlideIdRef.current;
    if (!pres || !slideId) return pres;
    const slide = pres.slides.find(s => s.id === slideId);
    if (!slide) return pres;
    // Prefer active bullets when non-empty; fall back to whatever is already stored
    // so we never wipe AI-generated bullets by finalizing with an empty active state.
    const activeBullets = activeBulletsRef.current.filter(b => b.length > 0);
    const existingBullets = slide.content.bullets ?? [];
    const finalBullets = activeBullets.length > 0 ? activeBullets : existingBullets;
    const updated = updateSlide(pres, {
      ...slide,
      content: { ...slide.content, bullets: finalBullets },
    });
    presentationRef.current = updated;
    setPresentation(updated);
    console.log('[Wingman Finalize] slide', slideId, '→ bullets:', finalBullets);
    return updated;
  }, [updateSlide]);

  // ── Synchronously persist bullets to presentationRef + localStorage ───────────
  // Called directly from flushSentenceBuffer so that presentationRef.current
  // is always up-to-date BEFORE any async continuation reads it.
  const persistActiveBullets = useCallback((bullets: string[]) => {
    if (phaseRef.current !== 'speaking' || bullets.length === 0) return;
    const pres = presentationRef.current;
    const slideId = activeSlideIdRef.current;
    if (!pres || !slideId) return;
    const slide = pres.slides.find(s => s.id === slideId);
    if (!slide) return;
    const updatedPres = updateSlide(pres, {
      ...slide,
      content: { ...slide.content, bullets },
    });
    presentationRef.current = updatedPres;
  }, [updateSlide]);

  // Keep a ref so flushSentenceBuffer (which has [] deps) can always call the latest version
  const persistActiveBulletsRef = useRef(persistActiveBullets);
  persistActiveBulletsRef.current = persistActiveBullets;

  // ── Generate a new slide from buffered transcript ──────────────────────────
  // Two-phase: Phase 1 → call AI + create/update slide so the title appears
  // within ~1–2 s. Phase 2 → fetch background image in the background.
  //
  // Special case: if the active slide is a blank placeholder created by a
  // "next slide" command (tracked via blankSlideIdRef), we update it in-place
  // instead of adding a new slide — this prevents orphan blank slides.
  const generateSlideFromBuffer = useCallback(async (buffer: string, minWords = 5) => {
    const wordCount = buffer.trim().split(/\s+/).filter(Boolean).length;
    if (isGeneratingRef.current || wordCount < minWords) return;
    isGeneratingRef.current = true;
    setIsGenerating(true); // ← shimmer bar + "Composing next slide" pill

    // Clear sentence buffer synchronously — we're about to regenerate the slide
    sentenceBufferRef.current = '';

    // Detect blank-placeholder case and consume the sentinel
    const populatingBlankId =
      blankSlideIdRef.current !== null && blankSlideIdRef.current === activeSlideIdRef.current
        ? blankSlideIdRef.current
        : null;
    blankSlideIdRef.current = null;

    // For blank placeholders skip finalizing (no real content there); for normal
    // slides finalize so in-progress bullets are saved to the slide being closed.
    const savedPres = populatingBlankId
      ? (presentationRef.current ?? null)
      : (finalizeCurrentSlide() ?? presentationRef.current);
    if (!savedPres) { isGeneratingRef.current = false; setIsGenerating(false); return; }

    try {
      // ── Phase 1: AI generates ONLY a title from the transcript (~1–2 s) ──
      // We deliberately ignore AI-generated bullets/layout/stats/quote —
      // everything on the slide must come from the speaker's actual speech.
      const result = await generateSlideWithAI(buffer.trim(), savedPres.slides, savedPres.title);
      const aiTitle = (result.content.title ?? '').trim() || 'Untitled';

      let targetSlideId: string;

      if (populatingBlankId) {
        // ── Update blank placeholder in-place ──────────────────────────────
        // Use LATEST presentationRef, not stale savedPres, in case startBlankSlide
        // added more slides during the AI await.
        const latestPres = presentationRef.current ?? savedPres;
        const blankSlide = latestPres.slides.find(s => s.id === populatingBlankId);
        if (!blankSlide) { isGeneratingRef.current = false; setIsGenerating(false); return; }

        // Bullets come ONLY from what flushSentenceBuffer persisted during speech.
        const persistedBullets = (blankSlide.content.bullets ?? []).filter(b => b.length > 0);

        const withContent = updateSlide(latestPres, {
          ...blankSlide,
          layout: persistedBullets.length > 0 ? 'bullets' : 'title',
          content: {
            title: aiTitle,
            bullets: persistedBullets,
          },
          transcript: buffer.trim(),
          generatedAt: Date.now(),
        });
        targetSlideId = populatingBlankId;
        setPresentation(withContent);
        presentationRef.current = withContent;
      } else {
        // ── Standard path: add a new slide (rare; requires no-command flow) ──
        const slideData: Omit<Slide, 'id'> = {
          layout: 'title',
          content: { title: aiTitle, bullets: [] },
          backgroundImageUrl: undefined,
          backgroundImageAlt: undefined,
          unsplashCredit: undefined,
          transcript: buffer.trim(),
          generatedAt: Date.now(),
        };
        const updated = addSlide(savedPres, slideData);
        const newSlide = updated.slides[updated.slides.length - 1];
        targetSlideId = newSlide.id;
        setPresentation(updated);
        presentationRef.current = updated;
        setActiveSlideId(targetSlideId);
        activeSlideIdRef.current = targetSlideId;
        setViewingSlideIdx(null);
        setActiveBullets([]);
        activeBulletsRef.current = [];
      }
      setIsGenerating(false);
      isGeneratingRef.current = false;

      // ── Phase 2: fetch background image (shared by both paths) ───────────
      setIsFetchingImage(true);
      const query = extractUnsplashQuery(aiTitle);
      const image = await fetchUnsplashImage(query);
      setIsFetchingImage(false);

      if (image) {
        const currentPres = presentationRef.current;
        if (!currentPres) return;
        const target = currentPres.slides.find(s => s.id === targetSlideId);
        if (!target) return;
        const withBg = updateSlide(currentPres, {
          ...target,
          backgroundImageUrl: image.url,
          backgroundImageAlt: image.alt,
          unsplashCredit: image.credit,
        });
        setPresentation(withBg);
        presentationRef.current = withBg;
      }
    } catch (err) {
      console.error('generateSlideFromBuffer error:', err);
      setIsGenerating(false);
      isGeneratingRef.current = false;
      setIsFetchingImage(false);
    }
  }, [finalizeCurrentSlide, addSlide, updateSlide]);

  // ── Create a blank placeholder slide (force-next command) ────────────────
  // No title, no bullets, no image fetch. generateSlideFromBuffer will populate
  // the slide in-place once the speaker provides enough content.
  const startBlankSlide = useCallback(async () => {
    // Extract any complete sentences still in the buffer for the slide we're
    // leaving. Anything that isn't a complete sentence (fragment) is discarded.
    flushSentenceBufferRef.current();
    transcriptBufferRef.current = '';
    sentenceBufferRef.current   = '';

    // If already on a blank placeholder don't stack another empty slide —
    // just clear the active state and keep accumulating.
    if (blankSlideIdRef.current !== null && blankSlideIdRef.current === activeSlideIdRef.current) {
      setActiveBullets([]);
      activeBulletsRef.current = [];
      return;
    }

    const savedPres = finalizeCurrentSlide() ?? presentationRef.current;
    if (!savedPres) return;

    const slideData: Omit<Slide, 'id'> = {
      layout: 'bullets',
      content: { title: '', bullets: [] },
      backgroundImageUrl: undefined,
      backgroundImageAlt: undefined,
      unsplashCredit: undefined,
      transcript: '',
      generatedAt: Date.now(),
    };

    const updated    = addSlide(savedPres, slideData);
    const newSlide   = updated.slides[updated.slides.length - 1];
    const newSlideId = newSlide.id;

    blankSlideIdRef.current  = newSlideId; // sentinel: populate in-place later

    setPresentation(updated);
    presentationRef.current  = updated;
    setActiveSlideId(newSlideId);
    activeSlideIdRef.current = newSlideId;
    setActiveBullets([]);
    activeBulletsRef.current = [];
    setViewingSlideIdx(null);

    // Show the "Composing next slide" pill immediately so the user gets visual
    // confirmation that the command was heard. Only set the React state here —
    // NOT isGeneratingRef, which is the guard inside generateSlideFromBuffer.
    // Setting isGeneratingRef here would cause generateSlideFromBuffer to
    // return early every time and never actually run.
    setIsGenerating(true);
  }, [finalizeCurrentSlide, addSlide]);

  // ── End presentation ───────────────────────────────────────────────────────
  const endPresentation = useCallback(() => {
    stopRef.current();
    // Extract any complete sentences still in the buffer as final bullets.
    // Fragments are dropped — nothing incomplete on-screen.
    flushSentenceBufferRef.current();
    transcriptBufferRef.current = '';
    sentenceBufferRef.current = '';
    // Clear generating state so the spinner doesn't persist on the ended screen
    isGeneratingRef.current = false;
    setIsGenerating(false);
    blankSlideIdRef.current = null;
    const finalPres = finalizeCurrentSlide();
    if (finalPres) saveOrUpdate(finalPres);
    setPhase('ended');
    phaseRef.current = 'ended';
    setLiveTranscript('');
  }, [finalizeCurrentSlide, saveOrUpdate]);

  // ── Flash a brief voice-command confirmation toast ─────────────────────────
  const flashCmdFeedback = useCallback((msg: string) => {
    if (cmdFeedbackTimerRef.current) clearTimeout(cmdFeedbackTimerRef.current);
    cmdFeedbackCounterRef.current += 1;
    setCmdFeedback({ msg, id: cmdFeedbackCounterRef.current });
    cmdFeedbackTimerRef.current = setTimeout(() => setCmdFeedback(null), 2200);
  }, []);

  // ── Flush sentence buffer → bullet(s) ───────────────────────────────────────
  // Processes ONE complete sentence at a time from the front of the buffer.
  // Each sentence is independently word-count-checked: short fragments like
  // "Tricks they can." are dropped rather than rolled into a later bullet.
  // Anything after the last punctuation mark stays in the buffer for later.
  // No AI call — bullets come from formatBulletPoint on the user's speech.
  const flushSentenceBuffer = useCallback(() => {
    if (phaseRef.current !== 'speaking') { sentenceBufferRef.current = ''; return; }

    while (true) {
      const buffer = sentenceBufferRef.current.trim();
      if (!buffer) break;
      // Pull the first complete sentence off the front of the buffer
      const match = buffer.match(/^([^.!?]+[.!?]+)(\s+(.*))?$/s);
      if (!match) break;
      const sentence = match[1].trim();
      const rest = (match[3] ?? '').trim();

      const wc = sentence.split(/\s+/).filter(Boolean).length;
      if (wc < SENTENCE_MIN_WORDS) {
        // Fragment — drop it and advance the buffer
        sentenceBufferRef.current = rest;
        console.log('[Wingman SentBuf] Dropped fragment:', sentence);
        continue;
      }

      // Consume this sentence
      sentenceBufferRef.current = rest;

      const bullet = formatBulletPoint(sentence);
      if (!bullet) continue;

      const next = [...activeBulletsRef.current, bullet].slice(-5);
      activeBulletsRef.current = next;
      setActiveBullets(next);
      // Persist synchronously so presentationRef.current + localStorage stay
      // in sync as each bullet lands.
      persistActiveBulletsRef.current(next);
      console.log('[Wingman SentBuf] Bullet:', bullet);
    }
  }, []);

  // Ref so startBlankSlide / endPresentation (defined earlier in this file)
  // can call the latest flushSentenceBuffer without circular refs.
  const flushSentenceBufferRef = useRef(flushSentenceBuffer);
  flushSentenceBufferRef.current = flushSentenceBuffer;

  // ── Add an explicit bullet (voice command) ─────────────────────────────────
  const addExplicitBullet = useCallback((text: string) => {
    const bullet = cleanBullet(text);
    if (!bullet || bullet.length < 3) return;
    console.log('[Wingman CMD] new_bullet:', bullet);
    flashCmdFeedback(`Bullet added`);
    setActiveBullets(prev => {
      const next = [...prev, bullet].slice(-5);
      activeBulletsRef.current = next;
      return next;
    });
    // Add to buffer so AI eventually has context
    transcriptBufferRef.current += (transcriptBufferRef.current ? ' ' : '') + text;
  }, [flashCmdFeedback]);

  // ── Update current slide title (voice command) ─────────────────────────────
  const updateCurrentSlideTitle = useCallback((titleText: string) => {
    const pres    = presentationRef.current;
    const slideId = activeSlideIdRef.current;
    if (!pres || !slideId || !titleText) return;
    const slide = pres.slides.find(s => s.id === slideId);
    if (!slide) return;
    const title = toTitleCase(titleText.replace(/[.!?]+$/, '').trim().slice(0, 80));
    console.log('[Wingman CMD] new_title:', title);
    flashCmdFeedback(`Title → "${title}"`);
    const updated = updateSlide(pres, { ...slide, content: { ...slide.content, title } });
    setPresentation(updated);
    presentationRef.current = updated;
  }, [updateSlide, flashCmdFeedback]);

  // ── Refresh background image for current slide (voice command) ─────────────
  const refreshBackground = useCallback(async (query: string) => {
    const pres    = presentationRef.current;
    const slideId = activeSlideIdRef.current;
    if (!pres || !slideId) return;
    const slide = pres.slides.find(s => s.id === slideId);
    if (!slide) return;
    const q = query || extractUnsplashQuery(slide.content.title);
    console.log('[Wingman CMD] new_background query:', q);
    flashCmdFeedback(`Fetching image for "${q}"`);
    setIsFetchingImage(true);
    const image = await fetchUnsplashImage(q);
    setIsFetchingImage(false);
    if (!image) return;
    const currentPres = presentationRef.current;
    const target = currentPres?.slides.find(s => s.id === slideId);
    if (!currentPres || !target) return;
    const updated = updateSlide(currentPres, {
      ...target,
      backgroundImageUrl: image.url,
      backgroundImageAlt: image.alt,
      unsplashCredit: image.credit,
    });
    setPresentation(updated);
    presentationRef.current = updated;
  }, [updateSlide, flashCmdFeedback]);

  // ── Speech transcript handler ───────────────────────────────────────────────
  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (!isFinal) {
      setLiveTranscript(text);
      return;
    }

    setLiveTranscript('');

    if (phaseRef.current !== 'speaking') return;

    // ── Explicit voice commands ─────────────────────────────────────────────
    // Checked before end-phrases so commands take unconditional priority.
    const cmd = detectVoiceCommand(text);
    if (cmd) {
      if (cmd.type === 'new_bullet') {
        if (cmd.arg) addExplicitBullet(cmd.arg);
      } else if (cmd.type === 'new_title') {
        if (cmd.arg) updateCurrentSlideTitle(cmd.arg);
      } else if (cmd.type === 'new_background') {
        refreshBackground(cmd.arg); // arg may be empty → falls back to slide title
      }
      return; // never fall through to buffer accumulation
    }

    // ── End phrase ──────────────────────────────────────────────────────────
    if (detectEndPhrase(text)) {
      endPresentation();
      return;
    }

    // ── Force-next slide ─────────────────────────────────────────────────────
    // Strict detection: only fires when the whole utterance IS the command.
    // Any embedded occurrence ("let me show you a new slide design…") is
    // intentionally ignored to prevent phantom slides.
    if (stripForceNextPhrase(text) !== null) {
      flashCmdFeedback('Next slide →');
      startBlankSlide();
      return;
    }

    // ── Accumulate into buffer ──────────────────────────────────────────────
    const clean = removeFiller(text.trim());
    if (clean.length < 5) return;

    transcriptBufferRef.current += (transcriptBufferRef.current ? ' ' : '') + clean;

    // ── Sentence buffer — only flushes on sentence-ending punctuation ─────────
    // Raw speech accumulates here. We ONLY produce a bullet when the speaker
    // has finished a sentence (., ?, !) with enough meaningful content.
    // Fragments stay buffered indefinitely — nothing renders until complete.
    sentenceBufferRef.current += (sentenceBufferRef.current ? ' ' : '') + clean;

    // Safety: if buffer grows absurdly large without any punctuation,
    // drop the oldest half to prevent unbounded memory growth.
    const bufWords = sentenceBufferRef.current.split(/\s+/).filter(Boolean);
    if (bufWords.length > SENTENCE_BUFFER_CAP) {
      sentenceBufferRef.current = bufWords.slice(-Math.floor(SENTENCE_BUFFER_CAP / 2)).join(' ');
    }

    // Flush if this latest piece ended a sentence
    if (endsWithSentenceBoundary(clean)) {
      flushSentenceBuffer();
    }

    // ── Auto-populate blank placeholder ──────────────────────────────────────
    // Once 15 words have accumulated after "next slide", fire generateSlideFromBuffer
    // to infer the title and fetch the background image. This replaces the
    // "Composing" spinner that startBlankSlide activated and populates the slide.
    if (
      blankSlideIdRef.current !== null &&
      blankSlideIdRef.current === activeSlideIdRef.current
    ) {
      const tbWords = transcriptBufferRef.current.split(/\s+/).filter(Boolean).length;
      if (tbWords >= 15) {
        const snapshot = transcriptBufferRef.current;
        transcriptBufferRef.current = '';
        generateSlideFromBuffer(snapshot);
      }
    }
  }, [endPresentation, startBlankSlide, generateSlideFromBuffer, addExplicitBullet, updateCurrentSlideTitle, refreshBackground, flashCmdFeedback, flushSentenceBuffer]);

  const { isSupported, isListening: wsListening, error: wsError, start: wsStart, stop: wsStop, retry: wsRetry } = useSpeechRecognition(
    handleTranscript,
    (reason: string) => {
      // Network / audio-capture errors → silently fall back to Whisper instead of showing an error
      const isNetworkLike = /network|audio.capture/i.test(reason);
      if (isNetworkLike) {
        console.log('[Wingman] Web Speech API network error — switching to Whisper STT');
        setSttMode('whisper');
        // Web Speech API has already stopped retrying (shouldRestartRef = false in the hook)
      } else {
        setPermissionError(
          IS_EMBEDDED
            ? 'Microphone is blocked in preview mode. Open this app in a new tab to use it.'
            : reason,
        );
      }
    },
  );

  // Whisper STT — active whenever phase is 'speaking' and we're in whisper mode
  const whisperActive = phase === 'speaking' && sttMode === 'whisper';
  const { isListening: whisperListening, ready: whisperReady, error: whisperError } = useWhisperSTT(
    handleTranscript,
    whisperActive,
  );

  // Unified STT state used by the UI
  const sttListening  = sttMode === 'webspeech' ? wsListening  : whisperListening;
  const retrySpeech   = wsRetry;   // only meaningful in webspeech mode

  // Keep stopRef always current — this is what endPresentation calls
  // In whisper mode wsStop is a no-op (Whisper deactivates via whisperActive going false)
  useEffect(() => { stopRef.current = wsStop; }, [wsStop]);

  // Auto-fallback: if the Web Speech API turns out to be unavailable in this browser,
  // silently switch to Whisper. We wait 300 ms so the useSpeechRecognition effect can
  // set isSupported = true first if the API IS available.
  useEffect(() => {
    if (isSupported || sttMode !== 'webspeech') return;
    const t = setTimeout(() => {
      if (!isSupported) {
        console.log('[Wingman] Web Speech API not available — switching to Whisper STT');
        setSttMode('whisper');
      }
    }, 300);
    return () => clearTimeout(t);
  }, [isSupported, sttMode]);

  // ── Track when speaking starts (for 5-s error delay) ──────────────────────
  useEffect(() => {
    if (phase === 'speaking') {
      speakingStartRef.current = Date.now();
      setShowSpeechError(false); // always reset on new session
    }
  }, [phase]);

  // Expose speech errors only after 5 s of failures — never on first load
  const speechError = sttMode === 'webspeech' ? wsError : whisperError;
  useEffect(() => {
    if (!speechError) { setShowSpeechError(false); return; }
    const elapsed = Date.now() - speakingStartRef.current;
    const delay   = Math.max(0, 5000 - elapsed);
    const t = setTimeout(() => setShowSpeechError(true), delay);
    return () => clearTimeout(t);
  }, [speechError]);

  // ── Start speaking ─────────────────────────────────────────────────────────
  const startSpeaking = useCallback(() => {
    setPermissionError(null);

    const permErrorMsg = IS_EMBEDDED
      ? 'Microphone is blocked in preview mode. Open this app in a new tab.'
      : "Microphone access denied. Click 🔒 in your browser's address bar and allow the microphone.";

    if (micPermissionState === 'denied') { setPermissionError(permErrorMsg); return; }

    const doStart = () => {
      // Reset buffer state at start of each speaking session
      transcriptBufferRef.current = '';
      isGeneratingRef.current = false;
      // Only start Web Speech API when in webspeech mode
      // (Whisper activates automatically via whisperActive once phase = 'speaking')
      if (sttMode === 'webspeech') wsStart();
      setPhase('speaking');
      phaseRef.current = 'speaking';
    };

    if (micPermissionState === 'granted') { doStart(); return; }

    setPermissionPending(true);
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getTracks().forEach(t => t.stop());
        setPermissionPending(false);
        doStart();
      })
      .catch(() => { setPermissionPending(false); setPermissionError(permErrorMsg); });
  }, [micPermissionState, wsStart, sttMode]);

  // ── Load presentation + generate intro slide ───────────────────────────────
  useEffect(() => {
    if (!id) return;
    const p = getPresentation(id);
    if (!p) { navigate('/'); return; }

    if (p.slides.length > 0) {
      // Existing presentation — show ended/review state
      setPresentation(p);
      presentationRef.current = p;
      const lastSlide = p.slides[p.slides.length - 1];
      setActiveSlideId(lastSlide.id);
      activeSlideIdRef.current = lastSlide.id;
      setActiveBullets(lastSlide.content.bullets ?? []);
      activeBulletsRef.current = lastSlide.content.bullets ?? [];
      setPhase('ended');
      phaseRef.current = 'ended';
      return;
    }

    // New presentation — fetch image + create intro slide
    (async () => {
      setIsFetchingImage(true);
      const query = extractUnsplashQuery(p.title);
      const image = await fetchUnsplashImage(query);
      setIsFetchingImage(false);

      const slideData: Omit<Slide, 'id'> = {
        layout: 'title',
        content: { title: p.title, subtitle: '' },
        backgroundImageUrl: image?.url,
        backgroundImageAlt: image?.alt,
        unsplashCredit: image?.credit,
        transcript: '',
        generatedAt: Date.now(),
      };

      const updated = addSlide(p, slideData);
      const introSlide = updated.slides[0];

      setPresentation(updated);
      presentationRef.current = updated;
      setActiveSlideId(introSlide.id);
      activeSlideIdRef.current = introSlide.id;
      setPhase('intro');
      phaseRef.current = 'intro';
    })();
  }, [id]);

  // ── Load CC preference once id is known ────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const stored = localStorage.getItem(`${CC_STORAGE_PREFIX}${id}`);
    if (stored === 'true') setShowCC(true);
  }, [id]);

  const toggleCC = () => {
    setShowCC(prev => {
      const next = !prev;
      if (id) localStorage.setItem(`${CC_STORAGE_PREFIX}${id}`, String(next));
      return next;
    });
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never intercept shortcuts while the user is typing in a text field
      if (isTypingTarget(e)) return;
      if (e.key === 'Escape') {
        if (showAudioSettings) { setShowAudioSettings(false); return; }
        if (phase === 'ended') { navigate('/library'); return; }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, showAudioSettings, navigate]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (phase === 'loading' || !presentation) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#08090E' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
          <p style={{ color: '#64748B', fontSize: 14, fontFamily: '"Space Grotesk", system-ui, sans-serif' }}>
            {isFetchingImage ? 'Finding the perfect backdrop…' : 'Loading…'}
          </p>
        </div>
      </div>
    );
  }

  const slideCount = presentation.slides.length;
  const displayCredit = displayedSlide?.unsplashCredit;

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ background: '#000', fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
    >
      {/* ── Full-screen live slide ─────────────────────────────────── */}
      <LiveSlideView
        backgroundImageUrl={displayedSlide?.backgroundImageUrl}
        backgroundImageAlt={displayedSlide?.backgroundImageAlt}
        title={displayedSlide?.content.title ?? ''}
        bullets={viewingSlideIdx !== null
          ? (displayedSlide?.content.bullets ?? [])
          : activeBullets}
        liveBullet={phase === 'speaking' && viewingSlideIdx === null ? liveTranscript : undefined}
        isLoading={isFetchingImage}
        isGenerating={phase === 'speaking' && viewingSlideIdx === null ? isGenerating : false}
        showCC={showCC}
        credit={displayCredit}
        fontFamily={presentation.fontFamily}
      />

      {/* ── INTRO overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'intro' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.97 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
              style={{
                background: 'rgba(8,9,14,0.85)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 24,
                padding: '52px 60px',
                maxWidth: 480,
                width: '90vw',
                boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.15)',
              }}
            >
              {/* Mic icon */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(99,102,241,0.15))', border: '1px solid rgba(124,58,237,0.4)' }}
              >
                <Mic size={28} style={{ color: '#A78BFA' }} />
              </div>

              <h2 className="text-white mb-2" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
                Your first slide is ready
              </h2>
              <p style={{ color: '#64748B', fontSize: 15, lineHeight: 1.6, marginBottom: 32 }}>
                When you're ready to start, hit the button below and speak naturally. Wingman will build your slides as you talk.
              </p>

              {permissionError && (
                <div className="mb-5 px-4 py-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <p style={{ color: '#F87171', fontSize: 13, lineHeight: 1.5 }}>{permissionError}</p>
                </div>
              )}

              <motion.button
                onClick={startSpeaking}
                disabled={permissionPending}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl text-base font-semibold text-white mb-4"
                style={{
                  background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                  boxShadow: '0 8px 32px rgba(124,58,237,0.4)',
                  cursor: permissionPending ? 'wait' : 'pointer',
                  opacity: permissionPending ? 0.7 : 1,
                }}
              >
                {permissionPending ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <Mic size={20} />
                )}
                {permissionPending ? 'Requesting microphone…' : 'Start Speaking'}
              </motion.button>

              <button
                onClick={() => navigate('/')}
                className="text-sm transition-colors"
                style={{ color: '#475569' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
              >
                ← Back to home
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ENDED overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'ended' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
              style={{
                background: 'rgba(8,9,14,0.9)',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 24,
                padding: '52px 60px',
                maxWidth: 480,
                width: '90vw',
                boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
              }}
            >
              {/* Checkmark */}
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.25), rgba(16,185,129,0.15))', border: '1px solid rgba(16,185,129,0.3)' }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              <h2 className="text-white mb-2" style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em' }}>
                Presentation complete
              </h2>
              <p style={{ color: '#64748B', fontSize: 15, marginBottom: 8 }}>
                {slideCount} slide{slideCount !== 1 ? 's' : ''} generated
              </p>
              <p style={{ color: '#475569', fontSize: 13, lineHeight: 1.6, marginBottom: 32 }}>
                Your slides are saved and ready to polish. Open the editor to refine content, rearrange slides, and export.
              </p>

              <motion.button
                onClick={() => navigate(`/edit/${presentation.id}`)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-base font-semibold text-white mb-3"
                style={{
                  background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                  boxShadow: '0 8px 32px rgba(124,58,237,0.4)',
                }}
              >
                <Edit3 size={18} />
                Edit this presentation
              </motion.button>

              <motion.button
                onClick={() => navigate(`/playback/${presentation.id}`)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-base font-semibold mb-3"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.85)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.11)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
              >
                <Play size={16} fill="currentColor" />
                Replay presentation
              </motion.button>

              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                >
                  New presentation
                </button>
                <button
                  onClick={() => navigate('/library')}
                  className="flex-1 py-3 rounded-xl text-sm font-medium transition-colors"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                >
                  Library
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SPEAKING HUD ──────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'speaking' && (
          <>
            {/* Top bar */}
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-4"
              style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.75), transparent)' }}
            >
              {/* Left: Logo + title */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 14 C9.5 11.5 5.5 9.5 2 11" stroke="white" strokeWidth="1.75" />
                      <path d="M2 11 C5 8.5 9 11 12 14" stroke="white" strokeWidth="1.25" opacity="0.55" />
                      <path d="M12 14 C14.5 11.5 18.5 9.5 22 11" stroke="white" strokeWidth="1.75" />
                      <path d="M22 11 C19 8.5 15 11 12 14" stroke="white" strokeWidth="1.25" opacity="0.55" />
                      <line x1="12" y1="7" x2="12" y2="14" stroke="white" strokeWidth="1.75" />
                      <path d="M10.5 7.5 Q12 5.5 13.5 7.5" stroke="white" strokeWidth="1.5" />
                      <path d="M10 17 L12 15 L14 17" stroke="white" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600 }}>
                    {presentation.title}
                  </span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                  Slide {slideCount}
                </span>
              </div>

              {/* Right: Whisper badge + generating pill + CC + Settings + history */}
              <div className="flex items-center gap-2">
                {/* Whisper AI status — in the top bar, never over the slide */}
                <AnimatePresence>
                  {sttMode === 'whisper' && whisperReady && !showSpeechError && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.25 }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                      style={{ background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.3)' }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: '#A78BFA', animation: whisperListening ? 'pulse 1.2s ease-in-out infinite' : 'none' }}
                      />
                      <span style={{ color: '#A78BFA', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em' }}>
                        Whisper AI
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {(isFetchingImage || isGenerating) && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(124,58,237,0.2)' }}>
                    <div className="w-3 h-3 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
                    <span style={{ color: '#A78BFA', fontSize: 11, fontWeight: 600 }}>
                      {isGenerating && !isFetchingImage ? 'Thinking…' : 'New slide…'}
                    </span>
                  </div>
                )}
                {/* Closed-captions toggle */}
                <button
                  onClick={toggleCC}
                  title={showCC ? 'Hide captions' : 'Show captions'}
                  className="p-2 rounded-xl transition-all"
                  style={{
                    background: showCC ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.1)',
                    color: showCC ? '#A78BFA' : 'rgba(255,255,255,0.7)',
                    border: showCC ? '1px solid rgba(124,58,237,0.45)' : '1px solid transparent',
                  }}
                >
                  <Captions size={16} />
                </button>
                <button
                  onClick={() => setShowHistory(v => !v)}
                  className="p-2 rounded-xl transition-colors"
                  style={{ background: showHistory ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.1)', color: showHistory ? '#A78BFA' : 'rgba(255,255,255,0.7)' }}
                >
                  <Layers size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowAudioSettings(v => {
                      if (!v) refreshDevices(); // load devices when opening
                      return !v;
                    });
                  }}
                  className="p-2 rounded-xl transition-colors"
                  style={{ background: showAudioSettings ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.1)', color: showAudioSettings ? '#A78BFA' : 'rgba(255,255,255,0.7)' }}
                  title="Audio input settings"
                >
                  <Settings2 size={16} />
                </button>
              </div>
            </motion.div>

            {/* Bottom bar: waveform + End button */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="absolute bottom-0 left-0 right-0 z-30 flex items-center gap-4 px-6 pb-6 pt-4"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}
            >
              {/* Live mic indicator — reflects actual STT state */}
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: sttListening ? 'rgba(124,58,237,0.2)' : 'rgba(234,179,8,0.15)',
                  border: sttListening ? '1px solid rgba(124,58,237,0.35)' : '1px solid rgba(234,179,8,0.35)',
                  flexShrink: 0,
                }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: sttListening ? '#A78BFA' : '#FCD34D',
                    animation: sttListening ? 'pulse 1s ease-in-out infinite' : 'none',
                  }}
                />
                <span style={{ color: sttListening ? '#A78BFA' : '#FCD34D', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
                  {sttListening
                    ? (sttMode === 'whisper' ? 'WHISPER' : 'LIVE')
                    : 'WAITING'}
                </span>
              </div>

              {/* Waveform + transcript */}
              <div className="flex-1 flex items-center gap-4 min-w-0">
                <WaveformVisualizer bars={bars} isListening={sttListening} />
                {liveTranscript && (
                  <p className="text-sm truncate" style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', fontSize: 13 }}>
                    {liveTranscript}
                  </p>
                )}
                {!liveTranscript && sttListening && (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                    {sttMode === 'whisper' ? 'Recording chunk' : 'Listening'}
                    <span className="inline-flex gap-px ml-0.5">
                      {[0, 1, 2].map(i => (
                        <span key={i} style={{ animation: `pulse ${0.9 + i * 0.15}s ease-in-out ${i * 0.15}s infinite` }}>.</span>
                      ))}
                    </span>
                  </p>
                )}
                {!liveTranscript && !sttListening && !speechError && (
                  <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>Waiting for mic…</p>
                )}
              </div>

              {/* Slide count chips */}
              {slideCount > 1 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {presentation.slides.map((s, i) => (
                    <div
                      key={s.id}
                      className="w-1.5 h-1.5 rounded-full transition-all"
                      style={{ background: s.id === activeSlideId ? '#A78BFA' : 'rgba(255,255,255,0.25)', transform: s.id === activeSlideId ? 'scale(1.4)' : 'scale(1)' }}
                    />
                  ))}
                </div>
              )}

              {/* End button */}
              <button
                onClick={endPresentation}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#F87171' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
              >
                <Square size={13} fill="#F87171" />
                End
              </button>
            </motion.div>

            {/* Permission error */}
            <AnimatePresence>
              {permissionError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-start gap-3 px-5 py-3 rounded-2xl"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', maxWidth: 500 }}
                >
                  <MicOff size={16} style={{ color: '#F87171', flexShrink: 0, marginTop: 2 }} />
                  <p style={{ color: '#F87171', fontSize: 13, lineHeight: 1.5 }}>{permissionError}</p>
                  <button onClick={() => setPermissionError(null)}>
                    <X size={14} style={{ color: '#F87171' }} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* STT error banner — only shows after 5 s of confirmed failures */}
            <AnimatePresence>
              {showSpeechError && !permissionError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute top-20 left-1/2 -translate-x-1/2 z-50 flex items-start gap-3 px-5 py-3 rounded-2xl"
                  style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', maxWidth: 560 }}
                >
                  <MicOff size={16} style={{ color: '#FCD34D', flexShrink: 0, marginTop: 2 }} />
                  <p style={{ color: '#FCD34D', fontSize: 13, lineHeight: 1.5, flex: 1 }}>{whisperError ?? wsError}</p>
                  {/* Only show Retry in webspeech mode — Whisper retries automatically */}
                  {sttMode === 'webspeech' && (
                    <button
                      onClick={retrySpeech}
                      className="flex-shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
                      style={{ background: 'rgba(234,179,8,0.2)', color: '#FCD34D', border: '1px solid rgba(234,179,8,0.35)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(234,179,8,0.35)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(234,179,8,0.2)')}
                    >
                      Retry
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Voice-command feedback toast */}
            <AnimatePresence>
              {cmdFeedback && (
                <motion.div
                  key={cmdFeedback.id}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl pointer-events-none"
                  style={{ background: 'rgba(124,58,237,0.25)', border: '1px solid rgba(167,139,250,0.35)', backdropFilter: 'blur(12px)' }}
                >
                  <span style={{ fontSize: 11, color: '#C4B5FD', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    ⌘ Command
                  </span>
                  <span style={{ width: 1, height: 12, background: 'rgba(167,139,250,0.3)', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, color: '#E9D5FF', fontWeight: 500 }}>{cmdFeedback.msg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Whisper badge is now in the top bar — removed from here */}
          </>
        )}
      </AnimatePresence>

      {/* ── Slide history drawer (slides that have been generated) ── */}
      <AnimatePresence>
        {showHistory && phase === 'speaking' && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="absolute left-0 top-0 bottom-0 z-20 overflow-y-auto py-20 px-3"
            style={{ width: 220, background: 'rgba(5,5,10,0.95)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p style={{ color: '#475569', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12, paddingLeft: 4 }}>
              {slideCount} slide{slideCount !== 1 ? 's' : ''}
            </p>
            {presentation.slides.map((s, i) => (
              <SlideThumbnail
                key={s.id}
                slide={s}
                index={i}
                isActive={viewingSlideIdx === i || (viewingSlideIdx === null && s.id === activeSlideId)}
                onClick={() => {
                  if (viewingSlideIdx === i) {
                    setViewingSlideIdx(null); // click current → go back to live
                  } else {
                    setViewingSlideIdx(i);
                  }
                }}
              />
            ))}
            {viewingSlideIdx !== null && (
              <button
                onClick={() => setViewingSlideIdx(null)}
                className="w-full py-2 rounded-xl text-xs font-semibold mt-2"
                style={{ background: 'rgba(124,58,237,0.2)', color: '#A78BFA' }}
              >
                ← Back to live
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Audio settings panel ────────────────────────────────────── */}
      <AnimatePresence>
        {showAudioSettings && (
          <div className="absolute top-16 right-6 z-50">
            <AudioDeviceSettings
              devices={devices}
              loading={devicesLoading}
              error={devicesError}
              selectedDeviceId={selectedDeviceId}
              onSelect={id => { setSelectedDeviceId(id); setShowAudioSettings(false); }}
              onClose={() => setShowAudioSettings(false)}
              onRefresh={refreshDevices}
            />
          </div>
        )}
      </AnimatePresence>

      {/* "Speech API not supported" warning on intro screen */}
      {!isSupported && phase === 'intro' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl z-50"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p style={{ color: '#F87171', fontSize: 13 }}>
            Speech recognition is not available in this browser. Please use Chrome or Edge.
          </p>
        </div>
      )}
    </div>
  );
}