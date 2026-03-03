import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Play, Download, Plus, Trash2, Copy, ChevronUp, ChevronDown,
  Type, BarChart2, Quote, Columns, List, Layout, Check, X, Pencil
} from 'lucide-react';
import { getPresentation } from '../utils/storage';
import { usePresentations } from '../context/PresentationContext';
import { getTheme, SLIDE_THEMES } from '../utils/themes';
import { exportToPPTX, exportForKeynote, exportForGoogleSlides } from '../utils/exportUtils';
import { SlideThumbnail } from '../components/SlideThumbnail';
import { ScaledSlide } from '../components/SlideRenderer';
import type { Presentation, Slide, SlideLayout, SlideTheme } from '../types/presentation';

const LAYOUT_OPTIONS: Array<{ id: SlideLayout; label: string; icon: React.ReactNode }> = [
  { id: 'title', label: 'Title', icon: <Type size={14} /> },
  { id: 'content', label: 'Content', icon: <Layout size={14} /> },
  { id: 'bullets', label: 'Bullets', icon: <List size={14} /> },
  { id: 'quote', label: 'Quote', icon: <Quote size={14} /> },
  { id: 'stats', label: 'Stats', icon: <BarChart2 size={14} /> },
  { id: 'two-column', label: 'Two-Col', icon: <Columns size={14} /> },
];

// ─── Inline text editor ───────────────────────────────────────────────────────
function EditableField({ value, onChange, multiline = false, placeholder, style }: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = () => { onChange(draft); setEditing(false); };
  const cancel = () => { setDraft(value); setEditing(false); };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={ref as React.Ref<HTMLTextAreaElement>}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter' && e.metaKey) commit(); }}
          placeholder={placeholder}
          rows={3}
          className="w-full resize-none rounded-lg px-3 py-2 text-white outline-none"
          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(124,58,237,0.5)', fontSize: 14, ...style }}
        />
      );
    }
    return (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2 text-white outline-none"
        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(124,58,237,0.5)', fontSize: 14, ...style }}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="group flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
    >
      <span style={{ ...style, flex: 1, color: value ? undefined : '#475569' }}>
        {value || placeholder}
      </span>
      <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#7C3AED', flexShrink: 0 }} />
    </div>
  );
}

// ─── Properties Panel ─────────────────────────────────────────────────────────
function PropertiesPanel({ slide, theme, onChange }: {
  slide: Slide;
  theme: SlideTheme;
  onChange: (updated: Slide) => void;
}) {
  const updateContent = (patch: Partial<Slide['content']>) => {
    onChange({ ...slide, content: { ...slide.content, ...patch } });
  };

  const updateBullet = (idx: number, val: string) => {
    const bullets = [...(slide.content.bullets ?? [])];
    bullets[idx] = val;
    updateContent({ bullets });
  };

  const addBullet = () => {
    const bullets = [...(slide.content.bullets ?? []), ''];
    updateContent({ bullets });
  };

  const removeBullet = (idx: number) => {
    const bullets = (slide.content.bullets ?? []).filter((_, i) => i !== idx);
    updateContent({ bullets });
  };

  const updateStat = (idx: number, field: 'value' | 'label', val: string) => {
    const stats = [...(slide.content.stats ?? [])];
    stats[idx] = { ...stats[idx], [field]: val };
    updateContent({ stats });
  };

  const addStat = () => {
    const stats = [...(slide.content.stats ?? []), { value: '0', label: 'Metric' }];
    updateContent({ stats });
  };

  const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' };
  const sectionStyle: React.CSSProperties = { marginBottom: 24 };

  return (
    <div style={{ padding: '20px 16px', color: '#E2E8F0' }}>
      {/* Layout */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Layout</span>
        <div className="grid grid-cols-3 gap-1.5">
          {LAYOUT_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => onChange({ ...slide, layout: opt.id })}
              className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: slide.layout === opt.id ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${slide.layout === opt.id ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: slide.layout === opt.id ? '#A78BFA' : '#64748B',
              }}
            >
              {opt.icon}
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Title</span>
        <EditableField
          value={slide.content.title}
          onChange={v => updateContent({ title: v })}
          placeholder="Slide title…"
          style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 600 }}
        />
      </div>

      {/* Subtitle (title layout) */}
      {slide.layout === 'title' && (
        <div style={sectionStyle}>
          <span style={labelStyle}>Subtitle</span>
          <EditableField
            value={slide.content.subtitle ?? ''}
            onChange={v => updateContent({ subtitle: v })}
            placeholder="Subtitle…"
            style={{ color: '#94A3B8', fontSize: 13 }}
          />
        </div>
      )}

      {/* Bullets */}
      {(slide.layout === 'content' || slide.layout === 'bullets' || slide.layout === 'two-column') && (
        <div style={sectionStyle}>
          <span style={labelStyle}>Bullet Points</span>
          <div className="flex flex-col gap-2">
            {(slide.content.bullets ?? []).map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: theme.accentColor, marginTop: 12, flexShrink: 0 }} />
                <EditableField
                  value={b}
                  onChange={v => updateBullet(i, v)}
                  multiline
                  placeholder="Bullet point…"
                  style={{ color: '#CBD5E1', fontSize: 13, flex: 1 }}
                />
                <button onClick={() => removeBullet(i)} className="p-1 rounded mt-1 hover:bg-red-500/10" style={{ color: '#EF4444', flexShrink: 0 }}>
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              onClick={addBullet}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors mt-1"
              style={{ background: 'rgba(124,58,237,0.08)', color: '#A78BFA', border: '1px dashed rgba(124,58,237,0.3)' }}
            >
              <Plus size={12} /> Add Bullet
            </button>
          </div>
        </div>
      )}

      {/* Quote */}
      {slide.layout === 'quote' && (
        <>
          <div style={sectionStyle}>
            <span style={labelStyle}>Quote Text</span>
            <EditableField
              value={slide.content.quote ?? ''}
              onChange={v => updateContent({ quote: v })}
              multiline
              placeholder="Enter quote…"
              style={{ color: '#F1F5F9', fontSize: 13, fontStyle: 'italic' }}
            />
          </div>
          <div style={sectionStyle}>
            <span style={labelStyle}>Attribution</span>
            <EditableField
              value={slide.content.attribution ?? ''}
              onChange={v => updateContent({ attribution: v })}
              placeholder="Author Name"
              style={{ color: '#94A3B8', fontSize: 13 }}
            />
          </div>
        </>
      )}

      {/* Stats */}
      {slide.layout === 'stats' && (
        <div style={sectionStyle}>
          <span style={labelStyle}>Statistics</span>
          <div className="flex flex-col gap-3">
            {(slide.content.stats ?? []).map((stat, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ color: '#64748B', fontSize: 10, fontWeight: 600 }}>STAT {i + 1}</span>
                </div>
                <EditableField
                  value={stat.value}
                  onChange={v => updateStat(i, 'value', v)}
                  placeholder="42%"
                  style={{ color: theme.accentColor, fontSize: 18, fontWeight: 700 }}
                />
                <EditableField
                  value={stat.label}
                  onChange={v => updateStat(i, 'label', v)}
                  placeholder="Metric label"
                  style={{ color: '#94A3B8', fontSize: 12 }}
                />
              </div>
            ))}
            {(slide.content.stats?.length ?? 0) < 4 && (
              <button
                onClick={addStat}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(124,58,237,0.08)', color: '#A78BFA', border: '1px dashed rgba(124,58,237,0.3)' }}
              >
                <Plus size={12} /> Add Stat
              </button>
            )}
          </div>
        </div>
      )}

      {/* Transcript (read-only reference) */}
      {slide.transcript && (
        <div style={sectionStyle}>
          <span style={labelStyle}>Original Speech</span>
          <p style={{ color: '#475569', fontSize: 11, lineHeight: 1.6, fontStyle: 'italic' }}>
            "{slide.transcript}"
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Export Menu ──────────────────────────────────────────────────────────────
function ExportDropdown({ presentation, onClose }: { presentation: Presentation; onClose: () => void }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const doExport = async (type: string) => {
    setExporting(type);
    try {
      if (type === 'pptx') await exportToPPTX(presentation);
      else if (type === 'keynote') await exportForKeynote(presentation);
      else if (type === 'google') await exportForGoogleSlides(presentation);
    } catch {}
    setExporting(null);
    onClose();
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      className="absolute right-0 top-10 rounded-xl overflow-hidden z-50 w-56"
      style={{ background: '#1A1B25', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
    >
      {[
        { id: 'pptx', label: 'PowerPoint (.pptx)', icon: '📊' },
        { id: 'keynote', label: 'Keynote (.pptx)', icon: '🍎' },
        { id: 'google', label: 'Google Slides (.pptx)', icon: '🎨' },
      ].map(opt => (
        <button
          key={opt.id}
          onClick={() => doExport(opt.id)}
          disabled={!!exporting}
          className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
          style={{ color: '#E2E8F0', opacity: exporting && exporting !== opt.id ? 0.4 : 1 }}
        >
          <span>{opt.icon}</span>
          {opt.label}
          {exporting === opt.id && <div className="ml-auto w-3 h-3 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />}
        </button>
      ))}
    </motion.div>
  );
}

// ─── Main Editor ─────────────────────────────────────────────────────────────
export default function WorkspaceEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { updateSlide, removeSlide, addSlide, saveOrUpdate, moveSlide } = usePresentations();

  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [showExport, setShowExport] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const p = getPresentation(id);
    if (!p) { navigate('/'); return; }
    setPresentation(p);
    setTitleDraft(p.title);
    setSelectedIdx(Math.max(0, p.slides.length - 1));
  }, [id]);

  useEffect(() => {
    const update = () => {
      if (mainRef.current) {
        setContainerSize({ w: mainRef.current.clientWidth, h: mainRef.current.clientHeight });
      }
    };
    update();
    const obs = new ResizeObserver(update);
    if (mainRef.current) obs.observe(mainRef.current);
    return () => obs.disconnect();
  }, [presentation]); // re-run once presentation loads so mainRef is in the DOM

  if (!presentation) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#08090E' }}>
        <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const theme = getTheme(presentation.themeId);
  const selectedSlide = presentation.slides[selectedIdx];

  const handleSlideChange = (updatedSlide: Slide) => {
    const updated = updateSlide(presentation, updatedSlide);
    setPresentation(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDeleteSlide = (slideId: string) => {
    const updated = removeSlide(presentation, slideId);
    setPresentation(updated);
    setSelectedIdx(i => Math.max(0, Math.min(i, updated.slides.length - 1)));
  };

  const handleDuplicateSlide = (slide: Slide) => {
    const dup = { ...slide, content: { ...slide.content }, generatedAt: Date.now() };
    const updated = addSlide(presentation, dup);
    setPresentation(updated);
    setSelectedIdx(updated.slides.length - 1);
  };

  const handleAddBlankSlide = () => {
    const blank = {
      layout: 'content' as SlideLayout,
      content: { title: 'New Slide', bullets: ['Add your content here'] },
      generatedAt: Date.now(),
    };
    const updated = addSlide(presentation, blank);
    setPresentation(updated);
    setSelectedIdx(updated.slides.length - 1);
  };

  const handleMoveSlide = (from: number, to: number) => {
    if (to < 0 || to >= presentation.slides.length) return;
    const updated = moveSlide(presentation, from, to);
    setPresentation(updated);
    setSelectedIdx(to);
  };

  const handleTitleCommit = () => {
    if (!titleDraft.trim()) return;
    const updated = { ...presentation, title: titleDraft.trim(), updatedAt: Date.now() };
    setPresentation(updated);
    saveOrUpdate(updated);
    setEditingTitle(false);
  };

  const handleThemeChange = (themeId: string) => {
    const updated = { ...presentation, themeId, updatedAt: Date.now() };
    setPresentation(updated);
    saveOrUpdate(updated);
  };

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: '#08090E', fontFamily: '"Space Grotesk", "Inter", system-ui, sans-serif' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0" style={{ background: '#0D0E14', borderColor: 'rgba(255,255,255,0.08)' }}>
        <button
          onClick={() => navigate('/library')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{ color: '#94A3B8', background: 'rgba(255,255,255,0.05)' }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2 mr-2">
          <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" fill="white" />
            </svg>
          </div>
        </div>

        <div className="h-5 w-px mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />

        {/* Editable title */}
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={handleTitleCommit}
            onKeyDown={e => { if (e.key === 'Enter') handleTitleCommit(); if (e.key === 'Escape') { setTitleDraft(presentation.title); setEditingTitle(false); } }}
            className="text-white text-sm font-semibold bg-transparent outline-none border-b"
            style={{ borderColor: '#7C3AED', minWidth: 200 }}
          />
        ) : (
          <button
            onClick={() => setEditingTitle(true)}
            className="flex items-center gap-2 group"
          >
            <span className="text-white text-sm font-semibold">{presentation.title}</span>
            <Pencil size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#7C3AED' }} />
          </button>
        )}

        {/* Saved badge */}
        <AnimatePresence>
          {saved && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}
            >
              <Check size={11} style={{ color: '#10B981' }} />
              <span style={{ color: '#10B981', fontSize: 11, fontWeight: 600 }}>Saved</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1" />

        {/* Slide count */}
        <span style={{ color: '#64748B', fontSize: 13 }}>
          {presentation.slides.length} slide{presentation.slides.length !== 1 ? 's' : ''}
        </span>

        {/* Theme selector */}
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {SLIDE_THEMES.map(t => {
            const bgMatch = t.background.match(/#[0-9A-Fa-f]{6}/);
            const dotColor = t.accentColor;
            return (
              <button
                key={t.id}
                onClick={() => handleThemeChange(t.id)}
                title={t.name}
                className="w-6 h-6 rounded-lg transition-all"
                style={{
                  background: t.background,
                  border: t.id === presentation.themeId ? `2px solid ${t.accentColor}` : '2px solid transparent',
                  boxShadow: t.id === presentation.themeId ? `0 0 0 2px ${t.accentColor}44` : 'none',
                }}
              />
            );
          })}
        </div>

        {/* Present */}
        <button
          onClick={() => navigate(`/present/${presentation.id}`)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}
        >
          <Play size={14} fill="white" />
          Present
        </button>

        {/* Export */}
        <div className="relative">
          <button
            onClick={() => setShowExport(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.07)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <Download size={14} />
            Export
          </button>
          <AnimatePresence>
            {showExport && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
                <div className="z-50 relative">
                  <ExportDropdown presentation={presentation} onClose={() => setShowExport(false)} />
                </div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main workspace */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Slide list */}
        <div
          className="flex flex-col overflow-y-auto border-r flex-shrink-0"
          style={{ width: 200, background: '#0A0B10', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <span style={{ color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Slides
            </span>
            <button
              onClick={handleAddBlankSlide}
              className="p-1 rounded-lg transition-colors"
              style={{ color: '#7C3AED', background: 'rgba(124,58,237,0.1)' }}
              title="Add blank slide"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {presentation.slides.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 px-4 text-center">
                <p style={{ color: '#475569', fontSize: 12 }}>No slides yet. Go to presentation mode to create slides with your voice.</p>
              </div>
            ) : (
              presentation.slides.map((slide, i) => (
                <div key={slide.id} className="relative">
                  <SlideThumbnail
                    slide={slide}
                    theme={theme}
                    index={i}
                    isSelected={i === selectedIdx}
                    onClick={() => setSelectedIdx(i)}
                    onDelete={() => handleDeleteSlide(slide.id)}
                    onDuplicate={() => handleDuplicateSlide(slide)}
                  />
                  {/* Reorder buttons */}
                  <div className="absolute right-2 top-8 opacity-0 hover:opacity-100 flex flex-col gap-0.5 transition-opacity">
                    <button
                      onClick={() => handleMoveSlide(i, i - 1)}
                      disabled={i === 0}
                      className="p-0.5 rounded disabled:opacity-30"
                      style={{ background: 'rgba(0,0,0,0.5)', color: 'white' }}
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      onClick={() => handleMoveSlide(i, i + 1)}
                      disabled={i === presentation.slides.length - 1}
                      className="p-0.5 rounded disabled:opacity-30"
                      style={{ background: 'rgba(0,0,0,0.5)', color: 'white' }}
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center: Slide preview */}
        <div ref={mainRef} className="flex-1 flex flex-col items-center justify-center bg-zinc-950 overflow-hidden" style={{ background: '#050608' }}>
          {selectedSlide && containerSize.w > 0 ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedSlide.id}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center gap-4 w-full h-full justify-center"
                style={{ padding: 32 }}
              >
                <div className="rounded-lg overflow-hidden" style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}>
                  <ScaledSlide
                    slide={selectedSlide}
                    theme={theme}
                    containerWidth={Math.min(containerSize.w - 64, 1000)}
                    containerHeight={Math.min(containerSize.h - 80, 563)}
                  />
                </div>
                <p style={{ color: '#475569', fontSize: 11 }}>
                  Slide {selectedIdx + 1} of {presentation.slides.length}  ·  Layout: {selectedSlide.layout}  ·  Click any field to edit
                </p>
              </motion.div>
            </AnimatePresence>
          ) : presentation.slides.length === 0 ? (
            <div className="flex flex-col items-center text-center p-12">
              <div className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center"
                style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
                <Layout size={28} style={{ color: '#7C3AED' }} />
              </div>
              <h3 className="text-white mb-2" style={{ fontSize: 20, fontWeight: 600 }}>No slides yet</h3>
              <p style={{ color: '#64748B', maxWidth: 300, lineHeight: 1.6, fontSize: 14 }}>
                Switch to presentation mode to generate slides with your voice, or add a blank slide to get started manually.
              </p>
              <button
                onClick={handleAddBlankSlide}
                className="mt-6 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)' }}
              >
                <Plus size={16} />
                Add Blank Slide
              </button>
            </div>
          ) : null}
        </div>

        {/* Right: Properties panel */}
        <div
          className="overflow-y-auto flex-shrink-0 border-l"
          style={{ width: 280, background: '#0A0B10', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <span style={{ color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Slide Properties
            </span>
          </div>
          {selectedSlide ? (
            <PropertiesPanel
              slide={selectedSlide}
              theme={theme}
              onChange={handleSlideChange}
            />
          ) : (
            <div className="p-4">
              <p style={{ color: '#475569', fontSize: 13 }}>Select a slide to edit its properties.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}