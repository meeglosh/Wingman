import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Play, Download, Plus, Trash2, Copy, ChevronUp, ChevronDown,
  Type, Check, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Layout, Pencil
} from 'lucide-react';
import { getPresentation } from '../utils/storage';
import { usePresentations } from '../context/PresentationContext';
import { getTheme, SLIDE_THEMES } from '../utils/themes';
import { exportToPPTX, exportToHTML } from '../utils/exportUtils';
import { SlideThumbnail } from '../components/SlideThumbnail';
import { SlideCanvas } from '../components/SlideCanvas';
import { layoutToElements, generateElementId } from '../utils/slideElements';
import { searchUnsplashImages } from '../utils/unsplash';
import type { UnsplashPhoto } from '../utils/unsplash';
import type { Presentation, Slide, SlideLayout, SlideTheme, SlideElement, ChartData, ChartType } from '../types/presentation';
import { ChartElement, defaultChartData, CHART_TYPE_META, CHART_PALETTES, PALETTE_NAMES, parseChartCSV } from '../components/ChartElement';

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

// ─── Shadow presets ───────────────────────────────────────────────────────────
const SHADOW_PRESETS: Array<{ label: string; value: string | null }> = [
  { label: 'None',     value: null },
  { label: 'Soft',     value: '0 4px 12px rgba(0,0,0,0.18)' },
  { label: 'Medium',   value: '0 8px 28px rgba(0,0,0,0.28)' },
  { label: 'Hard',     value: '4px 4px 0px rgba(0,0,0,0.55)' },
  { label: 'Lifted',   value: '0 12px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12)' },
  { label: 'Dramatic', value: '0 24px 64px rgba(0,0,0,0.48)' },
];

// ─── Unsplash Image Picker Modal ─────────────────────────────────────────────
function UnsplashImagePicker({ onSelect, onClose, title = 'Describe your image' }: {
  onSelect: (photo: UnsplashPhoto) => void;
  onClose: () => void;
  title?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnsplashPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    const photos = await searchUnsplashImages(query.trim());
    setResults(photos);
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 8 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{ width: 640, maxHeight: '80vh', background: '#13141C', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 style={{ color: '#F1F5F9', fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/8" style={{ color: '#64748B' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="flex gap-3 px-6 py-4 flex-shrink-0">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. sunlit mountain peak, modern office, abstract blue…"
            className="flex-1 rounded-xl px-4 py-2.5 text-white outline-none text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 14 }}
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', flexShrink: 0 }}
          >
            {loading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : 'Search'}
          </button>
        </div>

        {/* Results grid */}
        <div className="flex-1 overflow-y-auto px-6 pb-6" style={{ scrollbarWidth: 'none' }}>
          {loading && (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
            </div>
          )}
          {!loading && searched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48">
              <p style={{ color: '#475569', fontSize: 14 }}>No photos found. Try a different search term.</p>
            </div>
          )}
          {!loading && results.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {results.map((photo, i) => (
                <button
                  key={i}
                  onClick={() => onSelect(photo)}
                  className="relative rounded-xl overflow-hidden transition-all group"
                  style={{ aspectRatio: '4/3', background: '#1A1B25' }}
                >
                  <img
                    src={photo.thumbUrl ?? photo.url}
                    alt={photo.alt}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)' }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, lineHeight: 1.3 }}>
                      {photo.credit.name}
                    </span>
                  </div>
                  <div className="absolute inset-0 border-2 border-transparent group-hover:border-purple-500 rounded-xl transition-all pointer-events-none" />
                </button>
              ))}
            </div>
          )}
          {!searched && (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.7 }}>
                Search for any photo to add to your slide.
              </p>
            </div>
          )}
        </div>

        {/* Footer credit */}
        <div className="px-6 py-3 border-t flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <p style={{ color: '#334155', fontSize: 11 }}>Photos provided by Unsplash</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Chart Picker Modal ───────────────────────────────────────────────────────
function ChartPickerModal({ onSelect, onClose }: {
  onSelect: (type: ChartType) => void;
  onClose: () => void;
}) {
  const groups = Array.from(new Set(CHART_TYPE_META.map(m => m.group)));
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 8 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{ width: 520, background: '#13141C', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 32px 80px rgba(0,0,0,0.7)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <h3 style={{ color: '#F1F5F9', fontSize: 16, fontWeight: 700, margin: 0 }}>Add Chart</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/8" style={{ color: '#64748B' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="overflow-y-auto p-6" style={{ maxHeight: '70vh' }}>
          {groups.map(group => (
            <div key={group} className="mb-6">
              <p style={{ color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{group}</p>
              <div className="grid grid-cols-4 gap-3">
                {CHART_TYPE_META.filter(m => m.group === group).map(m => (
                  <button
                    key={m.type}
                    onClick={() => onSelect(m.type)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:bg-white/8"
                    style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                  >
                    <div style={{ width: 48, height: 36 }}>{m.icon}</div>
                    <span style={{ color: '#CBD5E1', fontSize: 11, fontWeight: 500 }}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Chart Properties Panel ───────────────────────────────────────────────────
function ChartPropertiesPanel({ element, onChange, onDelete }: {
  element: SlideElement;
  onChange: (el: SlideElement) => void;
  onDelete: () => void;
}) {
  const [dataTab, setDataTab] = useState<'table' | 'csv'>('table');
  const [csvText, setCsvText] = useState('');
  const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' };
  const sectionStyle: React.CSSProperties = { marginBottom: 20 };
  const inputStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#E2E8F0', outline: 'none', fontSize: 12 };

  const cd = element.chartData!;
  const upd = (patch: Partial<ChartData>) => onChange({ ...element, chartData: { ...cd, ...patch } });

  // ── Chart type ──
  const groups = Array.from(new Set(CHART_TYPE_META.map(m => m.group)));

  // ── Data table helpers ──
  const setLabel = (i: number, val: string) => {
    const labels = [...cd.labels]; labels[i] = val; upd({ labels });
  };
  const setValue = (si: number, i: number, val: string) => {
    const values = cd.values.map(v => [...v]);
    if (!values[si]) values[si] = [];
    values[si][i] = parseFloat(val) || 0;
    upd({ values });
  };
  const setSeriesName = (si: number, val: string) => {
    const series = cd.series.map((s, i) => i === si ? { ...s, name: val } : s);
    upd({ series });
  };
  const addRow = () => {
    const labels = [...cd.labels, `Row ${cd.labels.length + 1}`];
    const values = cd.values.map(v => [...v, 0]);
    upd({ labels, values });
  };
  const removeRow = (i: number) => {
    const labels = cd.labels.filter((_, j) => j !== i);
    const values = cd.values.map(v => v.filter((_, j) => j !== i));
    upd({ labels, values });
  };
  const addSeries = () => {
    const series = [...cd.series, { name: `Series ${cd.series.length + 1}` }];
    const values = [...cd.values, new Array(cd.labels.length).fill(0)];
    upd({ series, values });
  };
  const removeSeries = (si: number) => {
    if (cd.series.length <= 1) return;
    const series = cd.series.filter((_, i) => i !== si);
    const values = cd.values.filter((_, i) => i !== si);
    upd({ series, values });
  };
  const applyCSV = () => {
    const parsed = parseChartCSV(csvText);
    if (parsed) { upd(parsed); setDataTab('table'); }
  };

  // ── Which chart types show grid/axes ──
  const hasAxes = !['pie', 'donut', 'radar', 'funnel'].includes(cd.type);

  return (
    <div style={{ padding: '16px', color: '#E2E8F0' }}>

      {/* Chart type */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Chart Type</span>
        {groups.map(group => (
          <div key={group} className="mb-3">
            <p style={{ color: '#475569', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{group}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {CHART_TYPE_META.filter(m => m.group === group).map(m => (
                <button
                  key={m.type}
                  onClick={() => upd({ type: m.type })}
                  title={m.label}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all"
                  style={{
                    border: `1px solid ${cd.type === m.type ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.07)'}`,
                    background: cd.type === m.type ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{ width: 32, height: 22 }}>{m.icon}</div>
                  <span style={{ fontSize: 9, color: cd.type === m.type ? '#A78BFA' : '#64748B', lineHeight: 1.2, textAlign: 'center' }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Title */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Title</span>
        <input
          type="text" value={cd.title ?? ''}
          onChange={e => upd({ title: e.target.value })}
          placeholder="Chart title…"
          className="w-full rounded-lg px-3 py-2"
          style={{ ...inputStyle, fontSize: 13 }}
        />
      </div>

      {/* Data */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Data</span>
        {/* Tab bar */}
        <div className="flex gap-1 mb-3 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {(['table', 'csv'] as const).map(tab => (
            <button key={tab} onClick={() => setDataTab(tab)}
              className="flex-1 py-1 rounded-md text-xs font-semibold transition-all capitalize"
              style={{ background: dataTab === tab ? 'rgba(124,58,237,0.3)' : 'transparent', color: dataTab === tab ? '#A78BFA' : '#64748B' }}>
              {tab === 'csv' ? 'Paste CSV' : 'Table'}
            </button>
          ))}
        </div>

        {dataTab === 'table' && (
          <div>
            <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <th style={{ padding: '4px 6px', borderRight: '1px solid rgba(255,255,255,0.06)', width: 70, color: '#475569', fontWeight: 600 }}>Label</th>
                    {cd.series.map((s, si) => (
                      <th key={si} style={{ padding: '4px 4px', borderRight: si < cd.series.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', minWidth: 56 }}>
                        <div className="flex items-center gap-1">
                          <input value={s.name} onChange={e => setSeriesName(si, e.target.value)}
                            className="flex-1 rounded px-1 py-0.5 text-center min-w-0"
                            style={{ ...inputStyle, fontSize: 10, background: 'transparent', border: 'none' }} />
                          {cd.series.length > 1 && (
                            <button onClick={() => removeSeries(si)} style={{ color: '#EF4444', flexShrink: 0, lineHeight: 1 }}>×</button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th style={{ padding: '4px 6px', width: 24 }}>
                      <button onClick={addSeries} title="Add series"
                        style={{ color: '#7C3AED', fontSize: 14, lineHeight: 1 }}>+</button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cd.labels.map((lbl, i) => (
                    <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '3px 4px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                        <input value={lbl} onChange={e => setLabel(i, e.target.value)}
                          className="w-full rounded px-1 py-0.5"
                          style={{ ...inputStyle, border: 'none', background: 'transparent' }} />
                      </td>
                      {cd.series.map((_, si) => (
                        <td key={si} style={{ padding: '3px 4px', borderRight: si < cd.series.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                          <input type="number" value={cd.values[si]?.[i] ?? 0}
                            onChange={e => setValue(si, i, e.target.value)}
                            className="w-full rounded px-1 py-0.5 text-center"
                            style={{ ...inputStyle, border: 'none', background: 'transparent' }} />
                        </td>
                      ))}
                      <td style={{ padding: '3px 4px' }}>
                        {cd.labels.length > 1 && (
                          <button onClick={() => removeRow(i)} style={{ color: '#64748B', fontSize: 13, lineHeight: 1 }}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addRow}
              className="w-full mt-2 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.1)', color: '#64748B' }}>
              + Add Row
            </button>
          </div>
        )}

        {dataTab === 'csv' && (
          <div>
            <p style={{ color: '#475569', fontSize: 11, marginBottom: 8, lineHeight: 1.5 }}>
              First row: series names. First column: labels.
            </p>
            <textarea
              value={csvText} onChange={e => setCsvText(e.target.value)}
              placeholder={`,Series 1,Series 2\nQ1,42,28\nQ2,65,45`}
              rows={6}
              className="w-full rounded-lg px-3 py-2 resize-none"
              style={{ ...inputStyle, fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5 }}
            />
            <button onClick={applyCSV}
              className="w-full mt-2 py-2 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#A78BFA' }}>
              Apply CSV
            </button>
          </div>
        )}
      </div>

      {/* Palette */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Color Palette</span>
        <div className="grid grid-cols-3 gap-2">
          {PALETTE_NAMES.map(name => (
            <button key={name} onClick={() => upd({ palette: name })}
              className="flex flex-col gap-1.5 p-2 rounded-lg transition-all"
              style={{ border: `1px solid ${cd.palette === name ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.07)'}`, background: cd.palette === name ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.02)' }}>
              <div className="flex gap-0.5">
                {(CHART_PALETTES[name] ?? []).slice(0, 5).map((c, i) => (
                  <div key={i} style={{ flex: 1, height: 6, borderRadius: 2, background: c }} />
                ))}
              </div>
              <span style={{ fontSize: 10, color: cd.palette === name ? '#A78BFA' : '#64748B', textAlign: 'left' }}>{name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Display toggles */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Display</span>
        <div className="flex flex-col gap-2">
          {[
            { key: 'showLegend', label: 'Legend' },
            ...(hasAxes ? [{ key: 'showGrid', label: 'Grid lines' }, { key: 'showAxes', label: 'Axes' }] : []),
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between cursor-pointer">
              <span style={{ color: '#CBD5E1', fontSize: 13 }}>{label}</span>
              <div
                onClick={() => upd({ [key]: !(cd as any)[key ?? true] })}
                className="relative w-9 h-5 rounded-full transition-colors cursor-pointer"
                style={{ background: (cd as any)[key] !== false ? '#7C3AED' : 'rgba(255,255,255,0.1)' }}
              >
                <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                  style={{ transform: (cd as any)[key] !== false ? 'translateX(20px)' : 'translateX(2px)' }} />
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Delete */}
      <button onClick={onDelete}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold mt-2 transition-colors"
        style={{ background: 'rgba(239,68,68,0.08)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}>
        <Trash2 size={13} /> Delete Element
      </button>
    </div>
  );
}

// ─── Gradient direction constants ────────────────────────────────────────────
const GRAD_DIRS: Array<{ angle: number; label: string; arrow: string }> = [
  { angle: 315, label: 'Top-left',    arrow: '↖' },
  { angle: 0,   label: 'Top',         arrow: '↑' },
  { angle: 45,  label: 'Top-right',   arrow: '↗' },
  { angle: 270, label: 'Left',        arrow: '←' },
  { angle: 90,  label: 'Right',       arrow: '→' },
  { angle: 225, label: 'Bottom-left', arrow: '↙' },
  { angle: 180, label: 'Bottom',      arrow: '↓' },
  { angle: 135, label: 'Bottom-right',arrow: '↘' },
];

// ─── No-element panel (Insert + Background) ───────────────────────────────────
function NoElementPanel({ onAddTextBox, onAddImage, onAddChart, slide, onSlideChange, onBackgroundImageSearch, theme }: {
  onAddTextBox: () => void;
  onAddImage: () => void;
  onAddChart: () => void;
  slide: Slide | null;
  onSlideChange: (s: Slide) => void;
  onBackgroundImageSearch: () => void;
  theme: SlideTheme;
}) {
  const [bgTab, setBgTab] = useState<'image' | 'color' | 'gradient'>(slide?.backgroundMode ?? 'image');
  const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'block' };
  const sectionStyle: React.CSSProperties = { marginBottom: 20 };
  const inputStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#E2E8F0', outline: 'none', fontSize: 12 };

  const bg = slide?.backgroundGradient ?? { angle: 135, from: '#7C3AED', to: '#4F46E5' };
  const bgColor = slide?.backgroundColor ?? theme.background;

  const upd = (patch: Partial<Slide>) => slide && onSlideChange({ ...slide, ...patch });

  return (
    <div style={{ padding: '16px', color: '#E2E8F0' }}>
      {/* Insert */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Insert</span>
        <div className="flex flex-col gap-2">
          <button onClick={onAddTextBox}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(124,58,237,0.15)', color: '#A78BFA', border: '1px dashed rgba(124,58,237,0.4)' }}>
            <Plus size={14} /> Add Text Box
          </button>
          <button onClick={onAddImage}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(14,165,233,0.12)', color: '#38BDF8', border: '1px dashed rgba(14,165,233,0.35)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            Add Image
          </button>
          <button onClick={onAddChart}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#34D399', border: '1px dashed rgba(16,185,129,0.35)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            Add Chart
          </button>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', marginBottom: 20 }} />

      {/* Background */}
      <div style={sectionStyle}>
        <span style={labelStyle}>Background</span>

        {/* Tab bar */}
        <div className="flex gap-1 mb-4 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {(['image', 'color', 'gradient'] as const).map(tab => (
            <button key={tab} onClick={() => { setBgTab(tab); upd({ backgroundMode: tab }); }}
              className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-all capitalize"
              style={{ background: bgTab === tab ? 'rgba(124,58,237,0.3)' : 'transparent', color: bgTab === tab ? '#A78BFA' : '#64748B' }}>
              {tab}
            </button>
          ))}
        </div>

        {/* Image tab */}
        {bgTab === 'image' && (
          <div className="flex flex-col gap-2">
            {slide?.backgroundImageUrl ? (
              <>
                <div className="rounded-lg overflow-hidden" style={{ height: 80, position: 'relative' }}>
                  <img src={slide.backgroundImageUrl} alt={slide.backgroundImageAlt ?? ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {slide.unsplashCredit && (
                    <div style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 9, color: 'rgba(255,255,255,0.6)' }}>
                      Photo: {slide.unsplashCredit.name}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={onBackgroundImageSearch}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#CBD5E1' }}>
                    Replace
                  </button>
                  <button onClick={() => { upd({ backgroundImageUrl: undefined, backgroundImageAlt: undefined, unsplashCredit: undefined, backgroundMode: 'color' }); setBgTab('color'); }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>
                    Remove
                  </button>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span style={{ color: '#64748B', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overlay opacity</span>
                    <span style={{ color: '#64748B', fontSize: 11 }}>{Math.round((slide?.backgroundOverlayOpacity ?? 0.45) * 100)}%</span>
                  </div>
                  <input type="range" min={0} max={100} step={1}
                    value={Math.round((slide?.backgroundOverlayOpacity ?? 0.45) * 100)}
                    onChange={e => upd({ backgroundOverlayOpacity: Number(e.target.value) / 100 })}
                    className="w-full" style={{ accentColor: '#7C3AED' }} />
                </div>
              </>
            ) : (
              <button onClick={onBackgroundImageSearch}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.15)', color: '#64748B' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Describe your background
              </button>
            )}
          </div>
        )}

        {/* Color tab */}
        {bgTab === 'color' && (
          <div className="flex flex-col gap-3">
            {/* Preview strip */}
            <div className="rounded-lg" style={{ height: 32, background: bgColor, border: '1px solid rgba(255,255,255,0.1)' }} />
            <div className="flex gap-2 items-center">
              <input type="color" value={bgColor}
                onChange={e => upd({ backgroundColor: e.target.value, backgroundMode: 'color' })}
                style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
              <input type="text" value={bgColor}
                onChange={e => upd({ backgroundColor: e.target.value, backgroundMode: 'color' })}
                className="flex-1 rounded-lg px-3 py-2"
                style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </div>
            {/* Quick colors */}
            <div className="grid grid-cols-8 gap-1.5">
              {['#0A0B10','#0F172A','#1E1B4B','#312E81','#4C1D95','#7C3AED','#2563EB','#0F766E',
                '#166534','#92400E','#991B1B','#881337','#F8FAFC','#E2E8F0','#94A3B8','#475569'].map(c => (
                <button key={c} onClick={() => upd({ backgroundColor: c, backgroundMode: 'color' })}
                  title={c}
                  style={{ width: '100%', aspectRatio: '1', borderRadius: 4, background: c,
                    border: bgColor === c ? '2px solid #A78BFA' : '1px solid rgba(255,255,255,0.12)', cursor: 'pointer' }} />
              ))}
            </div>
          </div>
        )}

        {/* Gradient tab */}
        {bgTab === 'gradient' && (
          <div className="flex flex-col gap-3">
            {/* Preview strip */}
            <div className="rounded-lg" style={{
              height: 32, border: '1px solid rgba(255,255,255,0.1)',
              background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`,
            }} />

            {/* Direction grid */}
            <div>
              <span style={{ color: '#64748B', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Direction</span>
              <div className="grid grid-cols-3 gap-1.5" style={{ maxWidth: 120, margin: '0 auto' }}>
                {/* Top row: ↖ ↑ ↗ */}
                {[GRAD_DIRS[0], GRAD_DIRS[1], GRAD_DIRS[2]].map(d => (
                  <button key={d.angle} onClick={() => upd({ backgroundGradient: { ...bg, angle: d.angle }, backgroundMode: 'gradient' })}
                    title={d.label}
                    className="flex items-center justify-center rounded-lg transition-all"
                    style={{ height: 32, fontSize: 16, background: bg.angle === d.angle ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${bg.angle === d.angle ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
                    {d.arrow}
                  </button>
                ))}
                {/* Middle row: ← [preview] → */}
                {[GRAD_DIRS[3]].map(d => (
                  <button key={d.angle} onClick={() => upd({ backgroundGradient: { ...bg, angle: d.angle }, backgroundMode: 'gradient' })}
                    title={d.label}
                    className="flex items-center justify-center rounded-lg transition-all"
                    style={{ height: 32, fontSize: 16, background: bg.angle === d.angle ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${bg.angle === d.angle ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
                    {d.arrow}
                  </button>
                ))}
                <div className="rounded-lg" style={{ height: 32, background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})`, border: '1px solid rgba(255,255,255,0.1)' }} />
                {[GRAD_DIRS[4]].map(d => (
                  <button key={d.angle} onClick={() => upd({ backgroundGradient: { ...bg, angle: d.angle }, backgroundMode: 'gradient' })}
                    title={d.label}
                    className="flex items-center justify-center rounded-lg transition-all"
                    style={{ height: 32, fontSize: 16, background: bg.angle === d.angle ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${bg.angle === d.angle ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
                    {d.arrow}
                  </button>
                ))}
                {/* Bottom row: ↙ ↓ ↘ */}
                {[GRAD_DIRS[5], GRAD_DIRS[6], GRAD_DIRS[7]].map(d => (
                  <button key={d.angle} onClick={() => upd({ backgroundGradient: { ...bg, angle: d.angle }, backgroundMode: 'gradient' })}
                    title={d.label}
                    className="flex items-center justify-center rounded-lg transition-all"
                    style={{ height: 32, fontSize: 16, background: bg.angle === d.angle ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${bg.angle === d.angle ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
                    {d.arrow}
                  </button>
                ))}
              </div>
              {/* Custom angle slider */}
              <div className="mt-3 flex items-center gap-2">
                <input type="range" min={0} max={359} step={1} value={bg.angle}
                  onChange={e => upd({ backgroundGradient: { ...bg, angle: Number(e.target.value) }, backgroundMode: 'gradient' })}
                  className="flex-1" style={{ accentColor: '#7C3AED' }} />
                <span style={{ color: '#64748B', fontSize: 11, width: 36, textAlign: 'right' }}>{bg.angle}°</span>
              </div>
            </div>

            {/* Color stops */}
            {(['from', 'to'] as const).map((key, idx) => (
              <div key={key}>
                <span style={{ color: '#64748B', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>
                  {idx === 0 ? 'Start color' : 'End color'}
                </span>
                <div className="flex gap-2 items-center">
                  <input type="color" value={bg[key]}
                    onChange={e => upd({ backgroundGradient: { ...bg, [key]: e.target.value }, backgroundMode: 'gradient' })}
                    style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                  <input type="text" value={bg[key]}
                    onChange={e => upd({ backgroundGradient: { ...bg, [key]: e.target.value }, backgroundMode: 'gradient' })}
                    className="flex-1 rounded-lg px-3 py-2"
                    style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
              </div>
            ))}

            {/* Preset gradients */}
            <div>
              <span style={{ color: '#64748B', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Presets</span>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { from: '#7C3AED', to: '#4F46E5', angle: 135 },
                  { from: '#0EA5E9', to: '#6366F1', angle: 135 },
                  { from: '#059669', to: '#0EA5E9', angle: 135 },
                  { from: '#F59E0B', to: '#EF4444', angle: 135 },
                  { from: '#EC4899', to: '#8B5CF6', angle: 135 },
                  { from: '#0F172A', to: '#1E293B', angle: 180 },
                  { from: '#1E1B4B', to: '#312E81', angle: 135 },
                  { from: '#18181B', to: '#27272A', angle: 180 },
                ].map((g, i) => (
                  <button key={i}
                    onClick={() => upd({ backgroundGradient: g, backgroundMode: 'gradient' })}
                    style={{ height: 28, borderRadius: 6, background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`,
                      border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }} />
                ))}
              </div>
            </div>

            {/* Remove background */}
            {(slide?.backgroundGradient || slide?.backgroundImageUrl || slide?.backgroundColor) && (
              <button
                onClick={() => upd({ backgroundGradient: undefined, backgroundImageUrl: undefined, backgroundColor: undefined })}
                className="w-full py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#F87171' }}>
                Reset to theme default
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Element Properties Panel ────────────────────────────────────────────────
function ElementPropertiesPanel({ element, theme, onChange, onDelete, onAddTextBox, onAddImage, onReplaceImage, onAddChart, slide, onSlideChange, onBackgroundImageSearch }: {
  element: SlideElement | null;
  theme: SlideTheme;
  onChange: (updated: SlideElement) => void;
  onDelete: () => void;
  onAddTextBox: () => void;
  onAddImage: () => void;
  onReplaceImage: () => void;
  onAddChart: () => void;
  slide: Slide | null;
  onSlideChange: (s: Slide) => void;
  onBackgroundImageSearch: () => void;
}) {
  const [showFontMenu, setShowFontMenu] = useState(false);
  const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block' };
  const sectionStyle: React.CSSProperties = { marginBottom: 20 };

  const activeFontFamily = element?.type === 'text' ? (element.fontFamily ?? null) : null;
  const activeFont = PRESENTATION_FONTS.find(f => f.family === activeFontFamily) ?? null;

  if (!element) {
    return (
      <NoElementPanel
        onAddTextBox={onAddTextBox}
        onAddImage={onAddImage}
        onAddChart={onAddChart}
        slide={slide}
        onSlideChange={onSlideChange}
        onBackgroundImageSearch={onBackgroundImageSearch}
        theme={theme}
      />
    );
  }

  if (element.type === 'text') {
    return (
      <div style={{ padding: '20px 16px', color: '#E2E8F0' }}>
        {/* Font family */}
        <div style={{ ...sectionStyle, position: 'relative' }}>
          <span style={labelStyle}>Font</span>
          <button
            onClick={() => setShowFontMenu(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#E2E8F0',
              fontSize: 14,
              fontFamily: activeFont?.family ?? 'inherit',
            }}
          >
            <span>{activeFont?.name ?? 'Default'}</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, opacity: 0.5 }}>
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {showFontMenu && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setShowFontMenu(false)} />
              <div
                className="absolute z-50 overflow-y-auto rounded-xl"
                style={{
                  top: '100%', left: 0, right: 0, marginTop: 4,
                  maxHeight: 280,
                  background: '#1A1B25',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                  scrollbarWidth: 'none',
                }}
              >
                {/* Clear / default option */}
                <button
                  onClick={() => {
                    onChange({ ...element, fontFamily: undefined });
                    setShowFontMenu(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5"
                  style={{
                    color: !activeFont ? '#A78BFA' : '#64748B',
                    background: !activeFont ? 'rgba(124,58,237,0.12)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  Default (presentation font)
                </button>

                {(['sans', 'display', 'serif'] as const).map(category => {
                  const fonts = PRESENTATION_FONTS.filter(f => f.category === category);
                  const labels = { sans: 'Sans-Serif', display: 'Display', serif: 'Serif' };
                  return (
                    <div key={category}>
                      <div className="px-4 pt-2 pb-1">
                        <span style={{ color: '#475569', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {labels[category]}
                        </span>
                      </div>
                      {fonts.map(font => {
                        const isActive = activeFont?.family === font.family;
                        return (
                          <button
                            key={font.name}
                            onClick={() => {
                              loadGoogleFont(font.name);
                              onChange({ ...element, fontFamily: font.family });
                              setShowFontMenu(false);
                            }}
                            className="w-full flex items-center justify-between px-4 py-2 text-left transition-colors hover:bg-white/5"
                            style={{ background: isActive ? 'rgba(124,58,237,0.12)' : 'transparent' }}
                          >
                            <span style={{ fontFamily: font.family, fontSize: 14, color: isActive ? '#A78BFA' : '#CBD5E1' }}>
                              {font.name}
                            </span>
                            {isActive && (
                              <Check size={12} style={{ color: '#A78BFA', flexShrink: 0 }} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Font size */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Font Size</span>
          <input
            type="number"
            value={element.fontSize ?? 24}
            min={8} max={200}
            onChange={e => onChange({ ...element, fontSize: Number(e.target.value) })}
            className="w-full rounded-lg px-3 py-2 text-white outline-none"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 14 }}
          />
        </div>

        {/* Color */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Color</span>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={element.color ?? '#ffffff'}
              onChange={e => onChange({ ...element, color: e.target.value })}
              style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'none', padding: 2 }}
            />
            <input
              type="text"
              value={element.color ?? '#ffffff'}
              onChange={e => onChange({ ...element, color: e.target.value })}
              className="flex-1 rounded-lg px-3 py-2 text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontFamily: 'monospace' }}
            />
          </div>
        </div>

        {/* Style: Bold / Italic */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Style</span>
          <div className="flex gap-2">
            <button
              onClick={() => onChange({ ...element, fontWeight: element.fontWeight === 'bold' ? 'normal' : 'bold' })}
              className="flex items-center justify-center rounded-lg transition-all"
              style={{
                width: 36, height: 36,
                background: element.fontWeight === 'bold' ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${element.fontWeight === 'bold' ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.1)'}`,
                color: element.fontWeight === 'bold' ? '#A78BFA' : '#64748B',
              }}
            >
              <Bold size={14} />
            </button>
            <button
              onClick={() => onChange({ ...element, fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic' })}
              className="flex items-center justify-center rounded-lg transition-all"
              style={{
                width: 36, height: 36,
                background: element.fontStyle === 'italic' ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${element.fontStyle === 'italic' ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.1)'}`,
                color: element.fontStyle === 'italic' ? '#A78BFA' : '#64748B',
              }}
            >
              <Italic size={14} />
            </button>
          </div>
        </div>

        {/* Alignment */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Alignment</span>
          <div className="flex gap-2">
            {(['left', 'center', 'right'] as const).map(align => {
              const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
              const active = (element.textAlign ?? 'left') === align;
              return (
                <button
                  key={align}
                  onClick={() => onChange({ ...element, textAlign: align })}
                  className="flex items-center justify-center rounded-lg transition-all"
                  style={{
                    width: 36, height: 36,
                    background: active ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${active ? 'rgba(124,58,237,0.6)' : 'rgba(255,255,255,0.1)'}`,
                    color: active ? '#A78BFA' : '#64748B',
                  }}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Position & Size (read-only display) */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Position & Size</span>
          <div className="grid grid-cols-2 gap-2" style={{ fontSize: 12, color: '#64748B' }}>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              X: {Math.round(element.x)}px
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              Y: {Math.round(element.y)}px
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              W: {Math.round(element.width)}px
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              H: {Math.round(element.height)}px
            </div>
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold mt-2 transition-colors"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <Trash2 size={13} /> Delete Element
        </button>
      </div>
    );
  }

  if (element.type === 'image') {
    return (
      <div style={{ padding: '20px 16px', color: '#E2E8F0' }}>
        {/* Thumbnail preview */}
        {element.src && (
          <div style={{ ...sectionStyle }}>
            <div className="rounded-xl overflow-hidden" style={{ aspectRatio: '16/9', background: '#0A0B10' }}>
              <img src={element.src} alt={element.alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          </div>
        )}

        {/* Replace */}
        <div style={sectionStyle}>
          <button
            onClick={onReplaceImage}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{ background: 'rgba(14,165,233,0.12)', color: '#38BDF8', border: '1px solid rgba(14,165,233,0.25)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            Replace Image
          </button>
        </div>

        {/* Border radius */}
        <div style={sectionStyle}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={labelStyle}>Corner Radius</span>
            <span style={{ color: '#64748B', fontSize: 12 }}>{element.borderRadius ?? 0}px</span>
          </div>
          <input
            type="range"
            min={0} max={120} step={1}
            value={element.borderRadius ?? 0}
            onChange={e => onChange({ ...element, borderRadius: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: '#7C3AED' }}
          />
        </div>

        {/* Drop shadow */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Drop Shadow</span>
          <div className="grid grid-cols-2 gap-1.5">
            {SHADOW_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => onChange({ ...element, dropShadow: preset.value ?? undefined })}
                className="px-2 py-2 rounded-lg text-xs font-medium transition-all text-left"
                style={{
                  background: element.dropShadow === preset.value
                    ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${element.dropShadow === preset.value
                    ? 'rgba(124,58,237,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  color: element.dropShadow === preset.value ? '#A78BFA' : '#64748B',
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stroke */}
        <div style={sectionStyle}>
          <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
            <span style={labelStyle}>Stroke</span>
            <span style={{ color: '#64748B', fontSize: 12 }}>{element.strokeWidth ?? 0}px</span>
          </div>
          <input
            type="range"
            min={0} max={20} step={1}
            value={element.strokeWidth ?? 0}
            onChange={e => onChange({ ...element, strokeWidth: Number(e.target.value) })}
            className="w-full"
            style={{ accentColor: '#7C3AED', marginBottom: 10 }}
          />
          {(element.strokeWidth ?? 0) > 0 && (
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={element.strokeColor ?? '#ffffff'}
                onChange={e => onChange({ ...element, strokeColor: e.target.value })}
                style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 2 }}
              />
              <input
                type="text"
                value={element.strokeColor ?? '#ffffff'}
                onChange={e => onChange({ ...element, strokeColor: e.target.value })}
                className="flex-1 rounded-lg px-3 py-2 text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, fontFamily: 'monospace' }}
              />
            </div>
          )}
        </div>

        {/* Position & Size */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Position & Size</span>
          <div className="grid grid-cols-2 gap-2" style={{ fontSize: 12, color: '#64748B' }}>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>X: {Math.round(element.x)}px</div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>Y: {Math.round(element.y)}px</div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>W: {Math.round(element.width)}px</div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>H: {Math.round(element.height)}px</div>
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold mt-2 transition-colors"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#F87171', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <Trash2 size={13} /> Delete Element
        </button>
      </div>
    );
  }

  if (element.type === 'chart') {
    return <ChartPropertiesPanel element={element} onChange={onChange} onDelete={onDelete} />;
  }

  return null;
}


// ─── Export Menu ──────────────────────────────────────────────────────────────
function ExportDropdown({ presentation, onClose }: { presentation: Presentation; onClose: () => void }) {
  const [downloadingPptx, setDownloadingPptx] = useState(false);
  const [downloadingHtml, setDownloadingHtml] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleDownloadPptx = async () => {
    setDownloadingPptx(true);
    try { await exportToPPTX(presentation); } catch {}
    setDownloadingPptx(false);
    onClose();
  };

  const handleDownloadHtml = async () => {
    setDownloadingHtml(true);
    try { await exportToHTML(presentation); } catch {}
    setDownloadingHtml(false);
    onClose();
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
        onClick={handleDownloadPptx}
        disabled={downloadingPptx || downloadingHtml}
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
        style={{ color: '#E2E8F0', opacity: downloadingPptx ? 0.6 : 1 }}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.15)' }}>
          {downloadingPptx
            ? <div className="w-3.5 h-3.5 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" />
            : <Download size={14} style={{ color: '#A78BFA' }} />
          }
        </div>
        <div>
          <p className="font-medium" style={{ fontSize: 13 }}>PowerPoint</p>
          <p style={{ color: '#64748B', fontSize: 11 }}>.pptx — with images</p>
        </div>
      </button>

      {/* Download .html */}
      <button
        onClick={handleDownloadHtml}
        disabled={downloadingPptx || downloadingHtml}
        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5"
        style={{ color: '#E2E8F0', opacity: downloadingHtml ? 0.6 : 1 }}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(14,165,233,0.12)' }}>
          {downloadingHtml
            ? <div className="w-3.5 h-3.5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
            : <Download size={14} style={{ color: '#38BDF8' }} />
          }
        </div>
        <div>
          <p className="font-medium" style={{ fontSize: 13 }}>HTML Slideshow</p>
          <p style={{ color: '#64748B', fontSize: 11 }}>.html — self-contained</p>
        </div>
      </button>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px' }} />

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

// ─── Main Editor ────────────────────────────────────────────────────────────
export default function WorkspaceEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { updateSlide, removeSlide, addSlide, saveOrUpdate, moveSlide } = usePresentations();

  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [replacingElementId, setReplacingElementId] = useState<string | null>(null);
  const [showChartPicker, setShowChartPicker] = useState(false);
  const [backgroundImageMode, setBackgroundImageMode] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [showExport, setShowExport] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [saved, setSaved] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
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

  // Reset element selection when switching slides
  useEffect(() => { setSelectedElementId(null); }, [selectedIdx]);

  // Auto-convert layout→elements the first time a slide is opened in the editor.
  // Also re-generates elements when stale legacy formats are detected so the
  // editable view stays in sync with the live view.
  useEffect(() => {
    if (!presentation) return;
    const slide = presentation.slides[selectedIdx];
    if (!slide) return;
    const hasOldNumberedBullets = slide.elements?.some(
      e => e.type === 'text' && /^\d+\.\s{2}/.test(e.content ?? ''),
    );
    // Voice-generated slides with bullets should have a purple accent rule element.
    // If missing — or if a bullet text element is too short for its content
    // (an earlier version used fixed-height rows that clipped long bullets) —
    // regenerate so the editable view matches the live view.
    const isVoiceLayout = slide.layout === 'bullets' || slide.layout === 'content' || slide.layout === 'title';
    const hasBullets = (slide.content.bullets ?? []).length > 0;
    const missingAccent = !slide.elements?.some(e => e.type === 'text' && e.backgroundColor === '#A78BFA');
    const hasClippedBullet = !!slide.elements?.some(e =>
      e.type === 'text' &&
      e.fontSize === 24 &&
      !e.backgroundColor &&
      (e.content?.length ?? 0) > 50 &&
      (e.height ?? 0) < 50
    );
    const needsVoiceRegen =
      isVoiceLayout &&
      hasBullets &&
      !!slide.elements && slide.elements.length > 0 &&
      (missingAccent || hasClippedBullet);
    if (slide.elements && slide.elements.length > 0 && !hasOldNumberedBullets && !needsVoiceRegen) return;
    const theme = getTheme(presentation.themeId);
    const elements = layoutToElements(slide, theme);
    if (elements.length === 0) return;
    const updatedSlide = { ...slide, elements };
    const updatedPres = updateSlide(presentation, updatedSlide);
    setPresentation(updatedPres);
  }, [selectedIdx, presentation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete key removes selected element (skip when a text input/textarea is focused)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedElementId || !presentation) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const slide = presentation.slides[selectedIdx];
      if (!slide) return;
      const elements = (slide.elements ?? []).filter(el => el.id !== selectedElementId);
      setSelectedElementId(null);
      setPresentation(updateSlide(presentation, { ...slide, elements }));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }); // no deps — re-binds each render to capture latest state

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

  const handleFontChange = (fontFamily: string) => {
    const updated = { ...presentation, fontFamily, updatedAt: Date.now() };
    setPresentation(updated);
    saveOrUpdate(updated);
    setShowFontPicker(false);
  };

  const currentFont =
    PRESENTATION_FONTS.find(f => f.family === presentation.fontFamily) ?? DEFAULT_FONT;

  // ── Element handlers ─────────────────────────────────────────────────────
  const handleElementsChange = (elements: SlideElement[]) => {
    if (!selectedSlide) return;
    const updated = updateSlide(presentation, { ...selectedSlide, elements });
    setPresentation(updated);
  };

  const handleElementChange = (updatedEl: SlideElement) => {
    if (!selectedSlide) return;
    const elements = (selectedSlide.elements ?? []).map(el =>
      el.id === updatedEl.id ? updatedEl : el,
    );
    handleElementsChange(elements);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleDeleteElement = (elementId: string) => {
    if (!selectedSlide) return;
    const elements = (selectedSlide.elements ?? []).filter(el => el.id !== elementId);
    setSelectedElementId(null);
    handleElementsChange(elements);
  };

  const handleAddTextBox = () => {
    if (!selectedSlide) return;
    const existing = selectedSlide.elements ?? [];
    const newEl: SlideElement = {
      id: generateElementId(),
      type: 'text',
      x: 440, y: 260,
      width: 400, height: 100,
      zIndex: existing.length + 1,
      content: 'Text',
      fontSize: 32,
      fontWeight: 'normal',
      color: theme.textColor,
      textAlign: 'left',
    };
    handleElementsChange([...existing, newEl]);
    setSelectedElementId(newEl.id);
  };

  const handleImageSelected = (photo: UnsplashPhoto) => {
    if (!selectedSlide) return;
    setShowImagePicker(false);

    if (backgroundImageMode) {
      // Set as slide background
      setBackgroundImageMode(false);
      handleSlideChange({ ...selectedSlide, backgroundImageUrl: photo.url, backgroundImageAlt: photo.alt, unsplashCredit: photo.credit });
    } else if (replacingElementId) {
      // Swap the src on an existing image element
      const elements = (selectedSlide.elements ?? []).map(el =>
        el.id === replacingElementId
          ? { ...el, src: photo.url, alt: photo.alt, unsplashCredit: photo.credit }
          : el,
      );
      handleElementsChange(elements);
      setReplacingElementId(null);
    } else {
      // Add a new image element centred on the canvas
      const existing = selectedSlide.elements ?? [];
      const newEl: SlideElement = {
        id: generateElementId(),
        type: 'image',
        x: 240, y: 110,
        width: 800, height: 500,
        zIndex: existing.length + 1,
        src: photo.url,
        alt: photo.alt,
        unsplashCredit: photo.credit,
      };
      handleElementsChange([...existing, newEl]);
      setSelectedElementId(newEl.id);
    }
  };

  const handleOpenBackgroundImagePicker = () => {
    setBackgroundImageMode(true);
    setReplacingElementId(null);
    setShowImagePicker(true);
  };

  const handleAddImage = () => {
    setReplacingElementId(null);
    setShowImagePicker(true);
  };

  const handleAddChart = (type: ChartType) => {
    if (!selectedSlide) return;
    const existing = selectedSlide.elements ?? [];
    const newEl: SlideElement = {
      id: generateElementId(),
      type: 'chart',
      x: 140, y: 60,
      width: 700, height: 420,
      zIndex: existing.length + 1,
      chartData: defaultChartData(type),
    };
    handleElementsChange([...existing, newEl]);
    setSelectedElementId(newEl.id);
    setShowChartPicker(false);
  };

  const handleReplaceImage = () => {
    if (selectedElementId) setReplacingElementId(selectedElementId);
    setShowImagePicker(true);
  };

  // Canvas scale matching ScaledSlide logic
  const canvasScale = containerSize.w > 0
    ? Math.min(
        (Math.min(containerSize.w - 64, 1000)) / 1280,
        (Math.min(containerSize.h - 80, 563)) / 720,
      )
    : 1;

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
                    onDelete={() => setDeleteConfirmId(slide.id)}
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

        {/* Center: Slide canvas */}
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
                  <SlideCanvas
                    slide={selectedSlide}
                    theme={theme}
                    scale={canvasScale}
                    fontFamily={presentation.fontFamily}
                    selectedElementId={selectedElementId}
                    onSelectElement={setSelectedElementId}
                    onElementsChange={handleElementsChange}
                  />
                </div>
                <p style={{ color: '#475569', fontSize: 11 }}>
                  Slide {selectedIdx + 1} of {presentation.slides.length} · Click to select · Drag to move · Double-click to edit text
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

        {/* Right: Element properties panel */}
        <div
          className="overflow-y-auto flex-shrink-0 border-l"
          style={{ width: 280, background: '#0A0B10', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <span style={{ color: '#64748B', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {selectedElementId ? 'Element' : 'Insert'}
            </span>
          </div>
          {selectedSlide ? (
            <ElementPropertiesPanel
              element={selectedSlide.elements?.find(e => e.id === selectedElementId) ?? null}
              theme={theme}
              onChange={handleElementChange}
              onDelete={() => selectedElementId && handleDeleteElement(selectedElementId)}
              onAddTextBox={handleAddTextBox}
              onAddImage={handleAddImage}
              onReplaceImage={handleReplaceImage}
              onAddChart={() => setShowChartPicker(true)}
              slide={selectedSlide}
              onSlideChange={handleSlideChange}
              onBackgroundImageSearch={handleOpenBackgroundImagePicker}
            />
          ) : (
            <div className="p-4">
              <p style={{ color: '#475569', fontSize: 13 }}>Select a slide to edit.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Chart picker ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showChartPicker && (
          <ChartPickerModal
            onSelect={handleAddChart}
            onClose={() => setShowChartPicker(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Unsplash image picker ────────────────────────────────────── */}
      <AnimatePresence>
        {showImagePicker && (
          <UnsplashImagePicker
            onSelect={handleImageSelected}
            onClose={() => { setShowImagePicker(false); setReplacingElementId(null); setBackgroundImageMode(false); }}
            title={backgroundImageMode ? 'Describe your background' : 'Describe your image'}
          />
        )}
      </AnimatePresence>

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