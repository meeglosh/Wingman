import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, ArrowRight, BookOpen, Loader2, ChevronDown, Type } from 'lucide-react';
import { usePresentations } from '../context/PresentationContext';
import { createNewPresentation } from '../utils/storage';
import { SLIDE_THEMES } from '../utils/themes';
import { SLIDE_FONTS, DEFAULT_FONT_ID, getFont } from '../utils/fonts';

// ─── Animated Glow Background ─────────────────────────────────────────────────
function GlowBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="noise-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grayNoise" />
            <feBlend in="SourceGraphic" in2="grayNoise" mode="overlay" result="blend" />
            <feComposite in="blend" in2="SourceGraphic" operator="in" />
          </filter>
        </defs>
      </svg>
      <motion.div
        animate={{ x: [0, 30, -20, 10, 0], y: [0, -20, 30, -10, 0], scale: [1, 1.12, 0.95, 1.08, 1], opacity: [0.38, 0.52, 0.35, 0.48, 0.38] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', top: '-15%', left: '-10%', width: '55vw', height: '55vw', borderRadius: '50%', background: 'radial-gradient(circle at 40% 40%, #7C3AED 0%, #4F46E5 40%, transparent 70%)', filter: 'blur(90px)' }}
      />
      <motion.div
        animate={{ x: [0, -25, 15, -10, 0], y: [0, 20, -25, 15, 0], scale: [1, 0.9, 1.1, 0.96, 1], opacity: [0.28, 0.4, 0.25, 0.38, 0.28] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
        style={{ position: 'absolute', bottom: '-20%', right: '-12%', width: '50vw', height: '50vw', borderRadius: '50%', background: 'radial-gradient(circle at 60% 60%, #6D28D9 0%, #7C3AED 35%, transparent 70%)', filter: 'blur(100px)' }}
      />
      <motion.div
        animate={{ scale: [1, 1.15, 0.92, 1.05, 1], opacity: [0.12, 0.2, 0.1, 0.16, 0.12] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut', delay: 6 }}
        style={{ position: 'absolute', top: '30%', left: '35%', width: '35vw', height: '35vw', borderRadius: '50%', background: 'radial-gradient(circle, #8B5CF6 0%, transparent 70%)', filter: 'blur(70px)' }}
      />
      <div style={{ position: 'absolute', inset: 0, backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`, backgroundRepeat: 'repeat', backgroundSize: '180px 180px', opacity: 0.04, mixBlendMode: 'overlay' }} />
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { saveOrUpdate } = usePresentations();

  const [topic, setTopic] = useState('');
  const [themeId, setThemeId] = useState('obsidian');
  const [fontId, setFontId] = useState(DEFAULT_FONT_ID);
  const [isGenerating, setIsGenerating] = useState(false);
  const [focused, setFocused] = useState(false);
  const [fontPickerOpen, setFontPickerOpen] = useState(false);
  const fontPickerRef = useRef<HTMLDivElement>(null);

  // Close font picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fontPickerRef.current && !fontPickerRef.current.contains(e.target as Node)) {
        setFontPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedFont = getFont(fontId);

  const handleGenerate = () => {
    const trimmed = topic.trim();
    if (!trimmed || isGenerating) return;
    setIsGenerating(true);
    const presentation = createNewPresentation(trimmed, themeId, selectedFont.family);
    saveOrUpdate(presentation);
    navigate(`/present/${presentation.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      handleGenerate();
    }
  };

  return (
    <div
      className="min-h-screen relative flex flex-col"
      style={{ background: '#08090E', fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
    >
      <GlowBackground />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 14 C9.5 11.5 5.5 9.5 2 11" stroke="white" strokeWidth="1.75" />
              <path d="M2 11 C5 8.5 9 11 12 14" stroke="white" strokeWidth="1.25" opacity="0.55" />
              <path d="M12 14 C14.5 11.5 18.5 9.5 22 11" stroke="white" strokeWidth="1.75" />
              <path d="M22 11 C19 8.5 15 11 12 14" stroke="white" strokeWidth="1.25" opacity="0.55" />
              <line x1="12" y1="7" x2="12" y2="14" stroke="white" strokeWidth="1.75" />
              <path d="M10.5 7.5 Q12 5.5 13.5 7.5" stroke="white" strokeWidth="1.5" />
              <path d="M10 17 L12 15 L14 17" stroke="white" strokeWidth="1.5" />
            </svg>
          </div>
          <span className="text-white" style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Wingman</span>
        </div>

        {/* Library link */}
        <button
          onClick={() => navigate('/library')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#94A3B8',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color = '#E2E8F0';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.color = '#94A3B8';
          }}
        >
          <BookOpen size={15} />
          Library
        </button>
      </header>

      {/* Main creation area */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl"
        >
          {/* Eyebrow */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400" style={{ animation: 'pulse 1.8s ease-in-out infinite' }} />
              <span style={{ color: '#A78BFA', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em' }}>
                GENERATIVE PRESENTATIONS
              </span>
            </div>
          </div>

          {/* Headline */}
          <h1
            className="text-center text-white mb-3"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em' }}
          >
            What will you present
            <br />
            <span style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              today?
            </span>
          </h1>
          <p className="text-center mb-8" style={{ color: '#9B8EC4', fontSize: 15, fontWeight: 500, letterSpacing: '0.01em' }}>
            For speakers who think on their feet.
          </p>
          <p className="text-center mb-10" style={{ color: '#94A3B8', fontSize: 16, lineHeight: 1.6 }}>Describe your topic and Wingman will build the first slide. Then just speak; your presentation grows as you talk.</p>

          {/* Topic input card */}
          <div
            className="rounded-2xl p-1 transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: focused ? '1px solid rgba(167,139,250,0.5)' : '1px solid rgba(255,255,255,0.1)',
              boxShadow: focused ? '0 0 0 4px rgba(124,58,237,0.12), 0 8px 40px rgba(0,0,0,0.4)' : '0 8px 40px rgba(0,0,0,0.3)',
              transition: 'all 0.2s ease',
            }}
          >
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="e.g. Q3 results and the road ahead for Acme Corp's engineering team"
              rows={4}
              className="w-full bg-transparent text-white rounded-xl px-5 py-4 resize-none outline-none"
              style={{
                fontSize: 16,
                lineHeight: 1.6,
                color: 'white',
                fontFamily: '"Space Grotesk", system-ui, sans-serif',
              }}
            />

            {/* Bottom row: theme selector + font selector + generate button */}
            <div className="flex items-center gap-3 px-4 pb-3 pt-1">
              {/* Theme selector */}
              <div className="flex items-center gap-1.5">
                {SLIDE_THEMES.map(t => {
                  const bg = t.background.match(/#([0-9A-Fa-f]{6})/g)?.[0] ?? '#111';
                  return (
                    <button
                      key={t.id}
                      onClick={() => setThemeId(t.id)}
                      title={t.name}
                      className="w-6 h-6 rounded-full transition-all"
                      style={{
                        background: t.background.includes('gradient') ? undefined : bg,
                        backgroundImage: t.background.includes('gradient') ? t.background : undefined,
                        border: themeId === t.id ? `2px solid ${t.accentColor}` : '2px solid rgba(255,255,255,0.15)',
                        boxShadow: themeId === t.id ? `0 0 0 2px ${t.accentColor}44` : 'none',
                        transform: themeId === t.id ? 'scale(1.2)' : 'scale(1)',
                      }}
                    />
                  );
                })}
                <span style={{ color: '#7C8FA8', fontSize: 11, fontWeight: 500, marginLeft: 4 }}>
                  theme
                </span>
              </div>

              {/* Divider */}
              <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />

              {/* Font picker */}
              <div className="relative" ref={fontPickerRef}>
                <button
                  onClick={() => setFontPickerOpen(v => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all"
                  style={{
                    background: fontPickerOpen ? 'rgba(124,58,237,0.18)' : 'rgba(255,255,255,0.06)',
                    border: fontPickerOpen ? '1px solid rgba(124,58,237,0.4)' : '1px solid rgba(255,255,255,0.1)',
                    color: fontPickerOpen ? '#C4B5FD' : '#94A3B8',
                  }}
                >
                  <Type size={11} />
                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: selectedFont.family, letterSpacing: '-0.01em' }}>
                    {selectedFont.name}
                  </span>
                  <ChevronDown
                    size={10}
                    style={{
                      transform: fontPickerOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                      opacity: 0.6,
                    }}
                  />
                </button>

                {/* Font dropdown */}
                <AnimatePresence>
                  {fontPickerOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.97 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute bottom-full left-0 mb-2 rounded-2xl overflow-hidden z-50"
                      style={{
                        background: '#141520',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,58,237,0.1)',
                        minWidth: 240,
                      }}
                    >
                      <div className="px-3 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        <p style={{ color: '#7C8FA8', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          Presentation Font
                        </p>
                      </div>
                      <div className="py-1.5">
                        {SLIDE_FONTS.map(font => {
                          const isActive = font.id === fontId;
                          return (
                            <button
                              key={font.id}
                              onClick={() => { setFontId(font.id); setFontPickerOpen(false); }}
                              className="w-full flex items-center justify-between px-3 py-2 transition-colors text-left"
                              style={{
                                background: isActive ? 'rgba(124,58,237,0.15)' : 'transparent',
                              }}
                              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                            >
                              <div className="flex items-baseline gap-3">
                                {/* Large "Aa" preview in the font itself */}
                                <span
                                  style={{
                                    fontFamily: font.family,
                                    fontSize: 18,
                                    fontWeight: 700,
                                    color: isActive ? '#C4B5FD' : 'rgba(255,255,255,0.8)',
                                    lineHeight: 1,
                                    minWidth: 28,
                                  }}
                                >
                                  Aa
                                </span>
                                <div>
                                  <p style={{ fontFamily: font.family, fontSize: 13, fontWeight: 600, color: isActive ? '#C4B5FD' : '#E2E8F0', lineHeight: 1.2 }}>
                                    {font.name}
                                  </p>
                                  <p style={{ fontSize: 10, color: '#7C8FA8', marginTop: 1 }}>{font.style} · {font.serif ? 'Serif' : 'Sans'}</p>
                                </div>
                              </div>
                              {isActive && (
                                <div className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#7C3AED' }}>
                                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                                    <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex-1" />

              {/* Generate button */}
              <motion.button
                onClick={handleGenerate}
                disabled={!topic.trim() || isGenerating}
                whileHover={{ scale: topic.trim() ? 1.02 : 1 }}
                whileTap={{ scale: topic.trim() ? 0.98 : 1 }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                style={{
                  background: topic.trim()
                    ? 'linear-gradient(135deg, #7C3AED, #6D28D9)'
                    : 'rgba(255,255,255,0.06)',
                  color: topic.trim() ? 'white' : '#7C8FA8',
                  boxShadow: topic.trim() ? '0 4px 20px rgba(124,58,237,0.35)' : 'none',
                  cursor: topic.trim() && !isGenerating ? 'pointer' : 'not-allowed',
                }}
              >
                {isGenerating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Mic size={15} />
                )}
                {isGenerating ? 'Preparing…' : 'Generate first slide'}
                {!isGenerating && <ArrowRight size={14} />}
              </motion.button>
            </div>
          </div>

          {/* Keyboard hint + pro tip */}
          <div className="flex flex-col items-center gap-2 mt-4">
            <p className="text-center" style={{ color: '#7C8FA8', fontSize: 12 }}>
              Press <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>⌘ Enter</kbd> to generate
            </p>
            <p className="text-center" style={{ color: '#7C8FA8', fontSize: 12, lineHeight: 1.5 }}>
              <span style={{ color: '#9B8EC4', fontWeight: 600 }}>Pro tip:</span> Say <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>"next slide"</span> while presenting to move on to a new slide.
            </p>
          </div>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap gap-2.5 mt-16 justify-center"
        >
          {[
            { icon: '🎙️', text: 'Speech-to-slide in real time' },
            { icon: '🖼️', text: 'AI-matched photo backgrounds' },
            { icon: '📊', text: 'Export to PowerPoint or HTML' },
            { icon: '✏️', text: 'Edit every slide after the fact' },
          ].map(f => (
            <span
              key={f.text}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94A3B8' }}
            >
              {f.icon} {f.text}
            </span>
          ))}
        </motion.div>
      </main>
    </div>
  );
}