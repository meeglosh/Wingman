import type { Presentation, Slide } from '../types/presentation';

const STORAGE_KEY = 'wingman_presentations';

export function loadPresentations(): Presentation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Presentation[];
  } catch {
    return [];
  }
}

export function savePresentation(presentation: Presentation): void {
  const all = loadPresentations();
  const idx = all.findIndex(p => p.id === presentation.id);
  const updated = { ...presentation, updatedAt: Date.now() };
  if (idx >= 0) {
    all[idx] = updated;
  } else {
    all.unshift(updated);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deletePresentation(id: string): void {
  const all = loadPresentations().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getPresentation(id: string): Presentation | null {
  return loadPresentations().find(p => p.id === id) ?? null;
}

export function createNewPresentation(title: string, themeId = 'obsidian'): Presentation {
  const now = Date.now();
  return {
    id: `pres_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    slides: [],
    themeId,
    createdAt: now,
    updatedAt: now,
  };
}

export function addSlideToPresentation(presentation: Presentation, slide: Slide): Presentation {
  return {
    ...presentation,
    slides: [...presentation.slides, slide],
    updatedAt: Date.now(),
  };
}

export function updateSlideInPresentation(presentation: Presentation, updatedSlide: Slide): Presentation {
  return {
    ...presentation,
    slides: presentation.slides.map(s => (s.id === updatedSlide.id ? updatedSlide : s)),
    updatedAt: Date.now(),
  };
}

export function deleteSlideFromPresentation(presentation: Presentation, slideId: string): Presentation {
  return {
    ...presentation,
    slides: presentation.slides.filter(s => s.id !== slideId),
    updatedAt: Date.now(),
  };
}

export function reorderSlides(presentation: Presentation, fromIndex: number, toIndex: number): Presentation {
  const slides = [...presentation.slides];
  const [moved] = slides.splice(fromIndex, 1);
  slides.splice(toIndex, 0, moved);
  return { ...presentation, slides, updatedAt: Date.now() };
}

export function generateSlideId(): string {
  return `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
