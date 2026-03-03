import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Presentation, Slide } from '../types/presentation';
import {
  loadPresentations,
  savePresentation,
  deletePresentation as deletePresentationFromStorage,
  addSlideToPresentation,
  updateSlideInPresentation,
  deleteSlideFromPresentation,
  reorderSlides,
  generateSlideId,
} from '../utils/storage';

interface PresentationContextValue {
  presentations: Presentation[];
  refreshPresentations: () => void;
  saveOrUpdate: (presentation: Presentation) => void;
  removePresentation: (id: string) => void;
  addSlide: (presentation: Presentation, slide: Omit<Slide, 'id'>) => Presentation;
  updateSlide: (presentation: Presentation, slide: Slide) => Presentation;
  removeSlide: (presentation: Presentation, slideId: string) => Presentation;
  moveSlide: (presentation: Presentation, from: number, to: number) => Presentation;
}

const PresentationContext = createContext<PresentationContextValue | null>(null);

export function PresentationProvider({ children }: { children: React.ReactNode }) {
  const [presentations, setPresentations] = useState<Presentation[]>([]);

  const refreshPresentations = useCallback(() => {
    setPresentations(loadPresentations());
  }, []);

  useEffect(() => {
    refreshPresentations();
  }, [refreshPresentations]);

  const saveOrUpdate = useCallback((presentation: Presentation) => {
    savePresentation(presentation);
    setPresentations(loadPresentations());
  }, []);

  const removePresentation = useCallback((id: string) => {
    deletePresentationFromStorage(id);
    setPresentations(prev => prev.filter(p => p.id !== id));
  }, []);

  const addSlide = useCallback((presentation: Presentation, slideData: Omit<Slide, 'id'>): Presentation => {
    const slide: Slide = { ...slideData, id: generateSlideId() };
    const updated = addSlideToPresentation(presentation, slide);
    savePresentation(updated);
    return updated;
  }, []);

  const updateSlide = useCallback((presentation: Presentation, slide: Slide): Presentation => {
    const updated = updateSlideInPresentation(presentation, slide);
    savePresentation(updated);
    return updated;
  }, []);

  const removeSlide = useCallback((presentation: Presentation, slideId: string): Presentation => {
    const updated = deleteSlideFromPresentation(presentation, slideId);
    savePresentation(updated);
    return updated;
  }, []);

  const moveSlide = useCallback((presentation: Presentation, from: number, to: number): Presentation => {
    const updated = reorderSlides(presentation, from, to);
    savePresentation(updated);
    return updated;
  }, []);

  return (
    <PresentationContext.Provider value={{
      presentations,
      refreshPresentations,
      saveOrUpdate,
      removePresentation,
      addSlide,
      updateSlide,
      removeSlide,
      moveSlide,
    }}>
      {children}
    </PresentationContext.Provider>
  );
}

export function usePresentations() {
  const ctx = useContext(PresentationContext);
  if (!ctx) throw new Error('usePresentations must be used within PresentationProvider');
  return ctx;
}
