import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Play, Download, Plus, Trash2, Copy,
  Type, BarChart2, Quote, Columns, List, Layout, Check, X, Pencil, GripVertical, Image
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getPresentation } from '../utils/storage';
import { usePresentations } from '../context/PresentationContext';
import { getTheme, SLIDE_THEMES } from '../utils/themes';
import { exportToPPTX, exportToHTML } from '../utils/exportUtils';
import { SlideThumbnail } from '../components/SlideThumbnail';
import { ScaledSlide, SLIDE_W, SLIDE_H } from '../components/SlideRenderer';
import { ImageEditor, useImagePaste } from '../components/ImageEditor';
import { Rnd } from 'react-rnd';
import type { Presentation, Slide, SlideLayout, SlideTheme } from '../types/presentation';

// Default logo placement — matches the CSS fallback in SlideRenderer
// (bottom:24, right:36, height:52; og-image is 1200×630 so width≈99 at h=52)
const DEFAULT_LOGO = { x: 1145, y: 644, width: 99, height: 52 };

// ─── Presentation fonts ───────────────────────────────────────────────────────
const PRESENTATION_FONTS: Array<{ name: string; family: string; category: 'sans' | 'display' | 'serif' }> = [
  { name: 'Space Grotesk', family: '"Space Grotesk", sans-serif',        category: 'sans'    },
  { name: 'Inter',          family: '"Inter", sans-serif',                category: 'sans'    },
  { name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif', category: 'sans'    },
  { name: 'Outfit',         family: '"Outfit", sans-serif',               category: 'sans'    },
  { name: 'DM Sans',        family: '"DM Sans", sans-serif',              category: 'sans'    },
  { name: 'Manrope',        family: '"Manrope", sans-serif',              category: 'sans'    },
  { name: 'Nunito',         family: '"Nunito", sans-serif',               category: 'sans'    },
  { name: 'Poppins',        family: '"Poppins", sans-serif',              category: 'sans'    },
  { name: 'Syne',           family: '"Syne", sans-serif',                 category: 'display' },
  { name: 'Raleway',        family: '"Raleway", sans-serif',              category: 'display' },
  { name: 'Josefin Sans',   family: '"Josefin Sans", sans-serif',         category: 'display' },
  { name: 'Montserrat',     family: '"Montserrat", sans-serif',           category: 'display' },
  { name: 'Playfair Display', family: '"Playfair Display", serif',        category: 'serif'   },
  { name: 'Cormorant Garamond', family: '"Cormorant Garamond", serif',    category: 'serif'   },
  { name: 'Libre Baskerville', family: '"Libre Baskerville", serif',      category: 'serif'   },
  { name: 'DM Serif Display', family: '"DM Serif Display", serif',        category: 'serif'   },
];

const DEFAULT_FONT = PRESENTATION_FONTS[0];

function loadGoogleFont(name: string) {
  if (name === 'Space Grotesk') return; // already in global CSS
  const id = `gfont-${name.replace(/\s+/g, '-').toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@400;500;600;700;800&display=swap`;
  document.head.appendChild(link);
}

// Pre-load all fonts as soon as the module is evaluated so previews render correctly
PRESENTATION_FONTS.forEach(f => loadGoogleFont(f.name));

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
  const [downloading, setDownloading] = useState(false);
  const [htmlDone, setHtmlDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try { await exportToPPTX(presentation); } catch {}
    setDownloading(false);
    onClose();
  };

  const handleDownloadHTML = async () => {
    try {
      await exportToHTML(presentation);
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setHtmlDone(true);
    setTimeout(() => { setHtmlDone(false); onClose(); }, 1400);
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/playback/${presentation.id}`;
    try { await navigator.clipboard.writeText(url); } catch {}
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 1400);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      className="absolute right-0 top-10 rounded-xl overflow-hidden z-50"
      style={{ width: 224, background: '#1A1B25', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
    >
      <div className="px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <span style={{ color: '#64748B', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Export
        </span>
      </div>

      {/* Download .pptx */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
        style={{ color: '#E2E8F0', opacity: downloading ? 0.6 : 1 }}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.15)' }}>
          {downloading
            ? <div className="w-3.5 h-3.5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
            : <Download size={14} style={{ color: '#A78BFA' }} />
          }
        </div>
        <div>
          <p className="font-medium" style={{ fontSize: 13 }}>Download file</p>
          <p style={{ color: '#64748B', fontSize: 11 }}>PowerPoint (.pptx)</p>
        </div>
      </button>

      {/* Download .html */}
      <button
        onClick={handleDownloadHTML}
        disabled={htmlDone}
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
        style={{ color: '#E2E8F0' }}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: htmlDone ? 'rgba(16,185,129,0.15)' : 'rgba(14,165,233,0.15)' }}>
          {htmlDone
            ? <Check size={14} style={{ color: '#34D399' }} />
            : <Download size={14} style={{ color: '#38BDF8' }} />
          }
        </div>
        <div>
          <p className="font-medium" style={{ fontSize: 13 }}>{htmlDone ? 'Saved to Downloads!' : 'Download file'}</p>
          <p style={{ color: '#64748B', fontSize: 11 }}>Standalone HTML</p>
        </div>
      </button>

      {/* Copy shareable link */}
      <button
        onClick={handleCopyLink}
        disabled={copied}
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
        style={{ color: '#E2E8F0' }}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: copied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)' }}>
          {copied
            ? <Check size={14} style={{ color: '#34D399' }} />
            : <Copy size={14} style={{ color: '#94A3B8' }} />
          }
        </div>
        <div>
          <p className="font-medium" style={{ fontSize: 13 }}>{copied ? 'Link copied!' : 'Copy share link'}</p>
          <p style={{ color: '#64748B', fontSize: 11 }}>{copied ? 'Anyone with the link can view' : 'Shareable playback link'}</p>
        </div>
      </button>
    </motion.div>
  );
}

// ─── Slide clipboard (module-level, persists across slides) ──────────────────
let slideClipboard: Slide | null = null;

// ─── Sortable slide item ──────────────────────────────────────────────────────
function SortableSlideItem({ slide, index, isSelected, onClick, onDelete, onDuplicate, theme, logoImage }: {
  slide: Slide; index: number; isSelected: boolean; theme: SlideTheme;
  logoImage?: { x: number; y: number; width: number; height: number };
  onClick: () => void; onDelete: () => void; onDuplicate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="relative"
    >
      <div
        {...attributes} {...listeners}
        style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', zIndex: 10, cursor: 'grab', color: '#334155', padding: 2 }}
        title="Drag to reorder"
      >
        <GripVertical size={12} />
      </div>
      <SlideThumbnail
        slide={slide} theme={theme} index={index}
        isSelected={isSelected} onClick={onClick}
        onDelete={onDelete} onDuplicate={onDuplicate}
        logoImage={logoImage}
      />
    </div>
  );
}

// ─── Main Editor ────────────────────────────────────────────────────────────
export default function WorkspaceEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { updateSlide, removeSlide, addSlide, saveOrUpdate, moveSlide } = usePresentations();

  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [showExport, setShowExport] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [logoSelected, setLogoSelected] = useState(false);
  const [logoEditMode, setLogoEditMode] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  // Stable ref so useImagePaste (called unconditionally) can access current slide
  const addImageRef = useRef<((img: import('../types/presentation').SlideImage) => void) | null>(null);
  useImagePaste(img => addImageRef.current?.(img));

  // Stable ref for slide copy/paste — populated after the early return
  const slideCopyPasteRef = useRef<{ copy: () => void; paste: () => void } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement;
      if (active?.isContentEditable || ['INPUT', 'TEXTAREA'].includes(active?.tagName)) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') slideCopyPasteRef.current?.copy();
      if ((e.metaKey || e.ctrlKey) && e.key === 'v' && slideClipboard) {
        e.preventDefault();
        slideCopyPasteRef.current?.paste();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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

  // Slide copy/paste
  slideCopyPasteRef.current = {
    copy: () => { slideClipboard = JSON.parse(JSON.stringify(selectedSlide)); },
    paste: () => {
      if (!slideClipboard) return;
      const newSlide: Slide = {
        ...JSON.parse(JSON.stringify(slideClipboard)),
        id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        generatedAt: Date.now(),
      };
      const slides = [...presentation.slides];
      slides.splice(selectedIdx + 1, 0, newSlide);
      const updated = { ...presentation, slides, updatedAt: Date.now() };
      setPresentation(updated);
      saveOrUpdate(updated);
      setSelectedIdx(selectedIdx + 1);
    },
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = presentation.slides.findIndex(s => s.id === active.id);
    const newIdx = presentation.slides.findIndex(s => s.id === over.id);
    if (oldIdx !== -1 && newIdx !== -1) handleMoveSlide(oldIdx, newIdx);
  };

  const handleImagesChange = (images: typeof selectedSlide.content.images) => {
    if (!selectedSlide) return;
    handleSlideChange({ ...selectedSlide, content: { ...selectedSlide.content, images } });
  };

  const handleLogoUpdate = (logoImage: Presentation['logoImage']) => {
    const updated = { ...presentation, logoImage, updatedAt: Date.now() };
    setPresentation(updated);
    saveOrUpdate(updated);
  };

  // Keep ref current so the unconditional hook above can call it
  addImageRef.current = img => {
    if (!selectedSlide) return;
    const images = [...(selectedSlide.content.images ?? []), img];
    handleSlideChange({ ...selectedSlide, content: { ...selectedSlide.content, images } });
  };

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
    const idx = presentation.slides.findIndex(s => s.id === slide.id);
    const dup: Slide = {
      ...slide,
      content: JSON.parse(JSON.stringify(slide.content)),
      id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      generatedAt: Date.now(),
    };
    const slides = [...presentation.slides];
    slides.splice(idx + 1, 0, dup);
    const updated = { ...presentation, slides, updatedAt: Date.now() };
    setPresentation(updated);
    saveOrUpdate(updated);
    setSelectedIdx(idx + 1);
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

  const handleFontChange = (fontFamily: string) => {
    const updated = { ...presentation, fontFamily, updatedAt: Date.now() };
    setPresentation(updated);
    saveOrUpdate(updated);
    setShowFontPicker(false);
  };

  const currentFont =
    PRESENTATION_FONTS.find(f => f.family === presentation.fontFamily) ?? DEFAULT_FONT;

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

        {/* Font selector */}
        <div className="relative">
          <button
            onClick={() => setShowFontPicker(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.07)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <Type size={14} />
            {currentFont.name}
          </button>
          <AnimatePresence>
            {showFontPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowFontPicker(false)} />
                <div className="z-50 relative">
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.95 }}
                    className="absolute right-0 top-10 rounded-xl overflow-hidden z-50"
                    style={{ width: 220, background: '#1A1B25', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                  >
                    {/* Header */}
                    <div className="px-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      <span style={{ color: '#64748B', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        Presentation Font
                      </span>
                    </div>

                    <div className="py-1 max-h-80 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                      {(['sans', 'display', 'serif'] as const).map(category => {
                        const fonts = PRESENTATION_FONTS.filter(f => f.category === category);
                        const labels: Record<typeof category, string> = { sans: 'Sans-Serif', display: 'Display', serif: 'Serif' };
                        return (
                          <div key={category}>
                            <div className="px-4 pt-2 pb-1">
                              <span style={{ color: '#475569', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {labels[category]}
                              </span>
                            </div>
                            {fonts.map(opt => {
                              const isActive = (presentation.fontFamily ?? DEFAULT_FONT.family) === opt.family;
                              return (
                                <button
                                  key={opt.name}
                                  onClick={() => handleFontChange(opt.family)}
                                  className="w-full flex items-center justify-between px-4 py-2 text-left transition-colors hover:bg-white/5"
                                  style={{ background: isActive ? 'rgba(124,58,237,0.12)' : 'transparent' }}
                                >
                                  <span style={{
                                    fontFamily: opt.family,
                                    fontSize: 14,
                                    fontWeight: 500,
                                    color: isActive ? '#A78BFA' : '#CBD5E1',
                                  }}>
                                    {opt.name}
                                  </span>
                                  {isActive && (
                                    <Check size={13} style={{ color: '#A78BFA', flexShrink: 0 }} />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                </div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Logo position button — only shown when theme has a logo */}
        {theme.logoUrl && (
          <button
            onClick={() => { setLogoEditMode(v => !v); setLogoSelected(true); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium"
            style={{
              background: logoEditMode ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)',
              color: logoEditMode ? '#818CF8' : '#94A3B8',
              border: logoEditMode ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <Image size={14} />
            {logoEditMode ? 'Done' : 'Logo'}
          </button>
        )}

        {/* Present */}
        <button
          onClick={() => navigate(`/playback/${presentation.id}`)}
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
                <p style={{ color: '#475569', fontSize: 12 }}>No slides yet. Add a blank slide to get started.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={presentation.slides.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {presentation.slides.map((slide, i) => (
                    <SortableSlideItem
                      key={slide.id}
                      slide={slide}
                      theme={theme}
                      logoImage={presentation.logoImage}
                      index={i}
                      isSelected={i === selectedIdx}
                      onClick={() => setSelectedIdx(i)}
                      onDelete={() => setDeleteConfirmId(slide.id)}
                      onDuplicate={() => handleDuplicateSlide(slide)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
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
                {(() => {
                  const scale = Math.min(
                    Math.min(containerSize.w - 64, 1000) / SLIDE_W,
                    Math.min(containerSize.h - 80, 563) / SLIDE_H,
                  );
                  const logo = presentation.logoImage ?? DEFAULT_LOGO;

                  // Shared logo Rnd — same in both template and slide mode
                  const logoRnd = theme.logoUrl ? (
                    <Rnd
                      position={{ x: logo.x * scale, y: logo.y * scale }}
                      size={{ width: logo.width * scale, height: logo.height * scale }}
                      minWidth={20 * scale} minHeight={20 * scale}
                      bounds="parent"
                      lockAspectRatio
                      onMouseDown={e => { e.stopPropagation(); setLogoSelected(true); }}
                      onDragStop={(_, d) => handleLogoUpdate({ ...logo, x: Math.round(d.x / scale), y: Math.round(d.y / scale) })}
                      onResizeStop={(_, __, ref, ___, pos) => handleLogoUpdate({
                        x: Math.round(pos.x / scale), y: Math.round(pos.y / scale),
                        width: Math.round(parseInt(ref.style.width) / scale),
                        height: Math.round(parseInt(ref.style.height) / scale),
                      })}
                      style={{
                        outline: logoSelected ? '2px solid #0066cc' : '2px solid transparent',
                        borderRadius: 4, cursor: 'move', pointerEvents: 'auto', opacity: 0.8,
                      }}
                    >
                      <img
                        src={theme.logoUrl}
                        alt=""
                        draggable={false}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', filter: theme.logoFilter ?? 'none', display: 'block', userSelect: 'none' }}
                      />
                      {logoSelected && (() => {
                        const w = logo.width, h = logo.height;
                        const pad = 36;
                        const snapPositions = [
                          { label: '↖', x: pad, y: pad },
                          { label: '↑', x: Math.round((SLIDE_W - w) / 2), y: pad },
                          { label: '↗', x: SLIDE_W - pad - w, y: pad },
                          { label: '←', x: pad, y: Math.round((SLIDE_H - h) / 2) },
                          { label: '·', x: Math.round((SLIDE_W - w) / 2), y: Math.round((SLIDE_H - h) / 2) },
                          { label: '→', x: SLIDE_W - pad - w, y: Math.round((SLIDE_H - h) / 2) },
                          { label: '↙', x: pad, y: SLIDE_H - pad - h },
                          { label: '↓', x: Math.round((SLIDE_W - w) / 2), y: SLIDE_H - pad - h },
                          { label: '↘', x: SLIDE_W - pad - w, y: SLIDE_H - pad - h },
                        ];
                        return (
                          <div
                            onMouseDown={e => e.stopPropagation()}
                            style={{
                              position: 'absolute', bottom: '100%', left: '50%',
                              transform: 'translateX(-50%)',
                              marginBottom: 6,
                              background: 'rgba(13,14,20,0.95)',
                              border: '1px solid rgba(255,255,255,0.12)',
                              borderRadius: 8, padding: 4,
                              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2,
                              pointerEvents: 'auto', zIndex: 50,
                            }}
                          >
                            {snapPositions.map(({ label, x, y }) => (
                              <button
                                key={label}
                                onClick={e => { e.stopPropagation(); handleLogoUpdate({ ...logo, x, y }); }}
                                style={{
                                  width: 22, height: 22, border: 'none', borderRadius: 4,
                                  background: 'rgba(255,255,255,0.06)', color: '#94A3B8',
                                  fontSize: 12, cursor: 'pointer', display: 'flex',
                                  alignItems: 'center', justifyContent: 'center',
                                }}
                                title={`Snap to ${label}`}
                              >{label}</button>
                            ))}
                          </div>
                        );
                      })()}
                    </Rnd>
                  ) : null;

                  if (logoEditMode) {
                    // Template view: just the theme background + logo, no slide content
                    return (<>
                      <div
                        className="rounded-lg overflow-hidden"
                        style={{
                          width: SLIDE_W * scale, height: SLIDE_H * scale,
                          background: theme.background,
                          position: 'relative',
                          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
                        }}
                        onClick={() => setLogoSelected(false)}
                      >
                        <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
                          {logoRnd}
                        </div>
                      </div>
                      <p style={{ color: '#818CF8', fontSize: 11 }}>
                        Drag or snap the logo  ·  Position applies to all slides  ·  Click <strong>Done</strong> when finished
                      </p>
                    </>);
                  }

                  return (<>
                    <div className="rounded-lg overflow-hidden" style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.7)' }}
                      onClick={() => setLogoSelected(false)}>
                      <ScaledSlide
                        slide={selectedSlide}
                        theme={theme}
                        containerWidth={Math.min(containerSize.w - 64, 1000)}
                        containerHeight={Math.min(containerSize.h - 80, 563)}
                        fontFamily={presentation.fontFamily}
                        onEdit={patch => handleSlideChange({ ...selectedSlide, content: { ...selectedSlide.content, ...patch } })}
                        logoImage={presentation.logoImage}
                        imageOverlay={<>
                          <ImageEditor
                            images={selectedSlide.content.images ?? []}
                            onChange={handleImagesChange}
                            scale={scale}
                          />
                          {logoRnd}
                        </>}
                      />
                    </div>
                    <p style={{ color: '#475569', fontSize: 11 }}>
                      Slide {selectedIdx + 1} of {presentation.slides.length}  ·  Layout: {selectedSlide.layout}  ·  Click any field to edit
                    </p>
                  </>);
                })()}
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

      {/* ── Delete confirmation modal ─────────────────────────────────── */}
      <AnimatePresence>
        {deleteConfirmId && (() => {
          const targetSlide = presentation.slides.find(s => s.id === deleteConfirmId);
          return (
            <motion.div
              key="delete-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
              onClick={() => setDeleteConfirmId(null)}
            >
              <motion.div
                key="delete-modal-card"
                initial={{ opacity: 0, scale: 0.93, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.93, y: 8 }}
                transition={{ type: 'spring', damping: 26, stiffness: 300 }}
                onClick={e => e.stopPropagation()}
                className="rounded-2xl overflow-hidden"
                style={{ width: 380, background: '#13141C', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
              >
                {/* Icon header */}
                <div className="flex flex-col items-center pt-8 pb-4 px-6">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                    style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}
                  >
                    <Trash2 size={22} style={{ color: '#F87171' }} />
                  </div>
                  <h3 style={{ color: '#F1F5F9', fontSize: 17, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
                    Delete this slide?
                  </h3>
                  {targetSlide && (
                    <p style={{ color: '#64748B', fontSize: 13, textAlign: 'center', lineHeight: 1.5 }}>
                      "{targetSlide.content.title}" will be permanently removed from your presentation.
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 px-6 pb-6 pt-2">
                  <button
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                    style={{ background: 'rgba(255,255,255,0.07)', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.1)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      handleDeleteSlide(deleteConfirmId);
                      setDeleteConfirmId(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.28)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                  >
                    Delete Slide
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}