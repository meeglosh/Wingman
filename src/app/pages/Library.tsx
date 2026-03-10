import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Mic, Edit3, Play, Trash2, Clock, Layers, ArrowLeft, Upload } from 'lucide-react';
import { usePresentations } from '../context/PresentationContext';
import { SLIDE_THEMES } from '../utils/themes';
import { importFromHTML } from '../utils/exportUtils';
import { ScaledSlide } from '../components/SlideRenderer';
import type { Presentation } from '../types/presentation';

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
        ) : presentation.slides[0] ? (
          <div style={{ width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}>
            <ScaledSlide
              slide={presentation.slides[0]}
              theme={theme}
              containerWidth={360}
              containerHeight={180}
              fontFamily={presentation.fontFamily}
            />
          </div>
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
  const { presentations, removePresentation, saveOrUpdate } = usePresentations();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const presentation = await importFromHTML(file);
      // Give it a fresh ID so it doesn't collide with an existing one
      const now = Date.now();
      const imported = { ...presentation, id: `pres_${now}_${Math.random().toString(36).slice(2, 8)}`, updatedAt: now };
      saveOrUpdate(imported);
      navigate(`/edit/${imported.id}`);
    } catch (err: any) {
      alert(err.message ?? 'Import failed.');
    }
    e.target.value = '';
  };

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
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <ArrowLeft size={14} />
              New Presentation
            </button>

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

          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".html" onChange={handleImport} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <Upload size={15} />
              Import HTML
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', boxShadow: '0 4px 16px rgba(124,58,237,0.3)' }}
            >
              <Plus size={15} />
              New Presentation
            </button>
          </div>
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
            <div className="mb-8">
              <h1 className="text-white mb-1" style={{ fontSize: 26, fontWeight: 700 }}>Your Presentations</h1>
              <p style={{ color: '#64748B', fontSize: 14 }}>
                {presentations.length} presentation{presentations.length !== 1 ? 's' : ''}
              </p>
            </div>

            <motion.div
              layout
              className="grid gap-5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
            >
              <AnimatePresence>
                {presentations.map(p => (
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
          </>
        )}
      </main>
    </div>
  );
}