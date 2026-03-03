import React from 'react';
import type { Slide, SlideTheme } from '../types/presentation';
import { SlideRenderer } from './SlideRenderer';

const THUMB_W = 184;
const THUMB_H = Math.round(THUMB_W * 9 / 16); // ~104 - maintains 16:9 within the 200px sidebar
const SLIDE_W = 1280;
const SLIDE_H = 720;
const SCALE = THUMB_W / SLIDE_W;

interface SlideThumbnailProps {
  slide: Slide;
  theme: SlideTheme;
  index: number;
  isSelected?: boolean;
  onClick?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
}

export function SlideThumbnail({ slide, theme, index, isSelected, onClick, onDelete, onDuplicate }: SlideThumbnailProps) {
  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer select-none"
      style={{ padding: '4px 8px 12px' }}
    >
      {/* Slide number */}
      <div className="mb-1.5 flex items-center gap-2">
        <span style={{ fontSize: 11, color: isSelected ? '#A78BFA' : '#64748B', fontWeight: 600, fontFamily: 'monospace' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      {/* Thumbnail */}
      <div
        style={{
          width: THUMB_W,
          height: THUMB_H,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 8,
          border: isSelected ? '2px solid #7C3AED' : '2px solid rgba(255,255,255,0.08)',
          boxShadow: isSelected ? '0 0 0 3px rgba(124,58,237,0.25)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <div style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${SCALE})`,
          transformOrigin: 'top left',
          position: 'absolute',
          top: 0,
          left: 0,
        }}>
          <SlideRenderer slide={slide} theme={theme} scale={1} />
        </div>

        {/* Hover overlay — note: NO stopPropagation here so clicking the overlay
            still selects the slide; individual action buttons handle their own stop */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        >
          {onDuplicate && (
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
              className="px-2 py-1 rounded text-xs font-medium text-white"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              Duplicate
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="px-2 py-1 rounded text-xs font-medium"
              style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#FCA5A5' }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Slide title */}
      <p style={{
        fontSize: 11, color: isSelected ? '#E2E8F0' : '#64748B',
        marginTop: 6, marginBottom: 0, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontFamily: 'system-ui', fontWeight: 500,
        maxWidth: THUMB_W,
      }}>
        {slide.content.title}
      </p>
    </div>
  );
}