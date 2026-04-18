import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Mic, Edit3, Play, Trash2, Clock, Layers, Search, ChevronDown } from 'lucide-react';
import { usePresentations } from '../context/PresentationContext';
import { SLIDE_THEMES } from '../utils/themes';
import type { Presentation } from '../types/presentation';

type SortKey = 'updated' | 'created' | 'alpha' | 'slides';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'updated', label: 'Last updated' },
  { key: 'created', label: 'Date created' },
  { key: 'alpha',   label: 'A → Z' },
  { key: 'slides',  label: 'Most slides' },
];

function formatDate(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function PresentationCard({
  presentation,
  onPresent,
  onEdit,
  onDelete,
}: {
  presentation: Presentation;
  onPresent: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = SLIDE_THEMES.find(t => t.id === presentation.themeId) ?? SLIDE_THEMES[0];
  const [hovering, setHovering] = useState(false);

  // Use background image from first slide if available
  const firstBg = presentation.slides[0]?.backgroundImageUrl;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="group rounded-2xl overflow-hidden cursor-pointer"
      style={{
        background: '#13141C',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: hovering ? '0 20px 60px rgba(0,0,0,0.5)' : '0 4px 20px rgba(0,0,0,0.3)',
        transform: hovering ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'box-shadow 0.2s, transform 0.2s',
      }}
    >
      {/* Preview */}
      <div
        className="relative"
        style={{ height: 180, overflow: 'hidden' }}
        onClick={onEdit}
      >
        {firstBg ? (
          <img src={firstBg} alt={presentation.title} className="w-full h-full object-cover" style={{ filter: 'brightness(0.65)' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: theme.background }} />
        )}

        {/* Text overlay */}
        <div className="absolute inset-0 flex flex-col justify-end p-5" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)' }}>
          <div style={{ width: 32, height: 3, background: theme.accentColor, borderRadius: 2, marginBottom: 8 }} />
          <div style={{ color: 'white', fontSize: 16, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {presentation.title}
          </div>
        </div>

        {/* Hover actions */}
        <AnimatePresence>
          {hovering && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center gap-3"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
            >
              <button
                onClick={e => { e.stopPropagation(); onPresent(); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'rgba(124,58,237,0.9)' }}
              >
                <Play size={14} fill="white" />
                Present
              </button>
              <button
                onClick={e => { e.stopPropagation(); onEdit(); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <Edit3 size={14} />
                Edit
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Theme badge */}
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(0,0,0,0.5)', color: theme.accentColor, border: `1px solid ${theme.borderColor}` }}>
            {theme.name}
          </span>
        </div>
      </div>

      {/* Info row */}
      <div className="px-5 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-white text-sm font-semibold overflow-hidden text-ellipsis whitespace-nowrap" style={{ maxWidth: 180 }}>
            {presentation.title}
          </h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
              <Layers size={11} />
              {presentation.slides.length} slide{presentation.slides.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1 text-xs" style={{ color: '#64748B' }}>
              <Clock size={11} />
              {formatDate(presentation.updatedAt)}
            </span>
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg hover:bg-red-500/10"
          style={{ color: '#EF4444' }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}

export default function Library() {
  const navigate = useNavigate();
  const { presentations, removePresentation } = usePresentations();
  const [query, setQuery]       = useState('');
  const [sortKey, setSortKey]   = useState<SortKey>('updated');
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? presentations.filter(p => p.title.toLowerCase().includes(q))
      : [...presentations];
    switch (sortKey) {
      case 'updated': list.sort((a, b) => b.updatedAt - a.updatedAt); break;
      case 'created': list.sort((a, b) => b.createdAt - a.createdAt); break;
      case 'alpha':   list.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'slides':  list.sort((a, b) => b.slides.length - a.slides.length); break;
    }
    return list;
  }, [presentations, query, sortKey]);

  const sortLabel = SORT_OPTIONS.find(o => o.key === sortKey)?.label ?? '';

  return (
    <div
      className="min-h-screen"
      style={{ background: '#08090E', fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-40"
        style={{ background: 'rgba(8,9,14,0.9)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 14 C9.5 11.5 5.5 9.5 2 11" stroke="white" strokeWidth="1.75" />
                  <path d="M2 11 C5 8.5 9 11 12 14" stroke="white" strokeWidth="1.25" opacity="0.55" />
                  <path d="M12 14 C14.5 11.5 18.5 9.5 22 11" stroke="white" strokeWidth="1.75" />
                  <path d="M22 11 C19 8.5 15 11 12 14" stroke="white" strokeWidth="1.25" opacity="0.55" />
                  <line x1="12" y1="7" x2="12" y2="14" stroke="white" strokeWidth="1.75" />
                  <path d="M10.5 7.5 Q12 5.5 13.5 7.5" stroke="white" strokeWidth="1.5" />
                  <path d="M10 17 L12 15 L14 17" stroke="white" strokeWidth="1.5" />
                </svg>
              </div>
              <span className="text-white font-bold" style={{ fontSize: 16 }}>Library</span>
            </div>
          </div>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }}
          >
            <Plus size={15} />
            New Presentation
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        {presentations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-32 text-center"
          >
            <div className="w-20 h-20 rounded-3xl mb-6 flex items-center justify-center"
              style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)' }}>
              <Mic size={36} style={{ color: '#7C3AED' }} />
            </div>
            <h2 className="text-white mb-2" style={{ fontSize: 26, fontWeight: 700 }}>No presentations yet</h2>
            <p style={{ color: '#64748B', fontSize: 15, maxWidth: 400, lineHeight: 1.6, marginBottom: 28 }}>
              Head back home to describe your topic and let Wingman build your first presentation.
            </p>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}
            >
              <Plus size={15} />
              Create your first presentation
            </button>
          </motion.div>
        ) : (
          <>
            {/* Title + controls row */}
            <div className="mb-8 flex flex-col gap-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h1 className="text-white mb-1" style={{ fontSize: 26, fontWeight: 700 }}>Your Presentations</h1>
                  <p style={{ color: '#64748B', fontSize: 14 }}>
                    {filtered.length === presentations.length
                      ? `${presentations.length} presentation${presentations.length !== 1 ? 's' : ''}`
                      : `${filtered.length} of ${presentations.length} match`}
                  </p>
                </div>
              </div>

              {/* Search + sort */}
              <div className="flex items-center gap-3">
                {/* Search input */}
                <div className="relative flex-1" style={{ maxWidth: 360 }}>
                  <Search
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: '#64748B' }}
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search presentations…"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-[#64748B] outline-none focus:ring-1"
                    style={{
                      background: '#13141C',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontFamily: 'inherit',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)')}
                    onBlur={e  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
                  />
                </div>

                {/* Sort dropdown */}
                <div className="relative" ref={sortRef}>
                  <button
                    onClick={() => setSortOpen(o => !o)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                    style={{
                      background: '#13141C',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sortLabel}
                    <ChevronDown size={14} style={{ color: '#64748B', transform: sortOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>

                  <AnimatePresence>
                    {sortOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-1 rounded-xl overflow-hidden"
                        style={{
                          background: '#1A1B25',
                          border: '1px solid rgba(255,255,255,0.1)',
                          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                          zIndex: 50,
                          minWidth: 160,
                        }}
                      >
                        {SORT_OPTIONS.map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => { setSortKey(opt.key); setSortOpen(false); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left transition-colors"
                            style={{
                              color: sortKey === opt.key ? '#A78BFA' : 'rgba(255,255,255,0.75)',
                              background: sortKey === opt.key ? 'rgba(124,58,237,0.12)' : 'transparent',
                              fontFamily: 'inherit',
                            }}
                            onMouseEnter={e => { if (sortKey !== opt.key) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
                            onMouseLeave={e => { if (sortKey !== opt.key) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                          >
                            {opt.label}
                            {sortKey === opt.key && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="#A78BFA" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Results */}
            {filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-24 text-center"
              >
                <Search size={32} style={{ color: '#64748B', marginBottom: 16 }} />
                <p className="text-white mb-1" style={{ fontSize: 17, fontWeight: 600 }}>No results for "{query}"</p>
                <p style={{ color: '#64748B', fontSize: 14 }}>Try a different search term.</p>
              </motion.div>
            ) : (
              <motion.div
                layout
                className="grid gap-5"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
              >
                <AnimatePresence>
                  {filtered.map(p => (
                    <PresentationCard
                      key={p.id}
                      presentation={p}
                      onPresent={() => navigate(`/playback/${p.id}`)}
                      onEdit={() => navigate(`/edit/${p.id}`)}
                      onDelete={() => removePresentation(p.id)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}
      </main>
    </div>
  );
}