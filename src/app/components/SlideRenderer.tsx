import React from 'react';
import type { Slide, SlideElement, SlideTheme } from '../types/presentation';
import { ChartElement } from './ChartElement';

function buildBoxShadow(el: SlideElement): string | null {
  return el.dropShadow ?? null;
}

interface SlideRendererProps {
  slide: Slide;
  theme: SlideTheme;
  scale?: number;
  isActive?: boolean;
  liveTranscript?: string;
  fontFamily?: string;
}

const SLIDE_W = 1280;
const SLIDE_H = 720;

export function SlideRenderer({ slide, theme, scale = 1, isActive, liveTranscript, fontFamily }: SlideRendererProps) {
  const { layout, content } = slide;

  const resolvedFont = fontFamily ?? '"Space Grotesk", "Inter", "Segoe UI", system-ui, sans-serif';

  const containerStyle: React.CSSProperties = {
    width: SLIDE_W,
    height: SLIDE_H,
    transform: `scale(${scale})`,
    transformOrigin: 'top left',
    position: 'relative',
    overflow: 'hidden',
    background: (() => {
      const mode = slide.backgroundMode ?? (slide.backgroundImageUrl ? 'image' : slide.backgroundGradient ? 'gradient' : 'color');
      if (mode === 'image' && slide.backgroundImageUrl) return '#000';
      if (mode === 'gradient' && slide.backgroundGradient) return `linear-gradient(${slide.backgroundGradient.angle}deg, ${slide.backgroundGradient.from}, ${slide.backgroundGradient.to})`;
      return slide.backgroundColor ?? theme.background;
    })(),
    fontFamily: resolvedFont,
  };

  return (
    <div style={containerStyle}>
      {/* Background image layer */}
      {slide.backgroundImageUrl && (slide.backgroundMode === 'image' || !slide.backgroundMode) && (
        <>
          <img
            src={slide.backgroundImageUrl}
            alt={slide.backgroundImageAlt ?? ''}
            style={{
              position: 'absolute', inset: 0, zIndex: 0,
              width: '100%', height: '100%',
              objectFit: 'cover',
            }}
          />
          <div style={{
            position: 'absolute', inset: 0, zIndex: 1,
            background: `rgba(0,0,0,${slide.backgroundOverlayOpacity ?? 0.45})`,
          }} />
        </>
      )}

      {/* Free-form elements (editor mode) */}
      {slide.elements && slide.elements.length > 0 ? (
        <>
          {slide.elements.map(el => (
            <div
              key={el.id}
              style={{
                position: 'absolute',
                left: el.x, top: el.y,
                width: el.width, height: el.height,
                zIndex: el.zIndex + 2,
                boxSizing: 'border-box',
                padding: el.type === 'text' ? 4 : 0,
                overflow: 'hidden',
                borderRadius: el.borderRadius ? `${el.borderRadius}px` : undefined,
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
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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
                <div style={{
                  width: '100%', height: '100%',
                  fontSize: el.fontSize ?? 24,
                  fontWeight: el.fontWeight ?? 'normal',
                  fontStyle: el.fontStyle ?? 'normal',
                  color: el.color ?? theme.textColor,
                  textAlign: el.textAlign ?? 'left',
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                  overflow: 'hidden',
                  fontFamily: el.fontFamily ?? 'inherit',
                }}>
                  {el.content}
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        /* Layout-based rendering (playback / thumbnails of unconverted slides) */
        <div style={{ position: 'relative', zIndex: 2, width: '100%', height: '100%' }}>
          {(() => {
            const t: SlideTheme = slide.backgroundImageUrl
              ? { ...theme, titleColor: '#FFFFFF', textColor: 'rgba(255,255,255,0.92)', mutedColor: 'rgba(255,255,255,0.72)' }
              : theme;
            return (
              <>
                {layout === 'title' && <TitleLayout content={content} theme={t} />}
                {layout === 'content' && <ContentLayout content={content} theme={t} />}
                {layout === 'bullets' && <BulletsLayout content={content} theme={t} />}
                {layout === 'quote' && <QuoteLayout content={content} theme={t} />}
                {layout === 'stats' && <StatsLayout content={content} theme={t} />}
                {layout === 'two-column' && <TwoColumnLayout content={content} theme={t} />}
              </>
            );
          })()}
        </div>
      )}

      {/* Live transcript ticker */}
      {isActive && liveTranscript && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '14px 28px',
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          borderTop: `1px solid ${theme.borderColor}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="animate-pulse" style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#EF4444',
              flexShrink: 0,
            }} />
            <p style={{
              color: theme.textColor,
              fontSize: 18,
              margin: 0,
              opacity: 0.9,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {liveTranscript}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Layout components ─────────────────────────────────────────────────────────

function TitleLayout({ content, theme }: { content: Slide['content']; theme: SlideTheme }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '60px 80px', textAlign: 'center' }}>
      {/* Decorative elements */}
      <div style={{ width: 60, height: 4, background: theme.accentColor, borderRadius: 2, marginBottom: 40 }} />
      <h1 style={{
        color: theme.titleColor, fontSize: 72, fontWeight: 800, lineHeight: 1.1,
        margin: 0, letterSpacing: '-0.02em', fontFamily: 'inherit',
      }}>
        {content.title}
      </h1>
      {content.subtitle && (
        <p style={{
          color: theme.mutedColor, fontSize: 28, marginTop: 28, fontWeight: 400,
          lineHeight: 1.5, maxWidth: 900, fontFamily: 'inherit',
        }}>
          {content.subtitle}
        </p>
      )}
      <div style={{ width: 60, height: 4, background: theme.accentColor, borderRadius: 2, marginTop: 40, opacity: 0.4 }} />
    </div>
  );
}

function ContentLayout({ content, theme }: { content: Slide['content']; theme: SlideTheme }) {
  const bullets = content.bullets ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '0 0 80px 0' }}>
      {/* Header bar */}
      <div style={{ height: 6, background: theme.accentColor, width: '100%' }} />
      <div style={{ padding: '40px 72px 0' }}>
        <h2 style={{ color: theme.titleColor, fontSize: 52, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', lineHeight: 1.15, fontFamily: 'inherit' }}>
          {content.title}
        </h2>
        <div style={{ height: 3, width: 56, background: theme.accentColor, borderRadius: 2, marginBottom: 40 }} />
      </div>
      <div style={{ padding: '0 72px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        {bullets.map((bullet, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              background: theme.accentColor,
              flexShrink: 0, marginTop: 14,
            }} />
            <p style={{ color: theme.textColor, fontSize: 28, margin: 0, lineHeight: 1.5, fontFamily: 'inherit' }}>
              {bullet}
            </p>
          </div>
        ))}
        {content.body && (
          <p style={{ color: theme.textColor, fontSize: 28, lineHeight: 1.6, margin: 0, fontFamily: 'inherit' }}>{content.body}</p>
        )}
      </div>
    </div>
  );
}

function BulletsLayout({ content, theme }: { content: Slide['content']; theme: SlideTheme }) {
  const bullets = content.bullets ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 6, background: theme.accentColor, width: '100%' }} />
      <div style={{ padding: '40px 72px 0' }}>
        <h2 style={{ color: theme.titleColor, fontSize: 48, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', fontFamily: 'inherit' }}>
          {content.title}
        </h2>
        <div style={{ height: 3, width: 56, background: theme.accentColor, borderRadius: 2, marginBottom: 32 }} />
      </div>
      <div style={{ padding: '0 72px', columns: bullets.length > 4 ? 2 : 1, columnGap: 48, flex: 1 }}>
        {bullets.map((bullet, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, breakInside: 'avoid' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: theme.borderColor,
              border: `2px solid ${theme.accentColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginTop: 2,
            }}>
              <span style={{ color: theme.accentColor, fontSize: 14, fontWeight: 700, fontFamily: 'inherit' }}>{i + 1}</span>
            </div>
            <p style={{ color: theme.textColor, fontSize: 24, margin: 0, lineHeight: 1.5, fontFamily: 'inherit' }}>
              {bullet}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuoteLayout({ content, theme }: { content: Slide['content']; theme: SlideTheme }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', padding: '60px 120px', textAlign: 'center',
    }}>
      <div style={{
        fontSize: 120, lineHeight: 1, color: theme.accentColor, fontFamily: 'Georgia',
        marginBottom: -20, opacity: 0.6,
      }}>
        "
      </div>
      <blockquote style={{
        color: theme.titleColor, fontSize: 38, fontStyle: 'italic',
        margin: '0 0 32px', lineHeight: 1.4, fontWeight: 500, fontFamily: 'inherit',
      }}>
        {content.quote}
      </blockquote>
      {content.attribution && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 2, background: theme.accentColor }} />
          <span style={{ color: theme.mutedColor, fontSize: 22, fontWeight: 600, fontFamily: 'inherit' }}>
            {content.attribution}
          </span>
          <div style={{ width: 48, height: 2, background: theme.accentColor }} />
        </div>
      )}
      <p style={{ color: theme.mutedColor, fontSize: 20, marginTop: 28, fontStyle: 'normal', fontWeight: 500, fontFamily: 'inherit' }}>
        {content.title}
      </p>
    </div>
  );
}

function StatsLayout({ content, theme }: { content: Slide['content']; theme: SlideTheme }) {
  const stats = content.stats ?? [];
  const cols = stats.length <= 2 ? 2 : stats.length <= 3 ? 3 : 4;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 6, background: theme.accentColor, width: '100%' }} />
      <div style={{ padding: '40px 72px 0' }}>
        <h2 style={{ color: theme.titleColor, fontSize: 48, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', fontFamily: 'inherit' }}>
          {content.title}
        </h2>
        <div style={{ height: 3, width: 56, background: theme.accentColor, borderRadius: 2 }} />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 24,
        padding: '40px 72px',
        flex: 1,
      }}>
        {stats.slice(0, cols).map((stat, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${theme.borderColor}`,
            borderRadius: 16,
            padding: '32px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
          }}>
            <div style={{ fontSize: 64, fontWeight: 800, color: theme.accentColor, lineHeight: 1.1, letterSpacing: '-0.03em', fontFamily: 'inherit' }}>
              {stat.value}
            </div>
            <div style={{ color: theme.mutedColor, fontSize: 20, marginTop: 10, lineHeight: 1.3, fontFamily: 'inherit' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TwoColumnLayout({ content, theme }: { content: Slide['content']; theme: SlideTheme }) {
  const left = content.leftColumn ?? content.bullets?.slice(0, 3) ?? [];
  const right = content.rightColumn ?? content.bullets?.slice(3, 6) ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 6, background: theme.accentColor, width: '100%' }} />
      <div style={{ padding: '40px 72px 0' }}>
        <h2 style={{ color: theme.titleColor, fontSize: 48, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em', fontFamily: 'inherit' }}>
          {content.title}
        </h2>
        <div style={{ height: 3, width: 56, background: theme.accentColor, borderRadius: 2, marginBottom: 32 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, padding: '0 72px', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {left.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accentColor, marginTop: 10, flexShrink: 0 }} />
              <p style={{ color: theme.textColor, fontSize: 24, margin: 0, lineHeight: 1.5, fontFamily: 'inherit' }}>{item}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, borderLeft: `1px solid ${theme.borderColor}`, paddingLeft: 32 }}>
          {right.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: theme.accentColor, marginTop: 10, flexShrink: 0 }} />
              <p style={{ color: theme.textColor, fontSize: 24, margin: 0, lineHeight: 1.5, fontFamily: 'inherit' }}>{item}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Scaled wrapper for responsive display ──────────────────────────────────

interface ScaledSlideProps {
  slide: Slide;
  theme: SlideTheme;
  containerWidth: number;
  containerHeight: number;
  isActive?: boolean;
  liveTranscript?: string;
  fontFamily?: string;
}

export function ScaledSlide({ slide, theme, containerWidth, containerHeight, isActive, liveTranscript, fontFamily }: ScaledSlideProps) {
  const scale = Math.min(containerWidth / SLIDE_W, containerHeight / SLIDE_H);
  const renderedW = SLIDE_W * scale;
  const renderedH = SLIDE_H * scale;

  return (
    <div style={{
      width: containerWidth,
      height: containerHeight,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      <div style={{ width: renderedW, height: renderedH, position: 'relative', overflow: 'hidden', borderRadius: 4 }}>
        <SlideRenderer
          slide={slide}
          theme={theme}
          scale={scale}
          isActive={isActive}
          liveTranscript={liveTranscript}
          fontFamily={fontFamily}
        />
      </div>
    </div>
  );
}

export const SLIDE_ASPECT = { width: SLIDE_W, height: SLIDE_H };