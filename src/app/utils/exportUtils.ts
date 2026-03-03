import type { Presentation, Slide } from '../types/presentation';
import { getTheme } from './themes';

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

// ─── HTML export fallback ────────────────────────────────────────────────────
function generateHTMLPresentation(presentation: Presentation): string {
  const theme = getTheme(presentation.themeId);

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
    } else {
      const bulletsHTML = (content.bullets ?? []).map(b =>
        `<div class="bullet-row"><div class="bullet-dot"></div><p>${escHtml(b)}</p></div>`
      ).join('');
      innerHTML = `
        <div class="top-bar"></div>
        <div class="slide-header"><h2>${escHtml(content.title)}</h2><div class="header-line"></div></div>
        <div class="bullets">${bulletsHTML}</div>`;
    }

    return `
      <div class="slide ${i === 0 ? 'active' : ''}" id="slide-${i}" data-index="${i}" style="background: ${theme.background}">
        ${innerHTML}
        <div class="slide-number">${i + 1} / ${presentation.slides.length}</div>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(presentation.title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; font-family: 'Segoe UI', Inter, system-ui, sans-serif; overflow: hidden; }
  .presentation { width: 100vw; height: 100vh; position: relative; }
  .slide {
    position: absolute; inset: 0;
    display: none; flex-direction: column;
    width: 100%; height: 100%;
  }
  .slide.active { display: flex; }
  .top-bar, .title-bar { height: 6px; background: #${colorsFromTheme(presentation.themeId).accent}; width: 100%; flex-shrink: 0; }
  .title-content { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 80px; text-align: center; }
  .title-content h1 { color: #${colorsFromTheme(presentation.themeId).title}; font-size: clamp(32px, 5vw, 72px); font-weight: 800; line-height: 1.1; }
  .subtitle { color: #${colorsFromTheme(presentation.themeId).muted}; font-size: clamp(16px, 2vw, 28px); margin-top: 24px; }
  .accent-line { width: 60px; height: 4px; background: #${colorsFromTheme(presentation.themeId).accent}; border-radius: 2px; margin-bottom: 32px; }
  .slide-header { padding: 32px 60px 0; }
  .slide-header h2 { color: #${colorsFromTheme(presentation.themeId).title}; font-size: clamp(24px, 3.5vw, 52px); font-weight: 700; }
  .header-line { width: 56px; height: 3px; background: #${colorsFromTheme(presentation.themeId).accent}; border-radius: 2px; margin-top: 8px; }
  .bullets { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 16px; padding: 24px 60px; }
  .bullet-row { display: flex; align-items: flex-start; gap: 16px; }
  .bullet-dot { width: 10px; height: 10px; border-radius: 50%; background: #${colorsFromTheme(presentation.themeId).accent}; flex-shrink: 0; margin-top: 8px; }
  .bullet-row p { color: #${colorsFromTheme(presentation.themeId).text}; font-size: clamp(16px, 2.2vw, 28px); line-height: 1.5; }
  .stats-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; padding: 24px 60px; }
  .stat-box { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .stat-value { font-size: clamp(28px, 4vw, 56px); font-weight: 800; color: #${colorsFromTheme(presentation.themeId).accent}; }
  .stat-label { color: #${colorsFromTheme(presentation.themeId).muted}; font-size: clamp(12px, 1.5vw, 20px); margin-top: 8px; }
  .quote-bar { width: 6px; background: #${colorsFromTheme(presentation.themeId).accent}; position: absolute; top: 10%; bottom: 10%; left: 48px; border-radius: 3px; }
  .quote-content { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 120px; text-align: center; }
  .big-quote { font-size: 120px; line-height: 1; color: #${colorsFromTheme(presentation.themeId).accent}; font-family: Georgia; opacity: 0.6; margin-bottom: -24px; }
  blockquote { color: #${colorsFromTheme(presentation.themeId).title}; font-size: clamp(20px, 3vw, 38px); font-style: italic; line-height: 1.4; margin-bottom: 24px; }
  .attribution { color: #${colorsFromTheme(presentation.themeId).muted}; font-size: clamp(14px, 2vw, 22px); font-weight: 600; }
  .quote-title { color: #${colorsFromTheme(presentation.themeId).muted}; font-size: 18px; margin-top: 24px; }
  .slide-number { position: absolute; bottom: 16px; right: 24px; color: rgba(255,255,255,0.25); font-size: 12px; }
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

// ─── Try pptxgenjs, fall back to HTML ────────────────────────────────────────
async function tryPPTXExport(presentation: Presentation): Promise<boolean> {
  try {
    const pptxgen = (await import('pptxgenjs')).default;
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_WIDE';
    const theme = getTheme(presentation.themeId);
    const colors = colorsFromTheme(presentation.themeId);

    for (const slide of presentation.slides) {
      const pSlide = pptx.addSlide();
      pSlide.background = { color: colors.bg };

      if (slide.layout === 'title') {
        pSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 3.8, w: '100%', h: 0.06, fill: { color: colors.accent }, line: { color: colors.accent } });
        pSlide.addText(slide.content.title, { x: 0.8, y: 1.0, w: 8.4, h: 2.0, fontSize: 44, bold: true, color: colors.title, align: 'center', fontFace: 'Calibri' });
        if (slide.content.subtitle) {
          pSlide.addText(slide.content.subtitle, { x: 0.8, y: 3.2, w: 8.4, h: 1.0, fontSize: 20, color: colors.muted, align: 'center', fontFace: 'Calibri' });
        }
      } else if (slide.layout === 'quote') {
        pSlide.addShape(pptx.ShapeType.rect, { x: 0.3, y: 0.8, w: 0.08, h: 3.5, fill: { color: colors.accent }, line: { color: colors.accent } });
        pSlide.addText(`"${slide.content.quote ?? ''}"`, { x: 0.6, y: 1.0, w: 8.4, h: 2.5, fontSize: 24, italic: true, color: colors.title, fontFace: 'Georgia', valign: 'middle' });
        if (slide.content.attribution) {
          pSlide.addText(`${slide.content.attribution}`, { x: 0.6, y: 3.7, w: 8.4, h: 0.5, fontSize: 16, color: colors.muted, fontFace: 'Calibri' });
        }
      } else if (slide.layout === 'stats') {
        pSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: colors.accent }, line: { color: colors.accent } });
        pSlide.addText(slide.content.title, { x: 0.5, y: 0.2, w: 9.0, h: 0.8, fontSize: 28, bold: true, color: colors.title, fontFace: 'Calibri' });
        const stats = slide.content.stats ?? [];
        const n = Math.min(stats.length, 4);
        const cellW = 10 / (n || 1);
        stats.slice(0, n).forEach((stat, i) => {
          pSlide.addText(stat.value, { x: i * cellW, y: 1.8, w: cellW, h: 1.0, fontSize: 36, bold: true, color: colors.accent, align: 'center', fontFace: 'Calibri' });
          pSlide.addText(stat.label, { x: i * cellW, y: 2.9, w: cellW, h: 0.6, fontSize: 14, color: colors.muted, align: 'center', fontFace: 'Calibri' });
        });
      } else {
        pSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.08, fill: { color: colors.accent }, line: { color: colors.accent } });
        pSlide.addText(slide.content.title, { x: 0.5, y: 0.2, w: 9.0, h: 0.8, fontSize: 28, bold: true, color: colors.title, fontFace: 'Calibri' });
        const bullets = slide.content.bullets ?? [];
        bullets.forEach((b, i) => {
          pSlide.addText(`• ${b}`, { x: 0.6, y: 1.3 + i * 0.55, w: 8.8, h: 0.5, fontSize: 18, color: colors.text, fontFace: 'Calibri' });
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