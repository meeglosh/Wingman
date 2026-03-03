import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, X, Grid3X3, Maximize, Minimize } from 'lucide-react';
import { getPresentation } from '../utils/storage';
import { getTheme } from '../utils/themes';
import { SlideRenderer } from '../components/SlideRenderer';
import type { Presentation, Slide } from '../types/presentation';

const SLIDE_W = 1280;
const SLIDE_H = 720;

// ─── Progress Dots ─────────────────────────────────────────────────────────────
function ProgressDots({ total, current }: { total: number; current: number }) {
  const MAX_VISIBLE = 12;
  if (total <= 1) return null;

  if (total <= MAX_VISIBLE) {
    return (
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === current ? 20 : 6,
              height: 6,
              background: i === current
                ? 'rgba(255,255,255,0.9)'
                : i < current
                  ? 'rgba(255,255,255,0.4)'
                  : 'rgba(255,255,255,0.15)',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 500 }}>
      {current + 1} / {total}
    </span>
  );
}

// ─── Slide Filmstrip ───────────────────────────────────────────────────────────
function Filmstrip({
  slides,
  currentIdx,
  theme,
  onSelect,
}: {
  slides: Slide[];
  currentIdx: number;
  theme: ReturnType<typeof getTheme>;
  onSelect: (i: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.children[currentIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [currentIdx]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-3 px-4 py-3 overflow-x-auto"
      ref={listRef}
      style={{ scrollbarWidth: 'none' }}
    >
      {slides.map((slide, i) => {
        const isActive = i === currentIdx;
        const thumbW = 120;
        const thumbH = 68;
        const scale = thumbW / SLIDE_W;

        return (
          <button
            key={slide.id}
            onClick={() => onSelect(i)}
            className="flex-shrink-0 relative rounded-lg overflow-hidden transition-all duration-200"
            style={{
              width: thumbW,
              height: thumbH,
              border: isActive
                ? '2px solid rgba(255,255,255,0.9)'
                : '2px solid rgba(255,255,255,0.12)',
              boxShadow: isActive ? '0 0 0 2px rgba(124,58,237,0.6)' : 'none',
              transform: isActive ? 'scale(1.05)' : 'scale(1)',
            }}
          >
            <div
              style={{
                width: thumbW,
                height: thumbH,
                overflow: 'hidden',
                position: 'relative',
                background: slide.backgroundImageUrl ? '#000' : theme.background,
              }}
            >
              {/* Mini slide render — SlideRenderer handles the scale internally */}
              <SlideRenderer slide={slide} theme={theme} scale={scale} />
            </div>

            {/* Slide number badge */}
            <div
              className="absolute bottom-1 right-1 rounded text-white"
              style={{ background: 'rgba(0,0,0,0.6)', fontSize: 8, padding: '1px 4px', fontWeight: 700 }}
            >
              {i + 1}
            </div>
          </button>
        );
      })}
    </motion.div>
  );
}

// ─── Unsplash credit ───────────────────────────────────────────────────────────
function Credit({ slide }: { slide: Slide }) {
  if (!slide.unsplashCredit) return null;
  return (
    <a
      href={slide.unsplashCredit.profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="transition-opacity hover:opacity-100"
      style={{
        color: 'rgba(255,255,255,0.35)',
        fontSize: 10,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      📷 {slide.unsplashCredit.name} · Unsplash
    </a>
  );
}

// ─── Main Playback Component ───────────────────────────────────────────────────
export default function PlaybackView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1); // 1 = forward, -1 = backward
  const [showHUD, setShowHUD] = useState(true);
  const [showFilmstrip, setShowFilmstrip] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const hudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Load presentation ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const p = getPresentation(id);
    if (!p || p.slides.length === 0) {
      setNotFound(true);
      return;
    }
    setPresentation(p);
    setCurrentIdx(0);
  }, [id]);

  // ── HUD auto-hide ─────────────────────────────────────────────────────────
  const resetHudTimer = useCallback(() => {
    setShowHUD(true);
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    hudTimerRef.current = setTimeout(() => {
      setShowHUD(false);
      setShowFilmstrip(false);
    }, 3000);
  }, []);

  useEffect(() => {
    resetHudTimer();
    return () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    };
  }, []);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const goTo = useCallback((idx: number, dir?: 1 | -1) => {
    if (!presentation) return;
    const clamped = Math.max(0, Math.min(idx, presentation.slides.length - 1));
    const resolvedDir = dir ?? (clamped > currentIdx ? 1 : -1);
    setDirection(resolvedDir);
    setCurrentIdx(clamped);
    resetHudTimer();
  }, [presentation, currentIdx, resetHudTimer]);

  const goNext = useCallback(() => {
    if (!presentation) return;
    if (currentIdx < presentation.slides.length - 1) {
      goTo(currentIdx + 1, 1);
    }
  }, [presentation, currentIdx, goTo]);

  const goPrev = useCallback(() => {
    if (currentIdx > 0) goTo(currentIdx - 1, -1);
  }, [currentIdx, goTo]);

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      resetHudTimer();
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          goPrev();
          break;
        case 'Home':
          e.preventDefault();
          goTo(0, -1);
          break;
        case 'End':
          e.preventDefault();
          if (presentation) goTo(presentation.slides.length - 1, 1);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'g':
        case 'G':
          setShowFilmstrip(v => !v);
          resetHudTimer();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          } else {
            navigate(`/edit/${id}`);
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, goTo, presentation, navigate, id, resetHudTimer, toggleFullscreen]);

  // ── Mouse move → show HUD ─────────────────────────────────────────────────
  const onMouseMove = useCallback(() => resetHudTimer(), [resetHudTimer]);

  // ── Responsive scale ──────────────────────────────────────────────────────
  const [winSize, setWinSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setWinSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Not found state ───────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div
        className="fixed inset-0 flex flex-col items-center justify-center gap-6"
        style={{ background: '#08090E', fontFamily: '"Space Grotesk", system-ui, sans-serif' }}
      >
        <div className="text-center">
          <p style={{ color: '#64748B', fontSize: 16, marginBottom: 16 }}>
            No slides found for this presentation.
          </p>
          <button
            onClick={() => navigate('/library')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}
          >
            Back to Library
          </button>
        </div>
      </div>
    );
  }

  if (!presentation) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#08090E' }}>
        <div className="w-10 h-10 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const theme = getTheme(presentation.themeId);
  const slide = presentation.slides[currentIdx];
  const total = presentation.slides.length;
  const isFirst = currentIdx === 0;
  const isLast = currentIdx === total - 1;

  // Compute slide scale to fill available canvas
  const scale = Math.min(winSize.w / SLIDE_W, winSize.h / SLIDE_H);
  const renderedW = SLIDE_W * scale;
  const renderedH = SLIDE_H * scale;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: '#000', cursor: showHUD ? 'default' : 'none' }}
      onMouseMove={onMouseMove}
      onClick={(e) => {
        // Click right half = next, left half = prev
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x > rect.width / 2) goNext();
        else goPrev();
        resetHudTimer();
      }}
    >
      {/* ── Slide canvas ───────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ background: slide.backgroundImageUrl ? '#000' : theme.background }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: direction * 48, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: direction * -48, scale: 0.985 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{ width: renderedW, height: renderedH, position: 'relative', overflow: 'hidden' }}
          >
            <SlideRenderer slide={slide} theme={theme} scale={scale} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Click zone hints (invisible left/right halves) ─────────────── */}
      {showHUD && (
        <>
          {/* Left arrow zone */}
          {!isFirst && (
            <button
              className="absolute left-0 top-0 h-full flex items-center justify-start pl-5 group z-20"
              style={{ width: '12%', background: 'transparent', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
            >
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center rounded-full w-10 h-10 transition-all"
                style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ArrowLeft size={18} style={{ color: 'rgba(255,255,255,0.8)' }} />
              </motion.div>
            </button>
          )}

          {/* Right arrow zone */}
          {!isLast && (
            <button
              className="absolute right-0 top-0 h-full flex items-center justify-end pr-5 group z-20"
              style={{ width: '12%', background: 'transparent', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); goNext(); }}
            >
              <motion.div
                className="flex items-center justify-center rounded-full w-10 h-10 transition-all"
                style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ArrowRight size={18} style={{ color: 'rgba(255,255,255,0.8)' }} />
              </motion.div>
            </button>
          )}
        </>
      )}

      {/* ── Top HUD ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showHUD && (
          <motion.div
            key="top-hud"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-3"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
              pointerEvents: 'all',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left: exit + title */}
            <div className="flex items-center gap-3">
              {/* Wingman wing logo */}
              <div className="flex items-center gap-2">
                <svg width="22" height="14" viewBox="0 0 44 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M22 4 C22 4 8 2 2 10 C6 10 10 12 12 16 C14 12 18 10 22 10 C26 10 30 12 32 16 C34 12 38 10 42 10 C36 2 22 4 22 4Z"
                    stroke="white"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 16 C12 20 14 24 22 26 C30 24 32 20 32 16"
                    stroke="white"
                    strokeWidth="1.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              <button
                onClick={() => navigate(`/edit/${id}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  color: 'rgba(255,255,255,0.65)',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
              >
                <X size={12} />
                Exit
              </button>

              <span
                className="hidden sm:block text-sm font-semibold"
                style={{ color: 'rgba(255,255,255,0.8)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {presentation.title}
              </span>
            </div>

            {/* Right: controls */}
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowFilmstrip(v => !v); resetHudTimer(); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                title="Toggle slide panel (G)"
                style={{
                  color: showFilmstrip ? '#A78BFA' : 'rgba(255,255,255,0.6)',
                  background: showFilmstrip ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.07)',
                  border: `1px solid ${showFilmstrip ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.1)'}`,
                }}
              >
                <Grid3X3 size={14} />
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                title="Toggle fullscreen (F)"
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bottom HUD ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showHUD && (
          <motion.div
            key="bottom-hud"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="absolute bottom-0 left-0 right-0 z-30 flex flex-col"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
              pointerEvents: 'all',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Filmstrip */}
            <AnimatePresence>
              {showFilmstrip && (
                <Filmstrip
                  slides={presentation.slides}
                  currentIdx={currentIdx}
                  theme={theme}
                  onSelect={(i) => goTo(i)}
                />
              )}
            </AnimatePresence>

            {/* Bottom bar */}
            <div className="flex items-center justify-between px-5 pb-4 pt-2 gap-4">
              {/* Prev button */}
              <button
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                disabled={isFirst}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-all disabled:opacity-20"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'white',
                }}
              >
                <ArrowLeft size={15} />
              </button>

              {/* Center: progress + keyboard hint */}
              <div className="flex flex-col items-center gap-1.5 flex-1">
                <ProgressDots total={total} current={currentIdx} />
                <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, margin: 0 }}>
                  ← → to navigate · ESC to exit · F for fullscreen
                </p>
              </div>

              {/* Next / Done button */}
              {isLast ? (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/edit/${id}`); }}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: 'linear-gradient(135deg, #7C3AED, #6D28D9)',
                    color: 'white',
                    boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
                  }}
                >
                  Done
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); goNext(); }}
                  className="flex items-center justify-center w-8 h-8 rounded-full transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white',
                  }}
                >
                  <ArrowRight size={15} />
                </button>
              )}
            </div>

            {/* Unsplash credit (bottom-right corner) */}
            <div className="absolute bottom-4 right-5">
              <Credit slide={slide} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Slide counter badge (always visible, subtle) ────────────────── */}
      <AnimatePresence>
        {!showHUD && (
          <motion.div
            key="counter"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 z-20"
            style={{
              background: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(8px)',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 11,
              fontFamily: '"Space Grotesk", system-ui, sans-serif',
              pointerEvents: 'none',
            }}
          >
            {currentIdx + 1} / {total}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── End of deck overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {isLast && showHUD && (
          <motion.div
            key="end-badge"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ delay: 0.3, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
          >
            <div
              className="px-6 py-3 rounded-2xl text-center"
              style={{
                background: 'rgba(8,9,14,0.75)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
              }}
            >
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
                End of presentation
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}