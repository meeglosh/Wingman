import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { Slide, SlideElement, SlideTheme } from '../types/presentation';
import { ChartElement } from './ChartElement';

const SLIDE_W = 1280;
const SLIDE_H = 720;
const HANDLE_SIZE = 8;
const MIN_DIM = 20;

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

function buildBoxShadow(el: SlideElement): string | null {
  return el.dropShadow ?? null;
}

interface DragState {
  type: 'move' | 'resize' | 'rotate';
  dir?: HandleDir;
  startX: number; // canvas space
  startY: number;
  orig: { x: number; y: number; width: number; height: number };
  elementId: string;
  startAngle?: number;   // for rotate
  origRotation?: number; // for rotate
}

interface SlideCanvasProps {
  slide: Slide;
  theme: SlideTheme;
  scale: number;
  fontFamily?: string;
  selectedElementId: string | null;
  onSelectElement: (id: string | null) => void;
  onElementsChange: (elements: SlideElement[]) => void;
}

export function SlideCanvas({
  slide,
  theme,
  scale,
  fontFamily,
  selectedElementId,
  onSelectElement,
  onElementsChange,
}: SlideCanvasProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Keep a live ref to elements so mousemove always has the latest without re-binding
  const elementsRef = useRef<SlideElement[]>(slide.elements ?? []);
  useEffect(() => { elementsRef.current = slide.elements ?? []; }, [slide.elements]);

  const resolvedFont = fontFamily ?? '"Space Grotesk", "Inter", sans-serif';
  const elements = slide.elements ?? [];

  // Convert clientX/Y → canvas coordinates
  const toCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = outerRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  }, [scale]);

  // ── Global mousemove / mouseup during drag ──────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      e.preventDefault();

      const { x: cx, y: cy } = toCanvas(e.clientX, e.clientY);
      const dx = cx - drag.startX;
      const dy = cy - drag.startY;
      const { orig, elementId } = drag;

      if (drag.type === 'rotate') {
        const elCx = orig.x + orig.width / 2;
        const elCy = orig.y + orig.height / 2;
        const currentAngle = Math.atan2(cx - elCx, elCy - cy) * (180 / Math.PI);
        const newRotation = (drag.origRotation! + currentAngle - drag.startAngle!) % 360;
        onElementsChange(
          elementsRef.current.map(el =>
            el.id === elementId ? { ...el, rotation: newRotation } : el,
          ),
        );
        return;
      }

      let nx = orig.x, ny = orig.y, nw = orig.width, nh = orig.height;

      if (drag.type === 'move') {
        nx = Math.max(0, Math.min(SLIDE_W - orig.width, orig.x + dx));
        ny = Math.max(0, Math.min(SLIDE_H - orig.height, orig.y + dy));
      } else {
        const d = drag.dir!;
        if (d.includes('e')) nw = Math.max(MIN_DIM, orig.width + dx);
        if (d.includes('s')) nh = Math.max(MIN_DIM, orig.height + dy);
        if (d.includes('w')) { nx = orig.x + dx; nw = Math.max(MIN_DIM, orig.width - dx); }
        if (d.includes('n')) { ny = orig.y + dy; nh = Math.max(MIN_DIM, orig.height - dy); }
      }

      onElementsChange(
        elementsRef.current.map(el =>
          el.id === elementId ? { ...el, x: nx, y: ny, width: nw, height: nh } : el,
        ),
      );
    };

    const onUp = () => { dragRef.current = null; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [toCanvas, onElementsChange]);

  // ── Element mousedown → start move ─────────────────────────────────────────
  const onElementMouseDown = (e: React.MouseEvent, el: SlideElement) => {
    if (editingId === el.id) return;
    e.stopPropagation();
    onSelectElement(el.id);
    const { x, y } = toCanvas(e.clientX, e.clientY);
    dragRef.current = {
      type: 'move',
      startX: x, startY: y,
      orig: { x: el.x, y: el.y, width: el.width, height: el.height },
      elementId: el.id,
    };
  };

  // ── Handle mousedown → start resize ────────────────────────────────────────
  const onHandleMouseDown = (e: React.MouseEvent, el: SlideElement, dir: HandleDir) => {
    e.stopPropagation();
    const { x, y } = toCanvas(e.clientX, e.clientY);
    dragRef.current = {
      type: 'resize',
      dir,
      startX: x, startY: y,
      orig: { x: el.x, y: el.y, width: el.width, height: el.height },
      elementId: el.id,
    };
  };

  // ── Rotate handle mousedown → start rotate ─────────────────────────────────
  const onRotateHandleMouseDown = (e: React.MouseEvent, el: SlideElement) => {
    e.stopPropagation();
    const { x, y } = toCanvas(e.clientX, e.clientY);
    const elCx = el.x + el.width / 2;
    const elCy = el.y + el.height / 2;
    const startAngle = Math.atan2(x - elCx, elCy - y) * (180 / Math.PI);
    dragRef.current = {
      type: 'rotate',
      startX: x, startY: y,
      orig: { x: el.x, y: el.y, width: el.width, height: el.height },
      elementId: el.id,
      startAngle,
      origRotation: el.rotation ?? 0,
    };
  };

  // ── Double-click → start text editing ──────────────────────────────────────
  const onElementDblClick = (e: React.MouseEvent, el: SlideElement) => {
    e.stopPropagation();
    if (el.type === 'text') {
      setEditingId(el.id);
    }
  };

  // ── Canvas background click → deselect ─────────────────────────────────────
  const onCanvasClick = () => {
    onSelectElement(null);
    setEditingId(null);
  };

  const renderedW = SLIDE_W * scale;
  const renderedH = SLIDE_H * scale;

  return (
    <div
      ref={outerRef}
      style={{ width: renderedW, height: renderedH, position: 'relative', borderRadius: 4, overflow: 'hidden' }}
    >
      {/* ── Actual canvas at 1280×720, scaled down ── */}
      <div
        onClick={onCanvasClick}
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'relative',
          background: (() => {
            const mode = slide.backgroundMode ?? (slide.backgroundImageUrl ? 'image' : slide.backgroundGradient ? 'gradient' : 'color');
            if (mode === 'image' && slide.backgroundImageUrl) return '#000';
            if (mode === 'gradient' && slide.backgroundGradient) return `linear-gradient(${slide.backgroundGradient.angle}deg, ${slide.backgroundGradient.from}, ${slide.backgroundGradient.to})`;
            return slide.backgroundColor ?? theme.background;
          })(),
          fontFamily: resolvedFont,
          cursor: 'default',
        }}
      >
        {/* Background image */}
        {slide.backgroundImageUrl && (slide.backgroundMode === 'image' || !slide.backgroundMode) && (
          <>
            <img
              src={slide.backgroundImageUrl}
              alt={slide.backgroundImageAlt ?? ''}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 }}
            />
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.15) 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, zIndex: 1, background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.32) 40%, transparent 70%)' }} />
          </>
        )}

        {/* Elements */}
        {elements.map(el => {
          const isSelected = el.id === selectedElementId;
          const isEditing = editingId === el.id;

          return (
            <div
              key={el.id}
              onMouseDown={e => onElementMouseDown(e, el)}
              onClick={e => e.stopPropagation()}
              onDoubleClick={e => onElementDblClick(e, el)}
              style={{
                position: 'absolute',
                left: el.x, top: el.y,
                width: el.width, height: el.height,
                zIndex: el.zIndex + 2,
                cursor: isEditing ? 'text' : 'move',
                userSelect: isEditing ? 'text' : 'none',
                outline: isSelected && !isEditing ? '2px solid #4F9EF8' : 'none',
                outlineOffset: 1,
                boxSizing: 'border-box',
                boxShadow: buildBoxShadow(el) ?? undefined,
                transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                transformOrigin: 'center center',
              }}
            >
              {el.type === 'image' && el.src && (
                <>
                  <img
                    src={el.src}
                    alt={el.alt ?? ''}
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: el.borderRadius ? `${el.borderRadius}px` : undefined }}
                  />
                  {el.strokeWidth && el.strokeWidth > 0 && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      boxShadow: `inset 0 0 0 ${el.strokeWidth}px ${el.strokeColor ?? '#ffffff'}`,
                      borderRadius: el.borderRadius ? `${el.borderRadius}px` : undefined,
                      pointerEvents: 'none',
                      zIndex: 1,
                    }} />
                  )}
                </>
              )}

              {el.type === 'chart' && el.chartData && (
                <ChartElement chartData={el.chartData} width={el.width} height={el.height} />
              )}

              {el.type === 'text' && (
                isEditing ? (
                  <textarea
                    autoFocus
                    defaultValue={el.content ?? ''}
                    onBlur={e => {
                      onElementsChange(
                        elementsRef.current.map(elem =>
                          elem.id === el.id ? { ...elem, content: e.target.value } : elem,
                        ),
                      );
                      setEditingId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: '100%', height: '100%',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid #4F9EF8',
                      outline: 'none',
                      resize: 'none',
                      fontSize: el.fontSize ?? 24,
                      fontWeight: el.fontWeight ?? 'normal',
                      fontStyle: el.fontStyle ?? 'normal',
                      color: el.color ?? theme.textColor,
                      textAlign: el.textAlign ?? 'left',
                      fontFamily: el.fontFamily ?? 'inherit',
                      padding: 4,
                      lineHeight: 1.4,
                      boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%', height: '100%',
                      fontSize: el.fontSize ?? 24,
                      fontWeight: el.fontWeight ?? 'normal',
                      fontStyle: el.fontStyle ?? 'normal',
                      color: el.color ?? theme.textColor,
                      textAlign: el.textAlign ?? 'left',
                      fontFamily: el.fontFamily ?? 'inherit',
                      lineHeight: 1.4,
                      whiteSpace: 'pre-wrap',
                      overflow: 'hidden',
                      padding: 4,
                      boxSizing: 'border-box',
                    }}
                  >
                    {el.content}
                  </div>
                )
              )}

              {/* Resize handles + rotation handle — only on selected, non-editing elements */}
              {isSelected && !isEditing && (
                <>
                  {(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as HandleDir[]).map(dir => (
                    <div
                      key={dir}
                      onMouseDown={e => { e.stopPropagation(); onHandleMouseDown(e, el, dir); }}
                      style={{
                        position: 'absolute',
                        width: HANDLE_SIZE, height: HANDLE_SIZE,
                        background: '#fff',
                        border: '1.5px solid #4F9EF8',
                        borderRadius: 1,
                        cursor: `${dir}-resize`,
                        zIndex: 10,
                        ...handlePos(dir, HANDLE_SIZE),
                      }}
                    />
                  ))}
                  {/* Rotation handle stem */}
                  <div style={{
                    position: 'absolute',
                    top: -28, left: 'calc(50% - 0.5px)',
                    width: 1, height: 24,
                    background: '#4F9EF8',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }} />
                  {/* Rotation handle circle */}
                  <div
                    onMouseDown={e => { e.stopPropagation(); onRotateHandleMouseDown(e, el); }}
                    title="Rotate"
                    style={{
                      position: 'absolute',
                      top: -40, left: 'calc(50% - 7px)',
                      width: 14, height: 14,
                      borderRadius: '50%',
                      background: '#4F9EF8',
                      border: '2px solid #fff',
                      cursor: 'grab',
                      zIndex: 11,
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function handlePos(dir: HandleDir, size: number): React.CSSProperties {
  const h = -size / 2;
  const mid = `calc(50% - ${size / 2}px)`;
  const map: Record<HandleDir, React.CSSProperties> = {
    nw: { top: h,   left: h    },
    n:  { top: h,   left: mid  },
    ne: { top: h,   right: h   },
    e:  { top: mid, right: h   },
    se: { bottom: h, right: h  },
    s:  { bottom: h, left: mid },
    sw: { bottom: h, left: h   },
    w:  { top: mid, left: h    },
  };
  return map[dir];
}
