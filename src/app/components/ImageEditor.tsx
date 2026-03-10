import React, { useState, useEffect, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import { Trash2 } from 'lucide-react';
import type { SlideImage } from '../types/presentation';
import { SLIDE_W, SLIDE_H } from './SlideRenderer';

interface ImageEditorProps {
  images: SlideImage[];
  onChange: (images: SlideImage[]) => void;
  /** CSS scale factor applied to the slide (renderedWidth / SLIDE_W) */
  scale: number;
}

export function ImageEditor({ images, onChange, scale }: ImageEditorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keyboard shortcuts for selected image
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const activeEditable = (document.activeElement as HTMLElement)?.isContentEditable
        || ['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName);

      if (e.key === 'Escape') { setSelectedId(null); return; }

      if (!selectedId || activeEditable) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        onChange(images.filter(img => img.id !== selectedId));
        setSelectedId(null);
      }

      // Cmd+X — cut: stash in buffer, remove from slide
      if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        const target = images.find(img => img.id === selectedId);
        if (!target) return;
        e.preventDefault();
        cutBuffer = target;
        onChange(images.filter(img => img.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, images, onChange]);

  const update = (id: string, patch: Partial<SlideImage>) => {
    onChange(images.map(img => img.id === id ? { ...img, ...patch } : img));
  };

  return (
    <div
      style={{ position: 'absolute', inset: 0, zIndex: 10 }}
      onClick={e => { if (e.target === e.currentTarget) setSelectedId(null); }}
    >
      {images.map(img => {
        const selected = img.id === selectedId;
        return (
          <Rnd
            key={img.id}
            position={{ x: img.x * scale, y: img.y * scale }}
            size={{ width: img.width * scale, height: img.height * scale }}
            minWidth={40 * scale}
            minHeight={40 * scale}
            bounds="parent"
            lockAspectRatio
            onMouseDown={e => { e.stopPropagation(); setSelectedId(img.id); }}
            onDragStop={(_, d) => update(img.id, { x: Math.round(d.x / scale), y: Math.round(d.y / scale) })}
            onResizeStop={(_, __, ref, ___, pos) => update(img.id, {
              x: Math.round(pos.x / scale),
              y: Math.round(pos.y / scale),
              width: Math.round(parseInt(ref.style.width) / scale),
              height: Math.round(parseInt(ref.style.height) / scale),
            })}
            style={{
              outline: selected ? '2px solid #0066cc' : '2px solid transparent',
              borderRadius: 4,
              cursor: 'move',
            }}
            resizeHandleStyles={selected ? HANDLE_STYLES : HIDDEN_HANDLES}
          >
            <img
              src={img.url}
              alt=""
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 4, display: 'block', userSelect: 'none' }}
            />
            {selected && (
              <button
                onClick={e => { e.stopPropagation(); onChange(images.filter(i => i.id !== img.id)); setSelectedId(null); }}
                style={{
                  position: 'absolute', top: -14 * scale, right: -14 * scale,
                  width: 28 * scale, height: 28 * scale,
                  borderRadius: '50%', border: 'none', cursor: 'pointer',
                  background: '#ef4444', color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 20,
                }}
              >
                <Trash2 size={14 * scale} />
              </button>
            )}
          </Rnd>
        );
      })}
    </div>
  );
}

// ── Module-level cut buffer (persists across slides during a session) ──────────
let cutBuffer: SlideImage | null = null;

// ── Paste handler hook ─────────────────────────────────────────────────────────
export function useImagePaste(onPaste: (img: SlideImage) => void) {
  // Cmd+V: check cut buffer first, fall back to system clipboard
  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.key !== 'v') return;
    if (!cutBuffer) return;
    e.preventDefault();
    const img = { ...cutBuffer, id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
    cutBuffer = null;
    onPaste(img);
  }, [onPaste]);

  const onPasteEvent = useCallback((e: ClipboardEvent) => {
    // If there's a cut buffer in flight, the keydown handler takes priority
    if (cutBuffer) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const file = imageItem.getAsFile();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxW = SLIDE_W * 0.5;
        const maxH = SLIDE_H * 0.5;
        const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
        const w = Math.round(img.naturalWidth * ratio);
        const h = Math.round(img.naturalHeight * ratio);
        onPaste({
          id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          url,
          x: Math.round((SLIDE_W - w) / 2),
          y: Math.round((SLIDE_H - h) / 2),
          width: w,
          height: h,
        });
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  }, [onPaste]);

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPasteEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPasteEvent);
    };
  }, [onKeyDown, onPasteEvent]);
}

// ── Resize handle styles ───────────────────────────────────────────────────────
const HANDLE_BASE: React.CSSProperties = {
  width: 10, height: 10, borderRadius: 2,
  background: '#0066cc', border: '2px solid white',
  zIndex: 30,
};

const HANDLE_STYLES = {
  topLeft:     { ...HANDLE_BASE, cursor: 'nw-resize' },
  topRight:    { ...HANDLE_BASE, cursor: 'ne-resize' },
  bottomLeft:  { ...HANDLE_BASE, cursor: 'sw-resize' },
  bottomRight: { ...HANDLE_BASE, cursor: 'se-resize' },
  top:    { ...HANDLE_BASE, width: 20, cursor: 'n-resize' },
  bottom: { ...HANDLE_BASE, width: 20, cursor: 's-resize' },
  left:   { ...HANDLE_BASE, height: 20, cursor: 'w-resize' },
  right:  { ...HANDLE_BASE, height: 20, cursor: 'e-resize' },
};

const HIDDEN_HANDLES = Object.fromEntries(
  Object.keys(HANDLE_STYLES).map(k => [k, { display: 'none' }])
);
