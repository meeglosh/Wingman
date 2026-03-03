import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, Edit3, X, Square, Layers, ChevronLeft, ChevronRight, Settings2, Captions, Play } from 'lucide-react';
import { getPresentation } from '../utils/storage';
import { usePresentations } from '../context/PresentationContext';
import { toTitleCase, removeFiller, cleanBullet, extractUnsplashQuery, generateSlideFromSpeech, generateSlideWithAI } from '../utils/slideGenerator';
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

// ─── Theme-shift phrase detection ────────────────────────────────────────────
const THEME_SHIFT_PHRASES = [
  "now let's talk about", "now let's look at", "now let's move to", "now let's discuss",
  "moving on to", "moving on,",
  "turning now to", "turning to",
  "let's move on to", "let's now look at", "let's now talk about",
  "let's discuss", "let's explore",
  "i want to talk about", "i'd like to talk about", "i'd like to move on to",
  "i now want to", "i also want to",
  "on a different note,", "on another note,",
  "that brings me to", "which brings me to",
  "speaking of", "this leads me to",
  "another key point", "another important point",
  "another topic", "another area",
  "the next topic", "the next section",
];

/**
 * If text contains a theme-shift phrase, returns the content that came AFTER
 * the trigger phrase (to seed the new slide's title), otherwise null.
 */
function detectThemeShift(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of THEME_SHIFT_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx >= 0) {
      return text.slice(idx + phrase.length).replace(/^[\s,;.]+/, '').trim();
    }
  }
  return null;
}

// ─── Force-next slide phrases ─────────────────────────────────────────────────
// These trigger immediate slide generation from the current buffer, regardless
// of word count. "next slide" / "next slide please" are the primary triggers.
const FORCE_NEXT_PHRASES = [
  "next slide please",
  "next slide, please",
  "go to the next slide",
  "move to the next slide",
  "advance to the next slide",
  "next slide",
  "next page please",
  "go to next slide",
];

/**
 * If text contains a force-next trigger, returns the content that came AFTER
 * the trigger phrase (to seed the next slide's buffer), otherwise null.
 */
function detectForceNext(text: string): string | null {
  const lower = text.toLowerCase();
  for (const phrase of FORCE_NEXT_PHRASES) {
    const idx = lower.indexOf(phrase);
    if (idx >= 0) {
      return text.slice(idx + phrase.length).replace(/^[\s,;.]+/, '').trim();
    }
  }
  return null;
}

function extractTitleFromShift(afterPhrase: string, fullText: string): string {
  const source = afterPhrase || fullText;
  const clean = source
    .replace(/[.!?]+$/, '')
    .replace(/^(is |are |the |a |an )/i, '')
    .trim()
    .slice(0, 80);
  return toTitleCase(clean) || 'New Section';
}

// ─── Speech Recognition Hook ─────────────────────────────────────────────────
function useSpeechRecognition(
  onTranscript: (text: string, isFinal: boolean) => void,
  onFatalError?: () => void,
) {
  const recognitionRef = useRef<any>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldRestartRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => { onTranscriptRef.current = onTranscript; });

  useEffect(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;
    setIsSupported(true);
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (final) onTranscriptRef.current(final, true);
      else if (interim) onTranscriptRef.current(interim, false);
    };

    rec.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      console.error('Speech recognition error:', e.error);
      if (e.error === 'not-allowed') {
        shouldRestartRef.current = false;
        setError('Microphone access was denied. Click the 🔒 in your browser address bar, allow the microphone, then try again.');
        onFatalError?.();
        return;
      }
      setError(`Speech error: ${e.error}`);
    };

    rec.onend = () => {
      setIsListening(false);
      if (shouldRestartRef.current) {
        const t = setTimeout(() => {
          if (!shouldRestartRef.current) return;
          try { rec.start(); setIsListening(true); } catch (err) { console.warn('Restart failed:', err); }
        }, 150);
        return () => clearTimeout(t);
      }
    };

    recognitionRef.current = rec;
    return () => { shouldRestartRef.current = false; try { rec.abort(); } catch {} };
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    shouldRestartRef.current = true;
    try { recognitionRef.current.start(); setIsListening(true); }
    catch (e) { console.warn('Speech start (may already be running):', e); }
  }, []);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    setIsListening(false);
    try { recognitionRef.current?.stop(); } catch {}
  }, []);

  return { isSupported, isListening, error, start, stop };
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

  // ── Refs to avoid stale closures ────────────────────────────────────────────
  const presentationRef = useRef<Presentation | null>(null);
  const activeSlideIdRef = useRef<string | null>(null);
  const activeBulletsRef = useRef<string[]>([]);
  const phaseRef = useRef<PresentationPhase>('loading');
  const stopRef = useRef<() => void>(() => {});

  // ── Speech buffer refs ───────────────────────────────────────────────────────
  // Accumulates final transcript chunks; flushed when enough content builds up
  const transcriptBufferRef = useRef<string>('');
  const lastSlideTimeRef = useRef<number>(Date.now());
  const isGeneratingRef = useRef<boolean>(false);

  // Thresholds for auto-generating a new slide
  const WORD_THRESHOLD = 35;   // ~15 s of natural speech
  const TIME_THRESHOLD = 22000; // hard cap: generate after 22 s even if fewer words
  const MIN_WORDS_FOR_TIME = 12; // don't generate on timer if barely any content

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
  const { devices } = useAudioDevices();
  const { bars } = useAudioAnalyser(
    phase === 'speaking' && micPermissionState === 'granted',
    selectedDeviceId || undefined,
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
    const bullets = activeBulletsRef.current;
    if (!pres || !slideId) return pres;
    const slide = pres.slides.find(s => s.id === slideId);
    if (!slide) return pres;
    const updated = updateSlide(pres, {
      ...slide,
      content: { ...slide.content, bullets: bullets.filter(b => b.length > 0) },
    });
    presentationRef.current = updated;
    setPresentation(updated);
    return updated;
  }, [updateSlide]);

  // ── Generate a new slide from buffered transcript ──────────────────────────
  // Two-phase: Phase 1 → call AI + create slide immediately so the title appears
  // within ~1–2 s. Phase 2 → fetch background image in the background and update
  // the slide in place so the crossfade fires once the image is ready.
  const generateSlideFromBuffer = useCallback(async (buffer: string, minWords = 5) => {
    const wordCount = buffer.trim().split(/\s+/).filter(Boolean).length;
    if (isGeneratingRef.current || wordCount < minWords) return;
    isGeneratingRef.current = true;
    setIsGenerating(true); // ← shimmer bar + "Composing next slide" pill

    const savedPres = finalizeCurrentSlide() ?? presentationRef.current;
    if (!savedPres) { isGeneratingRef.current = false; setIsGenerating(false); return; }

    try {
      // ── Phase 1: AI generates title + layout + bullets (~1–2 s) ─────────
      const result = await generateSlideWithAI(buffer.trim(), savedPres.slides, savedPres.title);

      // Create the slide immediately — no background image yet.
      // The gradient fallback will show until Phase 2 completes.
      const slideData: Omit<Slide, 'id'> = {
        layout: result.layout,
        content: result.content,
        backgroundImageUrl: undefined,
        backgroundImageAlt: undefined,
        unsplashCredit: undefined,
        transcript: buffer.trim(),
        generatedAt: Date.now(),
      };

      const updated = addSlide(savedPres, slideData);
      const newSlide = updated.slides[updated.slides.length - 1];
      const newSlideId = newSlide.id; // capture for Phase 2 closure

      // Activate the new slide right now — user sees title + bullets immediately
      setPresentation(updated);
      presentationRef.current = updated;
      setActiveSlideId(newSlideId);
      activeSlideIdRef.current = newSlideId;
      setActiveBullets([]);
      activeBulletsRef.current = [];
      setViewingSlideIdx(null);
      setIsGenerating(false);       // composing pill disappears
      isGeneratingRef.current = false; // allow next generation while image loads

      // ── Phase 2: fetch background image in background ────────────────────
      setIsFetchingImage(true);
      const query = extractUnsplashQuery(result.content.title);
      const image = await fetchUnsplashImage(query);
      setIsFetchingImage(false);

      if (image) {
        // Safely update only the slide we just created (presentation may have
        // grown while the image was fetching — always read from the ref)
        const currentPres = presentationRef.current;
        if (!currentPres) return;
        const target = currentPres.slides.find(s => s.id === newSlideId);
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

  // ── Add a new slide (explicit theme shift / force-next with thin buffer) ──
  // Same two-phase approach: create the slide shell immediately, fetch the
  // image in the background so it crossfades in once ready.
  const startNewSlide = useCallback(async (themeContext: string) => {
    transcriptBufferRef.current = '';
    lastSlideTimeRef.current = Date.now();

    const savedPres = finalizeCurrentSlide() ?? presentationRef.current;
    if (!savedPres) return;

    const title = extractTitleFromShift(themeContext, themeContext) || 'Next Section';

    // Phase 1: create slide with title immediately (no image yet)
    const slideData: Omit<Slide, 'id'> = {
      layout: 'bullets',
      content: { title, bullets: [] },
      backgroundImageUrl: undefined,
      backgroundImageAlt: undefined,
      unsplashCredit: undefined,
      transcript: '',
      generatedAt: Date.now(),
    };

    const updated = addSlide(savedPres, slideData);
    const newSlide = updated.slides[updated.slides.length - 1];
    const newSlideId = newSlide.id;

    setPresentation(updated);
    presentationRef.current = updated;
    setActiveSlideId(newSlideId);
    activeSlideIdRef.current = newSlideId;
    setActiveBullets([]);
    activeBulletsRef.current = [];
    setViewingSlideIdx(null);

    // Phase 2: image in background
    setIsFetchingImage(true);
    const query = extractUnsplashQuery(title);
    const image = await fetchUnsplashImage(query);
    setIsFetchingImage(false);

    if (image) {
      const currentPres = presentationRef.current;
      if (!currentPres) return;
      const target = currentPres.slides.find(s => s.id === newSlideId);
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
  }, [finalizeCurrentSlide, addSlide, updateSlide]);

  // ── End presentation ───────────────────────────────────────────────────────
  const endPresentation = useCallback(() => {
    stopRef.current();
    // Flush any remaining buffer content as a final slide
    const remaining = transcriptBufferRef.current.trim();
    transcriptBufferRef.current = '';
    const finalPres = finalizeCurrentSlide();
    if (finalPres) saveOrUpdate(finalPres);
    setPhase('ended');
    phaseRef.current = 'ended';
    setLiveTranscript('');
  }, [finalizeCurrentSlide, saveOrUpdate]);

  // ── Speech transcript handler ───────────────────────────────────────────────
  const handleTranscript = useCallback((text: string, isFinal: boolean) => {
    if (!isFinal) {
      setLiveTranscript(text);
      return;
    }

    setLiveTranscript('');

    if (phaseRef.current !== 'speaking') return;

    // ── End phrase ──────────────────────────────────────────────────────────
    if (detectEndPhrase(text)) {
      endPresentation();
      return;
    }

    // ── Theme shift → flush current buffer, then start new slide ───────────
    const afterShift = detectThemeShift(text);
    if (afterShift !== null) {
      const currentBuffer = transcriptBufferRef.current.trim();
      transcriptBufferRef.current = '';
      lastSlideTimeRef.current = Date.now();

      if (currentBuffer.split(/\s+/).filter(Boolean).length >= 10) {
        // Enough buffered content → generate a slide from it, then
        // seed the next buffer with the post-shift context
        generateSlideFromBuffer(currentBuffer).then(() => {
          transcriptBufferRef.current = afterShift;
        });
      } else {
        // Buffer too short for its own slide; use the legacy theme-shift handler
        startNewSlide(extractTitleFromShift(afterShift, text));
        transcriptBufferRef.current = afterShift;
      }
      return;
    }

    // ── Force-next slide → flush current buffer, then start new slide ──────
    const forceNextContext = detectForceNext(text);
    if (forceNextContext !== null) {
      const currentBuffer = transcriptBufferRef.current.trim();
      transcriptBufferRef.current = '';
      lastSlideTimeRef.current = Date.now();

      if (currentBuffer.split(/\s+/).filter(Boolean).length >= 10) {
        // Enough buffered content → generate a slide from it, then
        // seed the next buffer with the post-shift context
        generateSlideFromBuffer(currentBuffer).then(() => {
          transcriptBufferRef.current = forceNextContext;
        });
      } else {
        // Buffer too short for its own slide; use the legacy theme-shift handler
        startNewSlide(extractTitleFromShift(forceNextContext, text));
        transcriptBufferRef.current = forceNextContext;
      }
      return;
    }

    // ── Accumulate into buffer ──────────────────────────────────────────────
    const clean = removeFiller(text.trim());
    if (clean.length < 5) return;

    transcriptBufferRef.current += (transcriptBufferRef.current ? ' ' : '') + clean;

    // Show the sentence as a live bullet so the user sees progress
    const bullet = cleanBullet(clean);
    if (bullet.length >= 5) {
      setActiveBullets(prev => {
        const next = [...prev, bullet].slice(-5);
        activeBulletsRef.current = next;
        return next;
      });
    }

    // ── Word-count threshold → auto-generate slide ─────────────────────────
    const wordCount = transcriptBufferRef.current.split(/\s+/).filter(Boolean).length;
    if (wordCount >= WORD_THRESHOLD) {
      const buffer = transcriptBufferRef.current;
      transcriptBufferRef.current = '';
      lastSlideTimeRef.current = Date.now();
      generateSlideFromBuffer(buffer);
    }
  }, [endPresentation, startNewSlide, generateSlideFromBuffer]);

  const { isSupported, error: speechError, start, stop } = useSpeechRecognition(
    handleTranscript,
    () => {
      setPhase(prev => prev === 'speaking' ? 'speaking' : prev); // keep phase, just show error
      setPermissionError(IS_EMBEDDED
        ? 'Microphone is blocked in preview mode. Open this app in a new tab to use it.'
        : "Microphone access denied.");
    },
  );

  // Keep stopRef always current — this is what endPresentation calls
  useEffect(() => { stopRef.current = stop; }, [stop]);

  // ── Time-based slide generation safety net ─────────────────────────────────
  useEffect(() => {
    if (phase !== 'speaking') return;
    const timer = setInterval(() => {
      const elapsed = Date.now() - lastSlideTimeRef.current;
      const buffer = transcriptBufferRef.current;
      const wordCount = buffer.split(/\s+/).filter(Boolean).length;
      if (elapsed >= TIME_THRESHOLD && wordCount >= MIN_WORDS_FOR_TIME && !isGeneratingRef.current) {
        transcriptBufferRef.current = '';
        lastSlideTimeRef.current = Date.now();
        generateSlideFromBuffer(buffer);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [phase, generateSlideFromBuffer]);

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
      lastSlideTimeRef.current = Date.now();
      isGeneratingRef.current = false;
      start();
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
  }, [micPermissionState, start]);

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

              {/* Right: CC + Settings + history toggle + image loading indicator */}
              <div className="flex items-center gap-2">
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
                  onClick={() => setShowAudioSettings(v => !v)}
                  className="p-2 rounded-xl transition-colors"
                  style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
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
              {/* Live mic indicator */}
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.35)', flexShrink: 0 }}
              >
                <div className="w-2 h-2 rounded-full bg-purple-400" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
                <span style={{ color: '#A78BFA', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>LIVE</span>
              </div>

              {/* Waveform + transcript */}
              <div className="flex-1 flex items-center gap-4 min-w-0">
                <WaveformVisualizer bars={bars} isListening={true} />
                {liveTranscript && (
                  <p className="text-sm truncate" style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', fontSize: 13 }}>
                    {liveTranscript}
                  </p>
                )}
                {!liveTranscript && (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                    Listening
                    <span className="inline-flex gap-px ml-0.5">
                      {[0, 1, 2].map(i => (
                        <span key={i} style={{ animation: `pulse ${0.9 + i * 0.15}s ease-in-out ${i * 0.15}s infinite` }}>.</span>
                      ))}
                    </span>
                  </p>
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
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute top-16 right-6 z-50"
            style={{ width: 320 }}
          >
            <AudioDeviceSettings
              devices={devices}
              selectedDeviceId={selectedDeviceId}
              onSelect={id => { setSelectedDeviceId(id); setShowAudioSettings(false); }}
              onClose={() => setShowAudioSettings(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Speech not supported warning */}
      {!isSupported && phase === 'intro' && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl z-50"
          style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
          <p style={{ color: '#FCD34D', fontSize: 13 }}>
            Speech recognition is not supported in this browser. Try Chrome or Edge.
          </p>
        </div>
      )}
    </div>
  );
}