export type SlideLayout = 'title' | 'content' | 'bullets' | 'quote' | 'stats' | 'two-column';

export type ElementType = 'text' | 'image' | 'chart';

export type ChartType =
  | 'bar' | 'bar-horizontal' | 'bar-grouped' | 'bar-stacked'
  | 'line' | 'area' | 'area-stacked'
  | 'pie' | 'donut'
  | 'scatter' | 'radar' | 'funnel';

export interface ChartSeries {
  name: string;
  color?: string;
}

export interface ChartData {
  type: ChartType;
  title?: string;
  labels: string[];
  series: ChartSeries[];
  values: number[][];      // values[seriesIndex][labelIndex]
  showLegend?: boolean;
  showGrid?: boolean;
  showAxes?: boolean;
  palette?: string;
}

export interface SlideElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  // Text
  content?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  textAlign?: 'left' | 'center' | 'right';
  // Image
  src?: string;
  alt?: string;
  unsplashCredit?: { name: string; profileUrl: string };
  borderRadius?: number;
  dropShadow?: string;
  strokeWidth?: number;
  strokeColor?: string;
  rotation?: number;
  // Chart
  chartData?: ChartData;
}

export interface StatItem {
  value: string;
  label: string;
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
}

export interface Slide {
  id: string;
  layout: SlideLayout;
  content: SlideContent;
  elements?: SlideElement[];
  transcript?: string;
  generatedAt: number;
  backgroundImageUrl?: string;
  backgroundImageAlt?: string;
  unsplashCredit?: { name: string; profileUrl: string };
  backgroundColor?: string;
  backgroundGradient?: { angle: number; from: string; to: string };
  backgroundMode?: 'image' | 'color' | 'gradient';
  backgroundOverlayOpacity?: number; // 0–1, default 0.45
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
}