import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ChartElement } from '../components/ChartElement';
import type { Presentation, ChartData } from '../types/presentation';
import { getTheme } from './themes';

// ── Theme colors ──────────────────────────────────────────────────────────────

interface ExportColors {
  bg: string;
  title: string;
  text: string;
  accent: string;
  muted: string;
}

function colorsFromTheme(themeId: string): ExportColors {
  const theme = getTheme(themeId);
  const strip = (c: string) => c.startsWith('#') ? c.slice(1) : c;
  const bgMatch = theme.background.match(/#([0-9A-Fa-f]{6})/);
  return {
    bg: bgMatch ? bgMatch[1] : '0F0F1A',
    title: strip(theme.titleColor),
    text: strip(theme.textColor),
    accent: strip(theme.accentColor),
    muted: strip(theme.mutedColor),
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 1000);
}

// ── Image fetching ────────────────────────────────────────────────────────────

async function fetchAsDataURL(url: string): Promise<string> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url; // fall back to the original URL if fetch fails
  }
}

function collectImageUrls(presentation: Presentation): string[] {
  const urls = new Set<string>();
  for (const slide of presentation.slides) {
    if (slide.backgroundImageUrl) urls.add(slide.backgroundImageUrl);
    for (const el of (slide.elements ?? [])) {
      if (el.type === 'image' && el.src) urls.add(el.src);
    }
  }
  return [...urls];
}

async function fetchAllImages(presentation: Presentation): Promise<Record<string, string>> {
  const urls = collectImageUrls(presentation);
  const pairs = await Promise.all(
    urls.map(async url => [url, await fetchAsDataURL(url)] as const)
  );
  return Object.fromEntries(pairs);
}

// ── Chart rendering ───────────────────────────────────────────────────────────

async function renderChartToPng(chartData: ChartData, width: number, height: number): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${width}px;height:${height}px;`;
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(createElement(ChartElement, { chartData, width, height }));

    const cleanup = () => {
      root.unmount();
      if (container.parentNode) container.parentNode.removeChild(container);
    };

    setTimeout(() => {
      const svg = container.querySelector('svg');
      if (!svg) { cleanup(); resolve(null); return; }

      // Ensure the SVG has explicit dimensions and namespace
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svg);
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(svgUrl);
        cleanup();
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(svgUrl); cleanup(); resolve(null); };
      img.src = svgUrl;
    }, 400);
  });
}

async function renderAllCharts(presentation: Presentation): Promise<Record<string, string>> {
  const cache: Record<string, string> = {};
  for (const slide of presentation.slides) {
    for (const el of (slide.elements ?? [])) {
      if (el.type === 'chart' && el.chartData) {
        const png = await renderChartToPng(el.chartData, el.width, el.height);
        if (png) cache[el.id] = png;
      }
    }
  }
  return cache;
}

// ── HTML export ───────────────────────────────────────────────────────────────

function generateHTMLPresentation(
  presentation: Presentation,
  imageMap: Record<string, string>,
  chartMap: Record<string, string>,
): string {
  const theme = getTheme(presentation.themeId);
  const colors = colorsFromTheme(presentation.themeId);
  const fontFamily = presentation.fontFamily ?? 'system-ui, sans-serif';
  const totalSlides = presentation.slides.length;

  const slidesHTML = presentation.slides.map((slide, i) => {
    const mode = slide.backgroundMode ?? (slide.backgroundImageUrl ? 'image' : slide.backgroundGradient ? 'gradient' : 'color');
    const overlayOpacity = slide.backgroundOverlayOpacity ?? 0.45;

    // Background style
    let bgStyle = '';
    let bgLayersHTML = '';
    if (mode === 'image' && slide.backgroundImageUrl) {
      bgStyle = 'background: #000;';
      const src = imageMap[slide.backgroundImageUrl] ?? slide.backgroundImageUrl;
      bgLayersHTML = `
        <img src="${src}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;">
        <div style="position:absolute;inset:0;background:rgba(0,0,0,${overlayOpacity});z-index:1;"></div>`;
    } else if (mode === 'gradient' && slide.backgroundGradient) {
      const { angle, from, to } = slide.backgroundGradient;
      bgStyle = `background: linear-gradient(${angle}deg, ${from}, ${to});`;
    } else {
      bgStyle = `background: ${slide.backgroundColor ?? theme.background};`;
    }

    // Free-form elements
    const hasElements = (slide.elements ?? []).length > 0;
    let contentHTML = '';

    if (hasElements) {
      contentHTML = (slide.elements ?? []).map(el => {
        const baseStyle = [
          `position:absolute`,
          `left:${el.x}px`,
          `top:${el.y}px`,
          `width:${el.width}px`,
          `height:${el.height}px`,
          `z-index:${el.zIndex + 2}`,
          el.rotation ? `transform:rotate(${el.rotation}deg);transform-origin:center center` : '',
          el.dropShadow ? `box-shadow:${el.dropShadow}` : '',
        ].filter(Boolean).join(';');

        if (el.type === 'text') {
          const textStyle = [
            `font-size:${el.fontSize ?? 24}px`,
            `font-weight:${el.fontWeight ?? 'normal'}`,
            `font-style:${el.fontStyle ?? 'normal'}`,
            `color:${el.color ?? theme.textColor}`,
            `text-align:${el.textAlign ?? 'left'}`,
            `font-family:${el.fontFamily ?? 'inherit'}`,
            `line-height:1.4`,
            `white-space:pre-wrap`,
            `overflow:hidden`,
            `padding:4px`,
            `box-sizing:border-box`,
          ].join(';');
          return `<div style="${baseStyle};${textStyle}">${escHtml(el.content ?? '')}</div>`;
        }

        if (el.type === 'image' && el.src) {
          const src = imageMap[el.src] ?? el.src;
          const imgStyle = [
            `width:100%`,
            `height:100%`,
            `object-fit:cover`,
            `display:block`,
            el.borderRadius ? `border-radius:${el.borderRadius}px` : '',
          ].filter(Boolean).join(';');
          let strokeHTML = '';
          if (el.strokeWidth && el.strokeWidth > 0) {
            strokeHTML = `<div style="position:absolute;inset:0;box-shadow:inset 0 0 0 ${el.strokeWidth}px ${el.strokeColor ?? '#ffffff'};${el.borderRadius ? `border-radius:${el.borderRadius}px` : ''};pointer-events:none;z-index:1;"></div>`;
          }
          return `<div style="${baseStyle}">${strokeHTML}<img src="${src}" alt="${escHtml(el.alt ?? '')}" style="${imgStyle}"></div>`;
        }

        if (el.type === 'chart') {
          const chartSrc = chartMap[el.id];
          if (chartSrc) {
            return `<img src="${chartSrc}" alt="chart" style="${baseStyle};object-fit:contain;">`;
          }
          return `<div style="${baseStyle};display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:8px;color:rgba(255,255,255,0.4);font-size:14px;">Chart</div>`;
        }

        return '';
      }).join('\n');
    } else {
      // Content-based layout
      const content = slide.content;
      const textColor = `#${colors.title}`;
      const mutedColor = `#${colors.muted}`;
      const accentColor = `#${colors.accent}`;
      const bodyColor = `#${colors.text}`;

      if (slide.layout === 'title') {
        contentHTML = `
          <div style="position:absolute;top:0;left:0;right:0;height:6px;background:${accentColor};"></div>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 80px;text-align:center;">
            <div style="width:60px;height:4px;background:${accentColor};border-radius:2px;margin-bottom:32px;"></div>
            <h1 style="color:${textColor};font-size:64px;font-weight:800;line-height:1.1;margin:0;">${escHtml(content.title)}</h1>
            ${content.subtitle ? `<p style="color:${mutedColor};font-size:26px;margin-top:24px;">${escHtml(content.subtitle)}</p>` : ''}
          </div>`;
      } else if (slide.layout === 'quote') {
        contentHTML = `
          <div style="position:absolute;top:10%;bottom:10%;left:48px;width:6px;background:${accentColor};border-radius:3px;"></div>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 120px;text-align:center;">
            <div style="font-size:120px;line-height:1;color:${accentColor};font-family:Georgia,serif;opacity:0.6;margin-bottom:-24px;">"</div>
            <blockquote style="color:${textColor};font-size:34px;font-style:italic;line-height:1.4;margin:0 0 24px;">${escHtml(content.quote ?? '')}</blockquote>
            ${content.attribution ? `<div style="color:${mutedColor};font-size:20px;font-weight:600;">${escHtml(content.attribution)}</div>` : ''}
          </div>`;
      } else if (slide.layout === 'stats') {
        const statsHTML = (content.stats ?? []).map(s =>
          `<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;text-align:center;">
            <div style="font-size:52px;font-weight:800;color:${accentColor};">${escHtml(s.value)}</div>
            <div style="color:${mutedColor};font-size:18px;margin-top:8px;">${escHtml(s.label)}</div>
          </div>`
        ).join('');
        contentHTML = `
          <div style="position:absolute;top:0;left:0;right:0;height:6px;background:${accentColor};"></div>
          <div style="position:absolute;top:14px;left:60px;right:60px;">
            <h2 style="color:${textColor};font-size:42px;font-weight:700;margin:0 0 8px;">${escHtml(content.title)}</h2>
            <div style="width:56px;height:3px;background:${accentColor};border-radius:2px;"></div>
          </div>
          <div style="position:absolute;top:130px;left:60px;right:60px;bottom:40px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;">${statsHTML}</div>`;
      } else {
        const bulletsHTML = (content.bullets ?? (content.body ? [content.body] : [])).map(b =>
          `<div style="display:flex;align-items:flex-start;gap:16px;">
            <div style="width:10px;height:10px;border-radius:50%;background:${accentColor};flex-shrink:0;margin-top:8px;"></div>
            <p style="color:${bodyColor};font-size:26px;line-height:1.5;margin:0;">${escHtml(b)}</p>
          </div>`
        ).join('');
        contentHTML = `
          <div style="position:absolute;top:0;left:0;right:0;height:6px;background:${accentColor};"></div>
          <div style="position:absolute;top:14px;left:60px;right:60px;">
            <h2 style="color:${textColor};font-size:42px;font-weight:700;margin:0 0 8px;">${escHtml(content.title)}</h2>
            <div style="width:56px;height:3px;background:${accentColor};border-radius:2px;"></div>
          </div>
          <div style="position:absolute;top:130px;left:60px;right:60px;bottom:40px;display:flex;flex-direction:column;justify-content:center;gap:16px;">${bulletsHTML}</div>`;
      }
    }

    return `
    <div class="slide${i === 0 ? ' active' : ''}" id="slide-${i}" data-index="${i}">
      <div class="slide-inner" style="${bgStyle}">
        ${bgLayersHTML}
        <div style="position:relative;z-index:2;width:100%;height:100%;">
          ${contentHTML}
        </div>
        <div style="position:absolute;bottom:16px;right:24px;color:rgba(255,255,255,0.25);font-size:12px;z-index:10;">${i + 1} / ${totalSlides}</div>
      </div>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(presentation.title)}</title>
${googleFontsUrl(fontFamily) ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
<link rel="stylesheet" href="${googleFontsUrl(fontFamily)}">` : ''}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; font-family: ${fontFamily}; overflow: hidden; width: 100vw; height: 100vh; }
  .presentation { position: relative; width: 100vw; height: 100vh; }
  .slide { position: absolute; inset: 0; display: none; }
  .slide.active { display: block; }
  .slide-inner {
    position: absolute;
    width: 1280px;
    height: 720px;
    transform-origin: top left;
    overflow: hidden;
  }
  .controls {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 12px; align-items: center;
    background: rgba(0,0,0,0.6); padding: 10px 20px; border-radius: 40px;
    backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1);
    z-index: 100; font-family: inherit;
  }
  .controls button {
    background: rgba(255,255,255,0.1); border: none; color: white;
    cursor: pointer; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-family: inherit;
  }
  .controls button:hover { background: rgba(255,255,255,0.2); }
  .slide-counter { color: rgba(255,255,255,0.5); font-size: 13px; }
</style>
</head>
<body>
<div class="presentation" id="presentation">
  ${slidesHTML}
</div>
<div class="controls">
  <button onclick="prev()">← Prev</button>
  <span class="slide-counter" id="counter">1 / ${totalSlides}</span>
  <button onclick="next()">Next →</button>
</div>
<script>
  let current = 0;
  const total = ${totalSlides};

  function scaleSlides() {
    const scaleX = window.innerWidth / 1280;
    const scaleY = window.innerHeight / 720;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (window.innerWidth - 1280 * scale) / 2;
    const offsetY = (window.innerHeight - 720 * scale) / 2;
    document.querySelectorAll('.slide-inner').forEach(el => {
      el.style.transform = 'scale(' + scale + ')';
      el.style.left = offsetX + 'px';
      el.style.top = offsetY + 'px';
    });
  }

  function show(n) {
    document.querySelectorAll('.slide').forEach(s => s.classList.remove('active'));
    document.getElementById('slide-' + n).classList.add('active');
    document.getElementById('counter').textContent = (n + 1) + ' / ' + total;
    current = n;
  }

  function next() { if (current < total - 1) show(current + 1); }
  function prev() { if (current > 0) show(current - 1); }

  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
  });

  scaleSlides();
  window.addEventListener('resize', scaleSlides);
</script>
</body>
</html>`;
}

/** Return the primary font name from a CSS font-family stack, e.g. '"Space Grotesk", Inter' → 'Space Grotesk' */
function primaryFontName(fontFamily: string | undefined, fallback = 'Calibri'): string {
  if (!fontFamily) return fallback;
  return fontFamily.replace(/['"]/g, '').split(',')[0].trim() || fallback;
}

/** Google Fonts stylesheet URL for the primary font in a font-family stack, or null for system fonts. */
function googleFontsUrl(fontFamily: string | undefined): string | null {
  const name = primaryFontName(fontFamily, '');
  if (!name || ['system-ui', 'sans-serif', 'serif', 'monospace', 'inherit'].includes(name)) return null;
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@300;400;500;600;700;800&display=swap`;
}

// ── PPTX export ───────────────────────────────────────────────────────────────

// LAYOUT_16x9 = 10" × 5.625" — must match these constants exactly
const PPTX_W = 10;
const PPTX_H = 5.625;

function px(n: number, axis: 'x' | 'y'): number {
  return axis === 'x' ? (n / 1280) * PPTX_W : (n / 720) * PPTX_H;
}

/** Convert any CSS color to a 6-digit hex string for pptxgenjs (no leading #). */
function toHex6(color: string): string {
  const c = (color ?? '').trim();
  // Strip leading #
  const raw = c.startsWith('#') ? c.slice(1) : c;
  // 3-digit hex → 6-digit
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return raw[0]+raw[0]+raw[1]+raw[1]+raw[2]+raw[2];
  }
  // Already 6-digit hex
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  // rgb(...) / rgba(...)
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  return 'FFFFFF';
}

/**
 * Crop a dataURL image to a target pixel size using canvas (simulates object-fit: cover).
 * Returns the original dataURL on any failure.
 */
async function cropToCover(dataUrl: string, targetW: number, targetH: number): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        const imgAspect = img.naturalWidth / img.naturalHeight;
        const tgtAspect = targetW / targetH;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        if (imgAspect > tgtAspect) {
          sw = img.naturalHeight * tgtAspect;
          sx = (img.naturalWidth - sw) / 2;
        } else {
          sh = img.naturalWidth / tgtAspect;
          sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function tryPPTXExport(
  presentation: Presentation,
  imageMap: Record<string, string>,
  chartMap: Record<string, string>,
): Promise<boolean> {
  try {
    const pptxgen = (await import('pptxgenjs')).default;
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_16x9'; // 10" × 5.625" — matches PPTX_W/H constants
    const theme = getTheme(presentation.themeId);
    const colors = colorsFromTheme(presentation.themeId);

    for (const slide of presentation.slides) {
      const pSlide = pptx.addSlide();

      // ── Background ──────────────────────────────────────────────────────────
      const mode = slide.backgroundMode ?? (slide.backgroundImageUrl ? 'image' : slide.backgroundGradient ? 'gradient' : 'color');

      if (mode === 'image' && slide.backgroundImageUrl) {
        const rawData = imageMap[slide.backgroundImageUrl] ?? slide.backgroundImageUrl;
        // Crop to slide aspect ratio so it fills perfectly
        const bgData = await cropToCover(rawData, 1280, 720);
        pSlide.background = { data: bgData };
        const opacity = slide.backgroundOverlayOpacity ?? 0.45;
        pSlide.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: PPTX_W, h: PPTX_H,
          fill: { color: '000000', transparency: Math.round((1 - opacity) * 100) },
          line: { width: 0 },
        });
      } else if (mode === 'gradient' && slide.backgroundGradient) {
        const { from, to } = slide.backgroundGradient;
        pSlide.background = { color: toHex6(from) };
        pSlide.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: PPTX_W, h: PPTX_H,
          fill: { type: 'solid', color: toHex6(to), transparency: 50 },
          line: { width: 0 },
        });
      } else {
        const bgColor = slide.backgroundColor ?? theme.background;
        pSlide.background = { color: toHex6(bgColor) };
      }

      // ── Free-form elements ──────────────────────────────────────────────────
      const elements = slide.elements ?? [];
      if (elements.length > 0) {
        for (const el of elements) {
          const x = px(el.x, 'x');
          const y = px(el.y, 'y');
          const w = px(el.width, 'x');
          const h = px(el.height, 'y');

          if (el.type === 'text' && el.content) {
            const fontSize = Math.round((el.fontSize ?? 24) * 0.5625);
            const color = toHex6(el.color ?? `#${colors.text}`);
            pSlide.addText(el.content, {
              x, y, w, h,
              fontSize,
              color,
              bold: el.fontWeight === 'bold',
              italic: el.fontStyle === 'italic',
              align: el.textAlign ?? 'left',
              valign: 'top',
              fontFace: primaryFontName(el.fontFamily ?? presentation.fontFamily),
              wrap: true,
            });
          }

          if (el.type === 'image' && el.src) {
            const rawData = imageMap[el.src] ?? el.src;
            try {
              // Pre-crop to element aspect ratio (object-fit: cover equivalent)
              const imgData = await cropToCover(rawData, el.width, el.height);
              pSlide.addImage({ data: imgData, x, y, w, h });
            } catch {
              // skip if image fails
            }
          }

          if (el.type === 'chart' && chartMap[el.id]) {
            try {
              pSlide.addImage({ data: chartMap[el.id], x, y, w, h });
            } catch {
              // skip if image fails
            }
          }
        }
      } else {
        // ── Content-based layout ──────────────────────────────────────────────
        const pFont = primaryFontName(presentation.fontFamily);
        if (slide.layout === 'title') {
          pSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.8, w: PPTX_W, h: 0.06, fill: { color: colors.accent }, line: { width: 0 } });
          pSlide.addText(slide.content.title, { x: 0.8, y: 1.0, w: 8.4, h: 2.0, fontSize: 44, bold: true, color: colors.title, align: 'center', fontFace: pFont });
          if (slide.content.subtitle) {
            pSlide.addText(slide.content.subtitle, { x: 0.8, y: 3.2, w: 8.4, h: 1.0, fontSize: 20, color: colors.muted, align: 'center', fontFace: pFont });
          }
        } else if (slide.layout === 'quote') {
          pSlide.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.8, w: 0.08, h: 3.5, fill: { color: colors.accent }, line: { width: 0 } });
          pSlide.addText(`"${slide.content.quote ?? ''}"`, { x: 0.6, y: 1.0, w: 8.4, h: 2.5, fontSize: 24, italic: true, color: colors.title, fontFace: pFont, valign: 'middle' });
          if (slide.content.attribution) {
            pSlide.addText(slide.content.attribution, { x: 0.6, y: 3.7, w: 8.4, h: 0.5, fontSize: 16, color: colors.muted, fontFace: pFont });
          }
        } else if (slide.layout === 'stats') {
          pSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: PPTX_W, h: 0.08, fill: { color: colors.accent }, line: { width: 0 } });
          pSlide.addText(slide.content.title, { x: 0.5, y: 0.2, w: 9.0, h: 0.8, fontSize: 28, bold: true, color: colors.title, fontFace: pFont });
          const stats = slide.content.stats ?? [];
          const n = Math.min(stats.length, 4);
          const cellW = PPTX_W / (n || 1);
          stats.slice(0, n).forEach((stat, i) => {
            pSlide.addText(stat.value, { x: i * cellW, y: 1.8, w: cellW, h: 1.0, fontSize: 36, bold: true, color: colors.accent, align: 'center', fontFace: pFont });
            pSlide.addText(stat.label, { x: i * cellW, y: 2.9, w: cellW, h: 0.6, fontSize: 14, color: colors.muted, align: 'center', fontFace: pFont });
          });
        } else {
          pSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: PPTX_W, h: 0.08, fill: { color: colors.accent }, line: { width: 0 } });
          pSlide.addText(slide.content.title, { x: 0.5, y: 0.2, w: 9.0, h: 0.8, fontSize: 28, bold: true, color: colors.title, fontFace: pFont });
          const bullets = slide.content.bullets ?? [];
          bullets.forEach((b, i) => {
            pSlide.addText(`• ${b}`, { x: 0.6, y: 1.3 + i * 0.55, w: 8.8, h: 0.5, fontSize: 18, color: colors.text, fontFace: pFont });
          });
        }
      }
    }

    await pptx.writeFile({ fileName: `${presentation.title.replace(/[^a-z0-9]/gi, '_')}.pptx` });
    return true;
  } catch (e) {
    console.warn('pptxgenjs export failed:', e);
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function exportToPPTX(presentation: Presentation): Promise<void> {
  const [imageMap, chartMap] = await Promise.all([
    fetchAllImages(presentation),
    renderAllCharts(presentation),
  ]);
  const success = await tryPPTXExport(presentation, imageMap, chartMap);
  if (!success) {
    const html = generateHTMLPresentation(presentation, imageMap, chartMap);
    downloadBlob(html, `${presentation.title.replace(/[^a-z0-9]/gi, '_')}.html`, 'text/html');
  }
}

export async function exportToHTML(presentation: Presentation): Promise<void> {
  const [imageMap, chartMap] = await Promise.all([
    fetchAllImages(presentation),
    renderAllCharts(presentation),
  ]);
  const html = generateHTMLPresentation(presentation, imageMap, chartMap);
  downloadBlob(html, `${presentation.title.replace(/[^a-z0-9]/gi, '_')}.html`, 'text/html');
}

export async function exportForKeynote(presentation: Presentation): Promise<void> {
  await exportToPPTX(presentation);
}

export async function exportForGoogleSlides(presentation: Presentation): Promise<void> {
  await exportToPPTX(presentation);
}
