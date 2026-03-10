export type SlideLayout = 'title' | 'content' | 'bullets' | 'quote' | 'stats' | 'two-column';

export interface StatItem {
  value: string;
  label: string;
}

export interface SlideImage {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SlideContent {
  title: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  quote?: string;
  attribution?: string;
  stats?: StatItem[];
  leftColumn?: string[];
  rightColumn?: string[];
  images?: SlideImage[];
}

export interface Slide {
  id: string;
  layout: SlideLayout;
  content: SlideContent;
  transcript?: string;
  generatedAt: number;
  backgroundImageUrl?: string;
  backgroundImageAlt?: string;
  unsplashCredit?: { name: string; profileUrl: string };
}

export interface Presentation {
  id: string;
  title: string;
  slides: Slide[];
  themeId: string;
  fontFamily?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SlideSuggestion {
  topic: string;
  description: string;
  emoji: string;
}

export interface SlideGenerationResult {
  layout: SlideLayout;
  content: SlideContent;
  suggestions: SlideSuggestion[];
}

export interface SlideTheme {
  id: string;
  name: string;
  background: string;
  titleColor: string;
  textColor: string;
  accentColor: string;
  mutedColor: string;
  bulletColor: string;
  borderColor: string;
  logoUrl?: string;
  logoFilter?: string;
}