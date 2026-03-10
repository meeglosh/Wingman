import React, { useRef, useEffect } from 'react';
import type { Slide, SlideContent, SlideImage, SlideTheme } from '../types/presentation';

interface SlideRendererProps {
  slide: Slide;
  theme: SlideTheme;
  scale?: number;
  isActive?: boolean;
  liveTranscript?: string;
  fontFamily?: string;
  onEdit?: (patch: Partial<SlideContent>) => void;
}

const SLIDE_W = 1280;
const SLIDE_H = 720;

// ── Inline contenteditable text ───────────────────────────────────────────────
function InlineText({
  value,
  onChange,
  style,
  multiline = false,
}: {
  value: string;
  onChange: (v: string) => void;
  style?: React.CSSProperties;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current && ref.current) {
      ref.current.innerText = value ?? '';
    }
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => { editing.current = true; }}
      onBlur={e => {
        editing.current = false;
        onChange(e.currentTarget.innerText.replace(/\n+$/, ''));
      }}
      onKeyDown={e => {
        if (!multiline && e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); }
        e.stopPropagation();
      }}
      style={{ ...style, outline: 'none', cursor: 'text', minWidth: 10 }}
    />
  );
}

export function SlideRenderer({ slide, theme, scale = 1, isActive, liveTranscript, fontFamily, onEdit }: SlideRendererProps) {
  const { layout, content } = slide;

  const resolvedFont = fontFamily ?? '"Space Grotesk", "Inter", "Segoe UI", system-ui, sans-serif';

  const containerStyle: React.CSSProperties = {
    width: SLIDE_W,
    height: SLIDE_H,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    position: 'relative',
    overflow: 'hidden',
    background: slide.backgroundImageUrl ? '#000' : theme.background,
    fontFamily: resolvedFont,
  };

  return (
    <div style={containerStyle}>
      {/* Background image layer */}
      {slide.backgroundImageUrl && (
        <>
          <img
            src={slide.backgroundImageUrl}
            alt={slide.backgroundImageAlt ?? ''}
            style={{
              position: 'absolute', inset: 0, zIndex: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
              filter: 'brightness(0.75)',
            }}
          />
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1,
            background: 'linear-gradient(160deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.45) 100%)',
          }} />
        </>
      )}

      {/* Slide content */}
      <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%' }}>
        {(() => {
          const t: SlideTheme = slide.backgroundImageUrl
            ? { ...theme, titleColor: '#FFFFFF', textColor: 'rgba(255,255,255,0.92)', mutedColor: 'rgba(255,255,255,0.72)' }
            : theme;
          return (
            <>
              {layout === 'title'      && <TitleLayout      content={content} theme={t} onEdit={onEdit} />}
              {layout === 'content'    && <ContentLayout    content={content} theme={t} onEdit={onEdit} />}
              {layout === 'bullets'    && <BulletsLayout    content={content} theme={t} onEdit={onEdit} />}
              {layout === 'quote'      && <QuoteLayout      content={content} theme={t} onEdit={onEdit} />}
              {layout === 'stats'      && <StatsLayout      content={content} theme={t} onEdit={onEdit} />}
              {layout === 'two-column' && <TwoColumnLayout  content={content} theme={t} onEdit={onEdit} />}
            </>
          );
        })()}
      </div>

      {/* Positioned images — hidden in editor (ImageEditor overlay handles them there) */}
      {!onEdit && (content.images ?? []).map(img => (
        <img
          key={img.id}
          src={img.url}
          alt=""
          style={{
            position: 'absolute',
            left: img.x, top: img.y,
            width: img.width, height: img.height,
            objectFit: 'contain',
            zIndex: 4,
            pointerEvents: 'none',
            borderRadius: 4,
          }}
        />
      ))}

      {/* Logo watermark */}
      {theme.logoUrl && (
        <div style={{
          position: 'absolute', bottom: 24, right: 36, zIndex: 3,
          opacity: 0.8, pointerEvents: 'none',
        }}>
          <img
            src={theme.logoUrl}
            alt="logo"
            style={{
              height: 52,
              width: 'auto',
              display: 'block',
              filter: theme.logoFilter ?? 'none',
            }}
          />
        </div>
      )}

      {/* Live transcript ticker */}
      {isActive && liveTranscript && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '14px 28px',
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          borderTop: `1px solid ${theme.borderColor}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
            <p style={{ color: theme.textColor, fontSize: 18, margin: 0, opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {liveTranscript}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Layout helpers ────────────────────────────────────────────────────────────

type LayoutProps = { content: SlideContent; theme: SlideTheme; onEdit?: (p: Partial<SlideContent>) => void };

function T({ value, onChange, style, multiline, onEdit }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties; multiline?: boolean; onEdit?: unknown }) {
  if (!onEdit) return <>{value}</>;
  return <InlineText value={value} onChange={onChange} style={style} multiline={multiline} />;
}

// ─── Layouts ──────────────────────────────────────────────────────────────────

function TitleLayout({ content, theme, onEdit }: LayoutProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '60px 80px', textAlign: 'center' }}>
      <div style={{ width: 60, height: 4, background: theme.accentColor, borderRadius: 2, marginBottom: 40 }} />
      <h1 style={{ color: theme.titleColor, fontSize: 72, fontWeight: 800, lineHeight: 1.1, margin: 0, letterSpacing: '-0.02em', fontFamily: 'inherit' }}>
        <T value={content.title} onChange={v => onEdit?.({ title: v })} onEdit={onEdit} />
      </h1>
      {(content.subtitle !== undefined || onEdit) && (
        <p style={{ color: theme.mutedColor, fontSize: 28, marginTop: 28, fontWeight: 400, lineHeight: 1.5, maxWidth: 900, fontFamily: 'inherit' }}>
          <T value={content.subtitle ?? ''} onChange={v => onEdit?.({ subtitle: v })} onEdit={onEdit} multiline />
        </p>
      )}
      <div style={{ width: 60, height: 4, background: theme.accentColor, borderRadius: 2, marginTop: 40, opacity: 0.4 }} />
    </div>
  );
}

function ContentLayout({ content, theme, onEdit }: LayoutProps) {
  const bullets = content.bullets ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0 0 80px 0' }}>
      <div style={{ height: 6, background: theme.accentColor, width: '100%' }} />
      <div style={{ padding: '40px 72px 0' }}>
        <h2 style={{ color: theme.titleColor, fontSize: 52, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.15, fontFamily: 'inherit' }}>
          <T value={content.title} onChange={v => onEdit?.({ title: v })} onEdit={onEdit} />
        </h2>
        <div style={{ height: 3, width: 56, background: theme.accentColor, borderRadius: 2, marginBottom: 40 }} />
      </div>
      <div style={{ padding: '0 72px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        {bullets.map((bullet, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: theme.accentColor, flexShrink: 0, marginTop: 14 }} />
            <p style={{ color: theme.textColor, fontSize: 28, margin: 0, lineHeight: 1.5, fontFamily: 'inherit' }}>
              <T value={bullet} onChange={v => { const b = [...bullets]; b[i] = v; onEdit?.({ bullets: b }); }} onEdit={onEdit} multiline />
            </p>
          </div>
        ))}
        {content.body !== undefined && (
          <p style={{ color: theme.textColor, fontSize: 28, lineHeight: 1.6, margin: 0, fontFamily: 'inherit' }}>
            <T value={content.body} onChange={v => onEdit?.({ body: v })} onEdit={onEdit} multiline />
          </p>
        )}
      </div>
    </div>
  );
}

function BulletsLayout({ content, theme, onEdit }: LayoutProps) {
  const bullets = content.bullets ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 6, background: theme.accentColor, width: '100%' }} />
      <div style={{ padding: '40px 72px 0' }}>
        <h2 style={{ color: theme.titleColor, fontSize: 48, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', fontFamily: 'inherit' }}>
          <T value={content.title} onChange={v => onEdit?.({ title: v })} onEdit={onEdit} />
        </h2>
        <div style={{ height: 3, width: 56, background: theme.accentColor, borderRadius: 2, marginBottom: 32 }} />
      </div>
      <div style={{ padding: '0 72px', columns: bullets.length > 4 ? 2 : 1, columnGap: 48, flex: 1 }}>
        {bullets.map((bullet, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, breakInside: 'avoid' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: theme.borderColor, border: `2px solid ${theme.accentColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
              <span style={{ color: theme.accentColor, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{i + 1}</span>
            </div>
            <p style={{ color: theme.textColor, fontSize: 24, margin: 0, lineHeight: 1.5, fontFamily: 'inherit' }}>
              <T value={bullet} onChange={v => { const b = [...bullets]; b[i] = v; onEdit?.({ bullets: b }); }} onEdit={onEdit} multiline />
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuoteLayout({ content, theme, onEdit }: LayoutProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '60px 120px', textAlign: 'center' }}>
      <div style={{ fontSize: 120, lineHeight: 1, color: theme.accentColor, fontFamily: 'Georgia', marginBottom: -20, opacity: 0.6 }}>
        "
      </div>
      <blockquote style={{ color: theme.titleColor, fontSize: 38, fontStyle: 'italic', margin: '0 0 32px', lineHeight: 1.4, fontWeight: 500, fontFamily: 'inherit' }}>
        <T value={content.quote ?? ''} onChange={v => onEdit?.({ quote: v })} onEdit={onEdit} multiline />
      </blockquote>
      {(content.attribution !== undefined || onEdit) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 2, background: theme.accentColor }} />
          <span style={{ color: theme.mutedColor, fontSize: 22, fontWeight: 600, fontFamily: 'inherit' }}>
            <T value={content.attribution ?? ''} onChange={v => onEdit?.({ attribution: v })} onEdit={onEdit} />
          </span>
          <div style={{ width: 48, height: 2, background: theme.accentColor }} />
        </div>
      )}
      {content.title && (
        <p style={{ color: theme.mutedColor, fontSize: 20, marginTop: 28, fontStyle: 'normal', fontWeight: 500, fontFamily: 'inherit' }}>
          <T value={content.title} onChange={v => onEdit?.({ title: v })} onEdit={onEdit} />
        </p>
      )}
    </div>
  );
}

function StatsLayout({ content, theme, onEdit }: LayoutProps) {
  const stats = content.stats ?? [];
  const cols = stats.length <= 2 ? 2 : stats.length <= 3 ? 3 : 4;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 6, background: theme.accentColor, width: '100%' }} />
      <div style={{ padding: '40px 72px 0' }}>
        <h2 style={{ color: theme.titleColor, fontSize: 48, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', fontFamily: 'inherit' }}>
          <T value={content.title} onChange={v => onEdit?.({ title: v })} onEdit={onEdit} />
        </h2>
        <div style={{ height: 3, width: 56, background: theme.accentColor, borderRadius: 2 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 24, padding: '40px 72px', flex: 1 }}>
        {stats.slice(0, cols).map((stat, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${theme.borderColor}`, borderRadius: 16, padding: '32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: theme.accentColor, lineHeight: 1.1, letterSpacing: '-0.03em', fontFamily: 'inherit' }}>
              <T value={stat.value} onChange={v => { const s = [...stats]; s[i] = { ...s[i], value: v }; onEdit?.({ stats: s }); }} onEdit={onEdit} />
            </div>
            <div style={{ color: theme.mutedColor, fontSize: 20, marginTop: 10, lineHeight: 1.3, fontFamily: 'inherit' }}>
              <T value={stat.label} onChange={v => { const s = [...stats]; s[i] = { ...s[i], label: v }; onEdit?.({ stats: s }); }} onEdit={onEdit} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TwoColumnLayout({ content, theme, onEdit }: LayoutProps) {
  const left = content.leftColumn ?? content.bullets?.slice(0, 3) ?? [];
  const right = content.rightColumn ?? content.bullets?.slice(3, 6) ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 6, background: theme.accentColor, width: '100%' }} />
      <div style={{ padding: '40px 72px 0' }}>
        <h2 style={{ color: theme.titleColor, fontSize: 48, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', fontFamily: 'inherit' }}>
          <T value={content.title} onChange={v => onEdit?.({ title: v })} onEdit={onEdit} />
        </h2>
        <div style={{ height: 3, width: 56, background: theme.accentColor, borderRadius: 2, marginBottom: 32 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, padding: '0 72px', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {left.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accentColor, marginTop: 10, flexShrink: 0 }} />
              <p style={{ color: theme.textColor, fontSize: 24, margin: 0, lineHeight: 1.5, fontFamily: 'inherit' }}>
                <T value={item} onChange={v => { const l = [...left]; l[i] = v; onEdit?.({ leftColumn: l }); }} onEdit={onEdit} multiline />
              </p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, borderLeft: `1px solid ${theme.borderColor}`, paddingLeft: 32 }}>
          {right.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accentColor, marginTop: 10, flexShrink: 0 }} />
              <p style={{ color: theme.textColor, fontSize: 24, margin: 0, lineHeight: 1.5, fontFamily: 'inherit' }}>
                <T value={item} onChange={v => { const r = [...right]; r[i] = v; onEdit?.({ rightColumn: r }); }} onEdit={onEdit} multiline />
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Scaled wrapper ────────────────────────────────────────────────────────────

interface ScaledSlideProps {
  slide: Slide;
  theme: SlideTheme;
  containerWidth: number;
  containerHeight: number;
  isActive?: boolean;
  liveTranscript?: string;
  fontFamily?: string;
  onEdit?: (patch: Partial<SlideContent>) => void;
  imageOverlay?: React.ReactNode;
}

export function ScaledSlide({ slide, theme, containerWidth, containerHeight, isActive, liveTranscript, fontFamily, onEdit, imageOverlay }: ScaledSlideProps) {
  const scale = Math.min(containerWidth / SLIDE_W, containerHeight / SLIDE_H);
  const renderedW = SLIDE_W * scale;
  const renderedH = SLIDE_H * scale;

  return (
    <div style={{ width: containerWidth, height: containerHeight, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <div style={{ width: renderedW, height: renderedH, position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
        <SlideRenderer
          slide={slide}
          theme={theme}
          scale={scale}
          isActive={isActive}
          liveTranscript={liveTranscript}
          fontFamily={fontFamily}
          onEdit={onEdit}
        />
        {/* Image drag/resize overlay — rendered in screen space over the scaled slide */}
        {imageOverlay}
      </div>
    </div>
  );
}

export { SLIDE_W, SLIDE_H };


export const SLIDE_ASPECT = { width: SLIDE_W, height: SLIDE_H };

