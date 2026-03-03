import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Title animation variants ─────────────────────────────────────────────────
// A pool of entry/exit animations for slide titles — mixed crossfades,
// rises, scales, and lateral slides. Weighted toward the subtler ones.
const TITLE_VARIANTS = [
  // 0 — Rise & fade (gentle, most common)
  {
    initial: { opacity: 0, y: 36 },
    animate: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: -14 },
    transition: { duration: 0.62, ease: [0.16, 1, 0.3, 1] },
  },
  // 1 — Pure crossfade (clean, minimal)
  {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit:    { opacity: 0 },
    transition: { duration: 0.72, ease: 'easeInOut' },
  },
  // 2 — Scale in (more dramatic)
  {
    initial: { opacity: 0, scale: 0.86, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit:    { opacity: 0, scale: 1.07 },
    transition: { duration: 0.56, ease: [0.16, 1, 0.3, 1] },
  },
  // 3 — Slide from left
  {
    initial: { opacity: 0, x: -56 },
    animate: { opacity: 1, x: 0 },
    exit:    { opacity: 0, x: 28 },
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
  // 4 — Slight rise (softer variation of 0)
  {
    initial: { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: -8 },
    transition: { duration: 0.5, ease: 'easeOut' },
  },
] as const;

// Weighted cycle: rise (0) appears most, crossfade (1) next, then variety
const VARIANT_SEQUENCE = [0, 1, 0, 2, 0, 4, 0, 3, 1, 0, 4, 2] as const;

// ─── Types ───────────────────────────────────────────────────────────────────
interface LiveSlideViewProps {
  backgroundImageUrl?: string;
  backgroundImageAlt?: string;
  title: string;
  bullets: string[];
  liveBullet?: string;        // interim transcript (ghost / CC source)
  isLoading?: boolean;        // while fetching initial image
  isGenerating?: boolean;     // AI is actively composing the next slide
  showCC?: boolean;           // closed-captions strip
  credit?: { name: string; profileUrl: string };
}

// ─── Component ───────────────────────────────────────────────────────────────
export function LiveSlideView({
  backgroundImageUrl,
  backgroundImageAlt,
  title,
  bullets,
  liveBullet,
  isLoading,
  isGenerating,
  showCC,
  credit,
}: LiveSlideViewProps) {
  const displayBullets = bullets.slice(-5);

  // ── Staggered title reveal ──────────────────────────────────────────────────
  // When the background changes, we delay the title swap so the image can
  // start crossfading in before the text morphs. Title-only changes (initial
  // load, corrections) apply immediately.
  const [displayedTitle, setDisplayedTitle] = useState(title);
  const [titleKey,        setTitleKey]        = useState(0);
  const [variantSeqIdx,   setVariantSeqIdx]   = useState(0);

  const prevBgRef          = useRef(backgroundImageUrl);
  const displayedTitleRef  = useRef(title);
  const titleTimerRef      = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const bgChanged = backgroundImageUrl !== prevBgRef.current;

    if (bgChanged) {
      prevBgRef.current = backgroundImageUrl;
      clearTimeout(titleTimerRef.current);

      // Let the background begin crossfading first, then swap the title —
      // but ONLY if the title itself actually changed. If only the image
      // updated (Phase 2 background-fetch arriving), don't re-animate.
      titleTimerRef.current = setTimeout(() => {
        const titleChanged = title !== displayedTitleRef.current;
        displayedTitleRef.current = title;
        setDisplayedTitle(title);
        if (titleChanged) {
          setTitleKey(k => k + 1);
          setVariantSeqIdx(i => (i + 1) % VARIANT_SEQUENCE.length);
        }
      }, 660);
    } else if (title !== displayedTitleRef.current) {
      // No bg change — apply title immediately (e.g. first load)
      displayedTitleRef.current = title;
      setDisplayedTitle(title);
    }

    return () => clearTimeout(titleTimerRef.current);
  }, [backgroundImageUrl, title]);

  const variant = TITLE_VARIANTS[VARIANT_SEQUENCE[variantSeqIdx]];

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#08090E' }}>

      {/* ── Background crossfade ─────────────────────────────────────────── */}
      <AnimatePresence mode="sync">
        {backgroundImageUrl ? (
          <motion.div
            key={backgroundImageUrl}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.3, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            <motion.img
              src={backgroundImageUrl}
              alt={backgroundImageAlt ?? ''}
              className="w-full h-full object-cover"
              // Slightly darken while generating so the composing pill pops
              animate={{ filter: isGenerating ? 'brightness(0.52)' : 'brightness(0.72)' }}
              transition={{ duration: 0.8 }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="gradient-fallback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 30% 30%, #3B1170 0%, #1E1040 35%, #08090E 70%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Ambient glow while composing ─────────────────────────────────── */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            key="gen-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.22) 0%, transparent 58%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Gradient overlays for text legibility ────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.15) 100%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.32) 40%, transparent 70%)',
        }}
      />

      {/* ── Shimmer progress bar while generating ────────────────────────── */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            key="gen-bar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute top-0 left-0 right-0 overflow-hidden"
            style={{ height: 2, background: 'rgba(124,58,237,0.18)', zIndex: 15 }}
          >
            <motion.div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                width: '38%',
                background:
                  'linear-gradient(90deg, transparent, #A78BFA, #7C3AED, transparent)',
              }}
              animate={{ left: ['-38%', '138%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 flex flex-col justify-center"
        style={{ padding: '80px 72px', maxWidth: '75%' }}
      >
        {/* Title */}
        <AnimatePresence mode="wait">
          <motion.h1
            key={`title-${titleKey}`}
            initial={variant.initial as any}
            animate={variant.animate as any}
            exit={variant.exit as any}
            transition={variant.transition as any}
            style={{
              color: '#FFFFFF',
              fontSize: 'clamp(2.4rem, 5vw, 4.5rem)',
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif',
              textShadow: '0 4px 32px rgba(0,0,0,0.6)',
              marginBottom: 0,
            }}
          >
            {displayedTitle || '\u00A0'}
          </motion.h1>
        </AnimatePresence>

        {/* Accent rule — appears when bullets are present */}
        <AnimatePresence>
          {(displayBullets.length > 0 || (liveBullet && !showCC)) && (
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              exit={{ scaleX: 0, opacity: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: 48,
                height: 3,
                background: 'linear-gradient(90deg, #A78BFA, #7C3AED)',
                borderRadius: 2,
                marginTop: 28,
                marginBottom: 28,
                transformOrigin: 'left',
              }}
            />
          )}
        </AnimatePresence>

        {/* Bullets — stream in one by one as speech arrives */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AnimatePresence initial={false}>
            {displayBullets.map((bullet, i) => (
              <motion.div
                key={`${i}-${bullet.slice(0, 20)}`}
                initial={{ opacity: 0, x: -28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 28 }}
                transition={{
                  duration: 0.4,
                  ease: [0.16, 1, 0.3, 1],
                  delay: i === displayBullets.length - 1 ? 0.05 : 0,
                }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#A78BFA',
                    flexShrink: 0,
                    marginTop: 11,
                    boxShadow: '0 0 10px rgba(167,139,250,0.6)',
                  }}
                />
                <p
                  style={{
                    color: 'rgba(255,255,255,0.92)',
                    fontSize: 'clamp(1.05rem, 2.2vw, 1.5rem)',
                    lineHeight: 1.45,
                    fontWeight: 450,
                    fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif',
                    textShadow: '0 2px 16px rgba(0,0,0,0.5)',
                    margin: 0,
                  }}
                >
                  {bullet}
                </p>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Ghost / live interim bullet (shown when CC is OFF) */}
          <AnimatePresence>
            {liveBullet && !showCC && (
              <motion.div
                key="live-bullet"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: 'rgba(167,139,250,0.35)',
                    flexShrink: 0,
                    marginTop: 11,
                    animation: 'pulse 1.2s ease-in-out infinite',
                  }}
                />
                <p
                  style={{
                    color: 'rgba(255,255,255,0.38)',
                    fontSize: 'clamp(1rem, 2vw, 1.4rem)',
                    lineHeight: 1.45,
                    fontStyle: 'italic',
                    fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif',
                    margin: 0,
                  }}
                >
                  {liveBullet}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── "Composing next slide" floating pill ─────────────────────────── */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            key="composing-pill"
            initial={{ opacity: 0, y: -10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.94 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2 rounded-full"
            style={{
              top: 72,
              background: 'rgba(10, 8, 20, 0.7)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(124,58,237,0.45)',
              zIndex: 20,
              boxShadow: '0 4px 24px rgba(124,58,237,0.25)',
            }}
          >
            {/* Animated dots */}
            <div className="flex items-center gap-0.5">
              {[0, 1, 2].map(i => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: '#A78BFA' }}
                  animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.15, 0.8] }}
                  transition={{
                    duration: 1.1,
                    repeat: Infinity,
                    delay: i * 0.22,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>
            <span
              style={{
                color: '#C4B5FD',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.04em',
                fontFamily: '"Space Grotesk", system-ui, sans-serif',
              }}
            >
              Composing next slide
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CC strip (closed captions) ───────────────────────────────────── */}
      {/* Replaces the inline ghost bullet when enabled */}
      <AnimatePresence>
        {showCC && (liveBullet || isGenerating) && (
          <motion.div
            key="cc-strip"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.28 }}
            className="absolute left-0 right-0 flex justify-center px-16 pointer-events-none"
            style={{ bottom: 88, zIndex: 10 }}
          >
            <div
              style={{
                background: 'rgba(0,0,0,0.78)',
                backdropFilter: 'blur(14px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '9px 22px',
                maxWidth: '68%',
                textAlign: 'center',
              }}
            >
              <p
                style={{
                  color: isGenerating && !liveBullet
                    ? '#A78BFA'
                    : 'rgba(255,255,255,0.88)',
                  fontSize: 15,
                  lineHeight: 1.5,
                  fontStyle: liveBullet ? 'italic' : 'normal',
                  fontFamily: '"Space Grotesk", system-ui, sans-serif',
                  margin: 0,
                }}
              >
                {liveBullet || (isGenerating ? 'Composing the next slide…' : '')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Unsplash credit ──────────────────────────────────────────────── */}
      {credit && (
        <a
          href={credit.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 right-4"
          style={{
            color: 'rgba(255,255,255,0.3)',
            fontSize: 10,
            textDecoration: 'none',
            letterSpacing: '0.03em',
            fontFamily: '"Space Grotesk", system-ui, sans-serif',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
        >
          Photo by {credit.name} · Unsplash
        </a>
      )}
    </div>
  );
}