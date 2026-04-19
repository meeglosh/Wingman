import type { Slide, SlideElement, SlideTheme } from '../types/presentation';

export function generateElementId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function el(
  overrides: Omit<SlideElement, 'id' | 'zIndex'> & { zIndex?: number },
  zIndex: number,
): SlideElement {
  return { id: generateElementId(), zIndex, ...overrides };
}

// ─── Voice-slide styling ─────────────────────────────────────────────────────
// Values chosen to match LiveSlideView.tsx pixel-for-pixel at the native
// 1280×720 canvas. Anything rendered by voice-generated slides MUST come
// from here — the editable view has to be 1:1 with the live view.
const LIVE_FONT = '"Space Grotesk", "Inter", system-ui, sans-serif';
const LIVE_TITLE_COLOR = '#FFFFFF';
const LIVE_TITLE_SHADOW = '0 4px 32px rgba(0,0,0,0.6)';
const LIVE_BULLET_COLOR = 'rgba(255,255,255,0.92)';
const LIVE_BULLET_SHADOW = '0 2px 16px rgba(0,0,0,0.5)';
const LIVE_ACCENT_COLOR = '#A78BFA';

// Canvas geometry: LiveSlideView content box is at x=72, width capped at
// 960×(75% of 1280) minus 144 of horizontal padding → 816 wide inner area.
const CONTENT_X = 72;
const CONTENT_W = 816;

// Title: fontSize 64 (5vw at 1280), weight 800, lineHeight 1.08.
const TITLE_FONT_SIZE = 64;
const TITLE_LINE_HEIGHT = 1.08;
// Rough char-per-line estimate at fontSize 64 / weight 800 in ~816px width.
const TITLE_CHARS_PER_LINE = 20;

function titleHeightFor(title: string): number {
  const lines = Math.min(3, Math.max(1, Math.ceil((title?.length ?? 0) / TITLE_CHARS_PER_LINE)));
  return Math.ceil(TITLE_FONT_SIZE * TITLE_LINE_HEIGHT * lines) + 4;
}

// Accent rule: 48×3 purple bar.
const RULE_WIDTH = 48;
const RULE_HEIGHT = 3;
const RULE_GAP_TOP = 28;
const RULE_GAP_BOTTOM = 28;

// Bullets: fontSize 24, lineHeight 1.45. Dots are 7×7 circles, purple.
const BULLET_FONT_SIZE = 24;
const BULLET_LINE_HEIGHT = 1.45;
const BULLET_GAP = 14;
const DOT_SIZE = 7;
const DOT_TEXT_GAP = 14;
const BULLET_TEXT_X = CONTENT_X + DOT_SIZE + DOT_TEXT_GAP;
const BULLET_TEXT_W = CONTENT_W - DOT_SIZE - DOT_TEXT_GAP;
// Rough chars-per-line for fontSize 24 Space Grotesk in ~795px width.
// Deliberately conservative (under-estimates) so long bullets always fit.
const BULLET_CHARS_PER_LINE = 48;

function bulletLinesFor(text: string): number {
  // Respect explicit line breaks, then wrap each segment to estimated width.
  const segments = (text ?? '').split('\n');
  return segments.reduce((acc, seg) => {
    return acc + Math.max(1, Math.ceil(seg.length / BULLET_CHARS_PER_LINE));
  }, 0);
}

function bulletRowHeightFor(text: string): number {
  return Math.ceil(BULLET_FONT_SIZE * BULLET_LINE_HEIGHT * bulletLinesFor(text)) + 8;
}

/**
 * Build the title+rule+bullets element block for voice-generated slides.
 * Mirrors LiveSlideView's vertically-centered flex layout by computing the
 * total content height and positioning from center.
 */
function buildBulletsBlock(title: string, bullets: string[]): SlideElement[] {
  const bulletCount = bullets.length;
  const hasBullets = bulletCount > 0;
  const titleHeight = titleHeightFor(title);

  // Each bullet row takes the height its text requires (dynamic to prevent
  // long bullets from clipping — matching LiveSlideView's flex wrapping).
  const bulletHeights = bullets.map(bulletRowHeightFor);
  const bulletsAreaH = hasBullets
    ? bulletHeights.reduce((acc, h) => acc + h, 0) + (bulletCount - 1) * BULLET_GAP
    : 0;
  const blockHeight = titleHeight
    + (hasBullets ? RULE_GAP_TOP + RULE_HEIGHT + RULE_GAP_BOTTOM + bulletsAreaH : 0);

  const canvasH = 720;
  const top = Math.max(80, Math.floor((canvasH - blockHeight) / 2));

  const titleY = top;
  const ruleY = titleY + titleHeight + RULE_GAP_TOP;
  const bulletsY = ruleY + RULE_HEIGHT + RULE_GAP_BOTTOM;

  const elements: SlideElement[] = [
    el({
      type: 'text',
      x: CONTENT_X, y: titleY,
      width: CONTENT_W, height: titleHeight,
      content: title,
      fontSize: TITLE_FONT_SIZE,
      fontWeight: 'bold',
      color: LIVE_TITLE_COLOR,
      textAlign: 'left',
      fontFamily: LIVE_FONT,
      lineHeight: TITLE_LINE_HEIGHT,
      letterSpacing: '-0.02em',
      textShadow: LIVE_TITLE_SHADOW,
    }, 1),
  ];

  if (hasBullets) {
    elements.push(el({
      type: 'text',
      x: CONTENT_X, y: ruleY,
      width: RULE_WIDTH, height: RULE_HEIGHT,
      content: '',
      backgroundColor: LIVE_ACCENT_COLOR,
      borderRadius: 2,
    }, 2));

    let cursorY = bulletsY;
    bullets.forEach((text, i) => {
      const rowH = bulletHeights[i];
      // Dot — vertically aligned with the first line of bullet text (~11px down)
      elements.push(el({
        type: 'text',
        x: CONTENT_X, y: cursorY + 11,
        width: DOT_SIZE, height: DOT_SIZE,
        content: '',
        backgroundColor: LIVE_ACCENT_COLOR,
        borderRadius: 999,
      }, 3 + i * 2));
      // Text — tall enough for the wrapped text
      elements.push(el({
        type: 'text',
        x: BULLET_TEXT_X, y: cursorY,
        width: BULLET_TEXT_W, height: rowH,
        content: text,
        fontSize: BULLET_FONT_SIZE,
        fontWeight: 'normal',
        color: LIVE_BULLET_COLOR,
        textAlign: 'left',
        fontFamily: LIVE_FONT,
        lineHeight: BULLET_LINE_HEIGHT,
        textShadow: LIVE_BULLET_SHADOW,
      }, 4 + i * 2));
      cursorY += rowH + BULLET_GAP;
    });
  }

  return elements;
}

/**
 * Convert a slide's layout + content to a flat array of free-form SlideElements.
 * Called once when a slide is first opened in the editor.
 *
 * For voice-generated slides (`title`, `bullets`, `content`) we produce
 * elements that match LiveSlideView byte-for-byte so the editable view is 1:1
 * with what the speaker saw during live creation. Legacy layouts (`quote`,
 * `stats`, `two-column`) retain theme-based rendering for back-compat.
 */
export function layoutToElements(slide: Slide, theme: SlideTheme): SlideElement[] {
  const { layout, content } = slide;

  switch (layout) {
    case 'title':
    case 'content':
    case 'bullets': {
      // Voice-generated layouts. If bullets are present, include them.
      // Otherwise it's a title-only hero slide.
      const bullets = (content.bullets ?? []).filter(b => b.length > 0);
      return buildBulletsBlock(content.title, bullets);
    }

    // ── Legacy layouts (not produced by voice flow anymore) ──────────────────
    case 'quote': {
      const titleColor = slide.backgroundImageUrl ? '#FFFFFF' : theme.titleColor;
      const mutedColor = slide.backgroundImageUrl ? 'rgba(255,255,255,0.72)' : theme.mutedColor;
      const elements: SlideElement[] = [
        el({ type: 'text', x: 80, y: 180, width: 1120, height: 300,
          content: content.quote ?? '',
          fontSize: 38, fontStyle: 'italic', color: titleColor, textAlign: 'center' }, 1),
      ];
      if (content.attribution) {
        elements.push(el({ type: 'text', x: 80, y: 500, width: 1120, height: 60,
          content: `— ${content.attribution}`,
          fontSize: 22, color: mutedColor, textAlign: 'center' }, 2));
      }
      if (content.title) {
        elements.push(el({ type: 'text', x: 80, y: 580, width: 1120, height: 60,
          content: content.title,
          fontSize: 20, color: mutedColor, textAlign: 'center' }, 3));
      }
      return elements;
    }

    case 'stats': {
      const titleColor = slide.backgroundImageUrl ? '#FFFFFF' : theme.titleColor;
      const mutedColor = slide.backgroundImageUrl ? 'rgba(255,255,255,0.72)' : theme.mutedColor;
      const stats = content.stats ?? [];
      const cols = stats.length <= 2 ? 2 : stats.length <= 3 ? 3 : 4;
      const slotW = Math.floor((1136 - (cols - 1) * 24) / cols);
      const elements: SlideElement[] = [
        el({ type: 'text', x: 72, y: 50, width: 1136, height: 90,
          content: content.title,
          fontSize: 60, fontWeight: 'bold', color: titleColor }, 1),
      ];
      stats.slice(0, cols).forEach((stat, i) => {
        const sx = 72 + i * (slotW + 24);
        elements.push(
          el({ type: 'text', x: sx, y: 180, width: slotW, height: 100,
            content: stat.value,
            fontSize: 64, fontWeight: 'bold', color: theme.accentColor, textAlign: 'center' }, 2 + i * 2),
          el({ type: 'text', x: sx, y: 290, width: slotW, height: 60,
            content: stat.label,
            fontSize: 20, color: mutedColor, textAlign: 'center' }, 3 + i * 2),
        );
      });
      return elements;
    }

    case 'two-column': {
      const titleColor = slide.backgroundImageUrl ? '#FFFFFF' : theme.titleColor;
      const textColor = slide.backgroundImageUrl ? 'rgba(255,255,255,0.92)' : theme.textColor;
      const left = content.leftColumn ?? content.bullets?.slice(0, 3) ?? [];
      const right = content.rightColumn ?? content.bullets?.slice(3, 6) ?? [];
      return [
        el({ type: 'text', x: 72, y: 60, width: 1136, height: 90,
          content: content.title,
          fontSize: 60, fontWeight: 'bold', color: titleColor }, 1),
        el({ type: 'text', x: 72, y: 185, width: 540, height: 480,
          content: left.map(s => `• ${s}`).join('\n\n'),
          fontSize: 26, color: textColor }, 2),
        el({ type: 'text', x: 668, y: 185, width: 540, height: 480,
          content: right.map(s => `• ${s}`).join('\n\n'),
          fontSize: 26, color: textColor }, 3),
      ];
    }

    default:
      return [];
  }
}
