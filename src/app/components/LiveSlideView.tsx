import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface LiveSlideViewProps {
  backgroundImageUrl?: string;
  backgroundImageAlt?: string;
  title: string;
  bullets: string[];
  liveBullet?: string;       // interim transcript (ghost text)
  isLoading?: boolean;       // while fetching image
  credit?: { name: string; profileUrl: string };
}

export function LiveSlideView({
  backgroundImageUrl,
  backgroundImageAlt,
  title,
  bullets,
  liveBullet,
  isLoading,
  credit,
}: LiveSlideViewProps) {
  // Show at most 5 bullets on screen
  const displayBullets = bullets.slice(-5);

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: '#08090E' }}>
      {/* ── Background image with crossfade ────────────────────────── */}
      <AnimatePresence mode="sync">
        {backgroundImageUrl ? (
          <motion.div
            key={backgroundImageUrl}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: 'easeInOut' }}
            className="absolute inset-0"
          >
            <img
              src={backgroundImageUrl}
              alt={backgroundImageAlt ?? ''}
              className="w-full h-full object-cover"
              style={{ filter: 'brightness(0.75)' }}
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

      {/* Loading shimmer */}
      {isLoading && (
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      )}

      {/* ── Gradient overlays for text legibility ──────────────────── */}
      {/* Left-side text legibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.15) 100%)',
        }}
      />
      {/* Bottom darkening for bullets */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 40%, transparent 70%)',
        }}
      />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 flex flex-col justify-center"
        style={{ padding: '80px 72px', maxWidth: '75%' }}
      >
        {/* Title */}
        <AnimatePresence mode="wait">
          <motion.h1
            key={title}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
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
            {title || '\u00A0'}
          </motion.h1>
        </AnimatePresence>

        {/* Accent rule */}
        <AnimatePresence>
          {(displayBullets.length > 0 || liveBullet) && (
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
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

        {/* Bullets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AnimatePresence initial={false}>
            {displayBullets.map((bullet, i) => (
              <motion.div
                key={`${i}-${bullet.slice(0, 15)}`}
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
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

          {/* Live interim ghost text */}
          <AnimatePresence>
            {liveBullet && (
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

      {/* ── Unsplash credit (per API terms) ─────────────────────────── */}
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
