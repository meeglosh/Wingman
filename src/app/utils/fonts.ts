export interface SlideFont {
  id: string;
  name: string;
  family: string;    // CSS font-family value
  style: string;     // one-word descriptor shown in picker
  serif: boolean;
}

export const SLIDE_FONTS: SlideFont[] = [
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    family: '"Space Grotesk", "Inter", system-ui, sans-serif',
    style: 'Modern',
    serif: false,
  },
  {
    id: 'inter',
    name: 'Inter',
    family: '"Inter", system-ui, sans-serif',
    style: 'Clean',
    serif: false,
  },
  {
    id: 'montserrat',
    name: 'Montserrat',
    family: '"Montserrat", "Inter", sans-serif',
    style: 'Bold',
    serif: false,
  },
  {
    id: 'raleway',
    name: 'Raleway',
    family: '"Raleway", "Inter", sans-serif',
    style: 'Stylish',
    serif: false,
  },
  {
    id: 'sora',
    name: 'Sora',
    family: '"Sora", "Inter", sans-serif',
    style: 'Rounded',
    serif: false,
  },
  {
    id: 'bricolage',
    name: 'Bricolage Grotesque',
    family: '"Bricolage Grotesque", "Inter", sans-serif',
    style: 'Expressive',
    serif: false,
  },
  {
    id: 'playfair',
    name: 'Playfair Display',
    family: '"Playfair Display", Georgia, serif',
    style: 'Elegant',
    serif: true,
  },
  {
    id: 'dm-serif',
    name: 'DM Serif Display',
    family: '"DM Serif Display", Georgia, serif',
    style: 'Editorial',
    serif: true,
  },
];

export const DEFAULT_FONT_ID = 'space-grotesk';

export function getFont(id?: string): SlideFont {
  return SLIDE_FONTS.find(f => f.id === id) ?? SLIDE_FONTS[0];
}
