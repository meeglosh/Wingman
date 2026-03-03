import type { SlideTheme } from '../types/presentation';

export const SLIDE_THEMES: SlideTheme[] = [
  {
    id: 'obsidian',
    name: 'Obsidian',
    background: 'linear-gradient(135deg, #0F0F1A 0%, #1A1228 100%)',
    titleColor: '#FFFFFF',
    textColor: '#E2E8F0',
    accentColor: '#7C3AED',
    mutedColor: '#94A3B8',
    bulletColor: '#A78BFA',
    borderColor: 'rgba(124,58,237,0.3)',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
    titleColor: '#0F172A',
    textColor: '#1E293B',
    accentColor: '#2563EB',
    mutedColor: '#64748B',
    bulletColor: '#3B82F6',
    borderColor: 'rgba(37,99,235,0.2)',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background: 'linear-gradient(135deg, #020617 0%, #0F172A 100%)',
    titleColor: '#FBBF24',
    textColor: '#F1F5F9',
    accentColor: '#FBBF24',
    mutedColor: '#94A3B8',
    bulletColor: '#FCD34D',
    borderColor: 'rgba(251,191,36,0.3)',
  },
  {
    id: 'ember',
    name: 'Ember',
    background: 'linear-gradient(135deg, #1A0A00 0%, #2D1200 100%)',
    titleColor: '#FFFFFF',
    textColor: '#FED7AA',
    accentColor: '#F97316',
    mutedColor: '#FB923C',
    bulletColor: '#FDBA74',
    borderColor: 'rgba(249,115,22,0.3)',
  },
  {
    id: 'forest',
    name: 'Forest',
    background: 'linear-gradient(135deg, #042F2E 0%, #064E3B 100%)',
    titleColor: '#ECFDF5',
    textColor: '#D1FAE5',
    accentColor: '#10B981',
    mutedColor: '#6EE7B7',
    bulletColor: '#34D399',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  {
    id: 'slate',
    name: 'Slate',
    background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
    titleColor: '#F8FAFC',
    textColor: '#E2E8F0',
    accentColor: '#38BDF8',
    mutedColor: '#94A3B8',
    bulletColor: '#7DD3FC',
    borderColor: 'rgba(56,189,248,0.3)',
  },
];

export function getTheme(id: string): SlideTheme {
  return SLIDE_THEMES.find(t => t.id === id) ?? SLIDE_THEMES[0];
}
