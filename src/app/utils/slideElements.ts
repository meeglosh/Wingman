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

/**
 * Convert a slide's layout + content to a flat array of free-form SlideElements.
 * Called once when a slide is first opened in the editor.
 */
export function layoutToElements(slide: Slide, theme: SlideTheme): SlideElement[] {
  const { layout, content } = slide;

  // Text color override when there's a background photo
  const titleColor = slide.backgroundImageUrl ? '#FFFFFF' : theme.titleColor;
  const textColor = slide.backgroundImageUrl ? 'rgba(255,255,255,0.92)' : theme.textColor;
  const mutedColor = slide.backgroundImageUrl ? 'rgba(255,255,255,0.72)' : theme.mutedColor;

  switch (layout) {
    case 'title': {
      const elements: SlideElement[] = [
        el({ type: 'text', x: 80, y: 210, width: 1120, height: 160,
          content: content.title,
          fontSize: 72, fontWeight: 'bold', color: titleColor, textAlign: 'center' }, 1),
      ];
      if (content.subtitle) {
        elements.push(el({ type: 'text', x: 80, y: 400, width: 1120, height: 100,
          content: content.subtitle,
          fontSize: 28, color: mutedColor, textAlign: 'center' }, 2));
      }
      return elements;
    }

    case 'content': {
      const bullets = content.bullets ?? [];
      const bodyText = content.body
        ? content.body
        : bullets.map(b => `• ${b}`).join('\n\n');
      return [
        el({ type: 'text', x: 72, y: 200, width: 960, height: 100,
          content: content.title,
          fontSize: 60, fontWeight: 'bold', color: titleColor }, 1),
        el({ type: 'text', x: 72, y: 330, width: 960, height: 340,
          content: bodyText,
          fontSize: 26, color: textColor }, 2),
      ];
    }

    case 'bullets': {
      const bullets = content.bullets ?? [];
      const bodyText = bullets.map(b => `• ${b}`).join('\n\n');
      return [
        el({ type: 'text', x: 72, y: 200, width: 960, height: 100,
          content: content.title,
          fontSize: 60, fontWeight: 'bold', color: titleColor }, 1),
        el({ type: 'text', x: 72, y: 330, width: 960, height: 340,
          content: bodyText,
          fontSize: 26, color: textColor }, 2),
      ];
    }

    case 'quote': {
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
