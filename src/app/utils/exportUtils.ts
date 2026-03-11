import type { Presentation, Slide } from '../types/presentation';
import { getTheme } from './themes';

interface ExportColors {
  bg: string;
  bg2: string;
  title: string;
  text: string;
  accent: string;
  muted: string;
}

function colorsFromTheme(themeId: string): ExportColors {
  const theme = getTheme(themeId);
  const strip = (c: string) => c.startsWith('#') ? c.slice(1) : c;
  const bgMatches = [...theme.background.matchAll(/#([0-9A-Fa-f]{6})/g)].map(m => m[1]);
  return {
    bg:    bgMatches[0] ?? '0F0F1A',
    bg2:   bgMatches[1] ?? bgMatches[0] ?? '0F0F1A',
    title: strip(theme.titleColor),
    text:  strip(theme.textColor),
    accent: strip(theme.accentColor),
    muted: strip(theme.mutedColor),
  };
}

// ─── HTML export ──────────────────────────────────────────────────────────────
const SLIDE_W_PX = 1280;
const SLIDE_H_PX = 720;

function generateHTMLPresentation(presentation: Presentation): string {
  const theme = getTheme(presentation.themeId);
  const c = colorsFromTheme(presentation.themeId);

  // Detect light vs dark theme for adaptive UI chrome colors
  const bgR = parseInt(c.bg.substring(0, 2), 16);
  const bgG = parseInt(c.bg.substring(2, 4), 16);
  const bgB = parseInt(c.bg.substring(4, 6), 16);
  const isLight = (bgR + bgG + bgB) / 3 > 128;
  const slideNumColor = isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.25)';
  const statBoxBg = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  const statBoxBorder = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)';
  const colDividerBg = isLight ? 'rgba(0,0,0,0.1)' : `rgba(${parseInt(c.accent.substring(0,2),16)},${parseInt(c.accent.substring(2,4),16)},${parseInt(c.accent.substring(4,6),16)},0.3)`;

  // Font
  const fontFamily = presentation.fontFamily
    ? `'${presentation.fontFamily}', 'Segoe UI', system-ui, sans-serif`
    : "'Segoe UI', Inter, system-ui, sans-serif";
  const googleFontLink = presentation.fontFamily
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(presentation.fontFamily)}:wght@400;600;700;800&display=swap" rel="stylesheet">`
    : '';

  const slidesHTML = presentation.slides.map((slide, i) => {
    const content = slide.content;
    let innerHTML = '';

    if (slide.layout === 'title') {
      innerHTML = `
        <div class="title-bar"></div>
        <div class="title-content">
          <div class="accent-line"></div>
          <h1>${escHtml(content.title)}</h1>
          ${content.subtitle ? `<p class="subtitle">${escHtml(content.subtitle)}</p>` : ''}
        </div>`;
    } else if (slide.layout === 'quote') {
      innerHTML = `
        <div class="quote-bar"></div>
        <div class="quote-content">
          <div class="big-quote">"</div>
          <blockquote>${escHtml(content.quote ?? '')}</blockquote>
          ${content.attribution ? `<div class="attribution">${escHtml(content.attribution)}</div>` : ''}
          <p class="quote-title">${escHtml(content.title)}</p>
        </div>`;
    } else if (slide.layout === 'stats') {
      const statsHTML = (content.stats ?? []).map(s =>
        `<div class="stat-box"><div class="stat-value">${escHtml(s.value)}</div><div class="stat-label">${escHtml(s.label)}</div></div>`
      ).join('');
      innerHTML = `
        <div class="top-bar"></div>
        <div class="slide-header"><h2>${escHtml(content.title)}</h2><div class="header-line"></div></div>
        <div class="stats-grid">${statsHTML}</div>`;
    } else if (slide.layout === 'two-column') {
      const leftHTML = (content.leftColumn ?? []).map(item =>
        `<div class="bullet-row"><div class="bullet-dot"></div><p>${escHtml(item)}</p></div>`
      ).join('');
      const rightHTML = (content.rightColumn ?? []).map(item =>
        `<div class="bullet-row"><div class="bullet-dot"></div><p>${escHtml(item)}</p></div>`
      ).join('');
      innerHTML = `
        <div class="top-bar"></div>
        <div class="slide-header"><h2>${escHtml(content.title)}</h2><div class="header-line"></div></div>
        <div class="two-col">
          <div class="col">${leftHTML}</div>
          <div class="col-divider"></div>
          <div class="col">${rightHTML}</div>
        </div>`;
    } else {
      // bullets + content layouts
      const bulletsHTML = (content.bullets ?? []).map(b =>
        `<div class="bullet-row"><div class="bullet-dot"></div><p>${escHtml(b)}</p></div>`
      ).join('');
      const bodyHTML = content.body
        ? `<p class="body-text">${escHtml(content.body).replace(/\n/g, '<br>')}</p>`
        : '';
      innerHTML = `
        <div class="top-bar"></div>
        <div class="slide-header"><h2>${escHtml(content.title)}</h2><div class="header-line"></div></div>
        <div class="bullets">${bodyHTML}${bulletsHTML}</div>`;
    }

    // Pasted / dragged images — stored in slide coordinate space (1280×720), render as %
    const imagesHTML = (content.images ?? []).map(img =>
      `<img src="${escHtml(img.url)}" alt="" style="position:absolute;left:${(img.x / SLIDE_W_PX * 100).toFixed(2)}%;top:${(img.y / SLIDE_H_PX * 100).toFixed(2)}%;width:${(img.width / SLIDE_W_PX * 100).toFixed(2)}%;height:${(img.height / SLIDE_H_PX * 100).toFixed(2)}%;object-fit:contain;pointer-events:none;" />`
    ).join('');

    return `
      <div class="slide ${i === 0 ? 'active' : ''}" id="slide-${i}" data-index="${i}" style="background: ${theme.background}; position: relative;">
        ${innerHTML}
        ${imagesHTML}
        <div class="slide-number">${i + 1} / ${presentation.slides.length}</div>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<!-- wingman-data: ${JSON.stringify(presentation).replace(/-->/g, '--\\>')} -->
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(presentation.title)}</title>
${googleFontLink}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; font-family: ${fontFamily}; overflow: hidden; }
  .presentation { width: 100vw; height: 100vh; position: relative; }
  .slide {
    position: absolute; inset: 0;
    display: none; flex-direction: column;
    width: 100%; height: 100%;
  }
  .slide.active { display: flex; }
  .top-bar, .title-bar { height: 6px; background: #${c.accent}; width: 100%; flex-shrink: 0; }
  .title-content { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 80px; text-align: center; }
  .title-content h1 { color: #${c.title}; font-size: clamp(32px, 5vw, 72px); font-weight: 800; line-height: 1.1; }
  .subtitle { color: #${c.muted}; font-size: clamp(16px, 2vw, 28px); margin-top: 24px; }
  .accent-line { width: 60px; height: 4px; background: #${c.accent}; border-radius: 2px; margin-bottom: 32px; }
  .slide-header { padding: 32px 60px 0; }
  .slide-header h2 { color: #${c.title}; font-size: clamp(24px, 3.5vw, 52px); font-weight: 700; }
  .header-line { width: 56px; height: 3px; background: #${c.accent}; border-radius: 2px; margin-top: 8px; }
  .bullets { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 16px; padding: 24px 60px; }
  .bullet-row { display: flex; align-items: flex-start; gap: 16px; }
  .bullet-dot { width: 10px; height: 10px; border-radius: 50%; background: #${c.accent}; flex-shrink: 0; margin-top: 8px; }
  .bullet-row p { color: #${c.text}; font-size: clamp(16px, 2.2vw, 28px); line-height: 1.5; }
  .body-text { color: #${c.text}; font-size: clamp(14px, 2vw, 24px); line-height: 1.6; margin-bottom: 16px; }
  .stats-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; padding: 24px 60px; }
  .stat-box { background: ${statBoxBg}; border: 1px solid ${statBoxBorder}; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .stat-value { font-size: clamp(28px, 4vw, 56px); font-weight: 800; color: #${c.accent}; }
  .stat-label { color: #${c.muted}; font-size: clamp(12px, 1.5vw, 20px); margin-top: 8px; }
  .quote-bar { width: 6px; background: #${c.accent}; position: absolute; top: 10%; bottom: 10%; left: 48px; border-radius: 3px; }
  .quote-content { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 120px; text-align: center; }
  .big-quote { font-size: 120px; line-height: 1; color: #${c.accent}; font-family: Georgia; opacity: 0.6; margin-bottom: -24px; }
  blockquote { color: #${c.title}; font-size: clamp(20px, 3vw, 38px); font-style: italic; line-height: 1.4; margin-bottom: 24px; }
  .attribution { color: #${c.muted}; font-size: clamp(14px, 2vw, 22px); font-weight: 600; }
  .quote-title { color: #${c.muted}; font-size: 18px; margin-top: 24px; }
  .two-col { flex: 1; display: flex; gap: 0; padding: 16px 40px 24px; overflow: hidden; }
  .col { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 14px; padding: 0 20px; }
  .col-divider { width: 2px; background: ${colDividerBg}; flex-shrink: 0; margin: 0 8px; }
  .slide-number { position: absolute; bottom: 16px; right: 24px; color: ${slideNumColor}; font-size: 12px; }
  .controls { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; align-items: center; background: rgba(0,0,0,0.6); padding: 10px 20px; border-radius: 40px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
  .controls button { background: rgba(255,255,255,0.1); border: none; color: white; cursor: pointer; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-family: inherit; }
  .controls button:hover { background: rgba(255,255,255,0.2); }
  .slide-counter { color: rgba(255,255,255,0.5); font-size: 13px; }
  .title-badge { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,0.4); font-size: 13px; font-family: inherit; background: rgba(0,0,0,0.4); padding: 6px 16px; border-radius: 20px; backdrop-filter: blur(6px); }
</style>
</head>
<body>
<div class="presentation" id="presentation">
  ${slidesHTML}
</div>
<div class="title-badge">${escHtml(presentation.title)} · Created with Wingman</div>
<div class="controls">
  <button onclick="prev()">← Prev</button>
  <span class="slide-counter" id="counter">1 / ${presentation.slides.length}</span>
  <button onclick="next()">Next →</button>
</div>
<script>
  let current = 0;
  const total = ${presentation.slides.length};
  function show(n) {
    document.querySelectorAll('.slide').forEach(s => s.classList.remove('active'));
    document.getElementById('slide-' + n).classList.add('active');
    document.getElementById('counter').textContent = (n + 1) + ' / ' + total;
    current = n;
  }
  function next() { if (current < total - 1) show(current + 1); }
  function prev() { if (current > 0) show(current - 1); }
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') next();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev();
  });
</script>
</body>
</html>`;
}

function escHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.cssText = 'position:fixed;top:-200px;left:-200px;opacity:0;';
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  // dispatchEvent is more reliable than .click() across browsers (esp. Safari)
  a.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true, view: window }));
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 2000);
}

// ─── Try pptxgenjs, fall back to HTML ────────────────────────────────────────
async function tryPPTXExport(presentation: Presentation): Promise<boolean> {
  try {
    const pptxgen = (await import('pptxgenjs')).default;
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_WIDE';
    const theme = getTheme(presentation.themeId);
    const colors = colorsFromTheme(presentation.themeId);

    // Use the presentation's font family if it's a safe system/web-safe name,
    // otherwise fall back to Calibri which PowerPoint always has.
    const font = presentation.fontFamily
      ? presentation.fontFamily.split(',')[0].trim().replace(/['"]/g, '')
      : 'Calibri';

    for (const slide of presentation.slides) {
      const pSlide = pptx.addSlide();

      // Gradient background: fill with darkest color, then overlay a lighter rect to hint at gradient.
      pSlide.background = { color: colors.bg };
      if (colors.bg !== colors.bg2) {
        pSlide.addShape(pptx.ShapeType.rect, {
          x: 0, y: 0, w: '100%', h: '100%',
          fill: { color: colors.bg2, transparency: 60 },
          line: { type: 'none' },
        });
      }

      if (slide.layout === 'title') {
        // Centered accent line + title + subtitle
        pSlide.addShape(pptx.ShapeType.rect, { x: 3.8, y: 2.1, w: 2.4, h: 0.05, fill: { color: colors.accent }, line: { type: 'none' } });
        pSlide.addText(slide.content.title, { x: 0.8, y: 1.0, w: 8.4, h: 1.8, fontSize: 44, bold: true, color: colors.title, align: 'center', fontFace: font });
        if (slide.content.subtitle) {
          pSlide.addText(slide.content.subtitle, { x: 0.8, y: 2.4, w: 8.4, h: 1.2, fontSize: 20, color: colors.muted, align: 'center', fontFace: font });
        }
      } else if (slide.layout === 'quote') {
        pSlide.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.8, w: 0.08, h: 3.5, fill: { color: colors.accent }, line: { type: 'none' } });
        pSlide.addText(`\u201c${slide.content.quote ?? ''}\u201d`, { x: 0.6, y: 1.0, w: 8.6, h: 2.6, fontSize: 24, italic: true, color: colors.title, fontFace: 'Georgia', valign: 'middle', wrap: true });
        if (slide.content.attribution) {
          pSlide.addText(`\u2014 ${slide.content.attribution}`, { x: 0.6, y: 3.75, w: 8.6, h: 0.5, fontSize: 16, color: colors.muted, fontFace: font });
        }
      } else if (slide.layout === 'stats') {
        pSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: colors.accent }, line: { type: 'none' } });
        pSlide.addText(slide.content.title, { x: 0.5, y: 0.2, w: 9.0, h: 0.8, fontSize: 28, bold: true, color: colors.title, fontFace: font });
        pSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.05, w: 1.2, h: 0.04, fill: { color: colors.accent }, line: { type: 'none' } });
        const stats = slide.content.stats ?? [];
        const n = Math.min(stats.length, 4);
        const cellW = 10 / (n || 1);
        stats.slice(0, n).forEach((stat, i) => {
          const x = i * cellW + 0.15;
          pSlide.addShape(pptx.ShapeType.rect, { x: x + 0.1, y: 1.5, w: cellW - 0.3, h: 2.2, fill: { color: colors.bg2, transparency: 20 }, line: { color: colors.accent, transparency: 70, pt: 1 } });
          pSlide.addText(stat.value, { x, y: 1.7, w: cellW - 0.3, h: 1.0, fontSize: 36, bold: true, color: colors.accent, align: 'center', fontFace: font });
          pSlide.addText(stat.label, { x, y: 2.75, w: cellW - 0.3, h: 0.7, fontSize: 14, color: colors.muted, align: 'center', fontFace: font, wrap: true });
        });
      } else if (slide.layout === 'two-column') {
        pSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: colors.accent }, line: { type: 'none' } });
        pSlide.addText(slide.content.title, { x: 0.5, y: 0.2, w: 9.0, h: 0.8, fontSize: 28, bold: true, color: colors.title, fontFace: font });
        pSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.05, w: 1.2, h: 0.04, fill: { color: colors.accent }, line: { type: 'none' } });
        // Subtle divider
        pSlide.addShape(pptx.ShapeType.rect, { x: 4.9, y: 1.2, w: 0.04, h: 3.2, fill: { color: colors.accent, transparency: 70 }, line: { type: 'none' } });
        const left = slide.content.leftColumn ?? [];
        const right = slide.content.rightColumn ?? [];
        left.forEach((item, i) => {
          pSlide.addText(`\u2022  ${item}`, { x: 0.4, y: 1.3 + i * 0.58, w: 4.2, h: 0.52, fontSize: 17, color: colors.text, fontFace: font, wrap: true });
        });
        right.forEach((item, i) => {
          pSlide.addText(`\u2022  ${item}`, { x: 5.2, y: 1.3 + i * 0.58, w: 4.2, h: 0.52, fontSize: 17, color: colors.text, fontFace: font, wrap: true });
        });
      } else {
        // bullets + content layouts
        pSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: colors.accent }, line: { type: 'none' } });
        pSlide.addText(slide.content.title, { x: 0.5, y: 0.2, w: 9.0, h: 0.8, fontSize: 28, bold: true, color: colors.title, fontFace: font });
        pSlide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.05, w: 1.2, h: 0.04, fill: { color: colors.accent }, line: { type: 'none' } });
        if (slide.content.body) {
          pSlide.addText(slide.content.body, { x: 0.6, y: 1.2, w: 8.8, h: 3.2, fontSize: 18, color: colors.text, fontFace: font, wrap: true, valign: 'top' });
        }
        const bullets = slide.content.bullets ?? [];
        bullets.forEach((b, i) => {
          pSlide.addText(`\u2022  ${b}`, { x: 0.6, y: 1.3 + i * 0.58, w: 8.8, h: 0.52, fontSize: 18, color: colors.text, fontFace: font, wrap: true });
        });
      }
    }

    await pptx.writeFile({ fileName: `${presentation.title.replace(/[^a-z0-9]/gi, '_')}.pptx` });
    return true;
  } catch (e) {
    console.warn('pptxgenjs unavailable, falling back to HTML export:', e);
    return false;
  }
}

export function importFromHTML(file: File): Promise<Presentation> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const match = text.match(/<!-- wingman-data: ([\s\S]+?) -->/);
      if (!match) return reject(new Error('No Wingman data found in this file.'));
      try {
        const presentation = JSON.parse(match[1].replace(/--\\>/g, '-->')) as Presentation;
        resolve(presentation);
      } catch {
        reject(new Error('Could not parse Wingman data.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsText(file);
  });
}

export function exportToHTML(presentation: Presentation): void {
  const html = generateHTMLPresentation(presentation);
  downloadBlob(html, `${presentation.title.replace(/[^a-z0-9]/gi, '_')}.html`, 'text/html');
}

export async function exportToPPTX(presentation: Presentation): Promise<void> {
  const success = await tryPPTXExport(presentation);
  if (!success) {
    // Fallback: HTML presentation
    const html = generateHTMLPresentation(presentation);
    downloadBlob(html, `${presentation.title.replace(/[^a-z0-9]/gi, '_')}.html`, 'text/html');
  }
}

export async function exportForKeynote(presentation: Presentation): Promise<void> {
  // Keynote imports .pptx natively - same file
  await exportToPPTX(presentation);
}

export async function exportForGoogleSlides(presentation: Presentation): Promise<void> {
  // Google Slides imports .pptx via Google Drive - same file
  await exportToPPTX(presentation);
}