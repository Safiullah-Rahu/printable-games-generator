import type { FontFamily, ThemeId } from '../../types'

/**
 * Visual themes.
 *
 * Themes only ever change colour, typeface and decorative motif - never
 * geometry. That separation is deliberate: a generator can be written once and
 * look right in all ten themes, and `inkSaver` can strip the decoration without
 * any generator knowing it happened.
 *
 * Colours are chosen to stay legible on a monochrome laser printer: every
 * accent has enough tonal contrast against white that it still reads as a
 * distinct grey when the colour is dropped.
 */

export type MotifId =
  | 'none' | 'apple' | 'sparkle' | 'star' | 'compass'
  | 'paw' | 'wave' | 'crown' | 'ball' | 'leaf'

export interface GameTheme {
  id: ThemeId
  name: string
  description: string
  colors: {
    ink: string
    muted: string
    accent: string
    accentSoft: string
    band: string
    bandText: string
    panel: string
    panelBorder: string
    grid: string
    gridAlt: string
    highlight: string
    rule: string
  }
  fonts: { heading: FontFamily; body: FontFamily; grid: FontFamily }
  motif: MotifId
  decorative: boolean
}

const THEME_LIST: GameTheme[] = [
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Clean black-and-white, lowest ink use.',
    colors: {
      ink: '#111827', muted: '#6b7280', accent: '#111827', accentSoft: '#f3f4f6',
      band: '#ffffff', bandText: '#111827', panel: '#fafafa', panelBorder: '#d1d5db',
      grid: '#374151', gridAlt: '#f9fafb', highlight: '#e5e7eb', rule: '#9ca3af',
    },
    fonts: { heading: 'sans', body: 'sans', grid: 'sans' },
    motif: 'none',
    decorative: false,
  },
  {
    id: 'classroom',
    name: 'Classroom',
    description: 'Friendly school-worksheet look in warm red.',
    colors: {
      ink: '#1f2937', muted: '#6b7280', accent: '#b91c1c', accentSoft: '#fee2e2',
      band: '#b91c1c', bandText: '#ffffff', panel: '#fef2f2', panelBorder: '#fca5a5',
      grid: '#334155', gridAlt: '#fff7ed', highlight: '#fecaca', rule: '#f87171',
    },
    fonts: { heading: 'sans', body: 'sans', grid: 'sans' },
    motif: 'apple',
    decorative: true,
  },
  {
    id: 'fun',
    name: 'Fun',
    description: 'Bright and playful, for younger learners.',
    colors: {
      ink: '#1e1b4b', muted: '#6d28d9', accent: '#7c3aed', accentSoft: '#ede9fe',
      band: '#7c3aed', bandText: '#ffffff', panel: '#f5f3ff', panelBorder: '#c4b5fd',
      grid: '#4c1d95', gridAlt: '#faf5ff', highlight: '#ddd6fe', rule: '#a78bfa',
    },
    fonts: { heading: 'sans', body: 'sans', grid: 'sans' },
    motif: 'sparkle',
    decorative: true,
  },
  {
    id: 'space',
    name: 'Space',
    description: 'Deep navy with starfield accents.',
    colors: {
      ink: '#0f172a', muted: '#475569', accent: '#1e3a8a', accentSoft: '#dbeafe',
      band: '#1e3a8a', bandText: '#ffffff', panel: '#eff6ff', panelBorder: '#93c5fd',
      grid: '#1e293b', gridAlt: '#f1f5f9', highlight: '#bfdbfe', rule: '#60a5fa',
    },
    fonts: { heading: 'sans', body: 'sans', grid: 'mono' },
    motif: 'star',
    decorative: true,
  },
  {
    id: 'adventure',
    name: 'Adventure',
    description: 'Expedition map styling in earthy amber.',
    colors: {
      ink: '#292524', muted: '#78716c', accent: '#b45309', accentSoft: '#fef3c7',
      band: '#b45309', bandText: '#ffffff', panel: '#fffbeb', panelBorder: '#fcd34d',
      grid: '#57534e', gridAlt: '#fefce8', highlight: '#fde68a', rule: '#d97706',
    },
    fonts: { heading: 'serif', body: 'sans', grid: 'sans' },
    motif: 'compass',
    decorative: true,
  },
  {
    id: 'animals',
    name: 'Animals',
    description: 'Warm green wildlife styling with paw prints.',
    colors: {
      ink: '#14532d', muted: '#4d7c0f', accent: '#15803d', accentSoft: '#dcfce7',
      band: '#15803d', bandText: '#ffffff', panel: '#f0fdf4', panelBorder: '#86efac',
      grid: '#166534', gridAlt: '#f7fee7', highlight: '#bbf7d0', rule: '#4ade80',
    },
    fonts: { heading: 'sans', body: 'sans', grid: 'sans' },
    motif: 'paw',
    decorative: true,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool teal with a rolling wave motif.',
    colors: {
      ink: '#083344', muted: '#0e7490', accent: '#0e7490', accentSoft: '#cffafe',
      band: '#0e7490', bandText: '#ffffff', panel: '#ecfeff', panelBorder: '#67e8f9',
      grid: '#155e75', gridAlt: '#f0fdfa', highlight: '#a5f3fc', rule: '#22d3ee',
    },
    fonts: { heading: 'sans', body: 'sans', grid: 'sans' },
    motif: 'wave',
    decorative: true,
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    description: 'Storybook serif with a royal crown motif.',
    colors: {
      ink: '#3b0764', muted: '#7e22ce', accent: '#6b21a8', accentSoft: '#f3e8ff',
      band: '#6b21a8', bandText: '#ffffff', panel: '#faf5ff', panelBorder: '#d8b4fe',
      grid: '#581c87', gridAlt: '#fdf4ff', highlight: '#e9d5ff', rule: '#c084fc',
    },
    fonts: { heading: 'serif', body: 'serif', grid: 'serif' },
    motif: 'crown',
    decorative: true,
  },
  {
    id: 'sports',
    name: 'Sports',
    description: 'High-energy orange scoreboard styling.',
    colors: {
      ink: '#1c1917', muted: '#57534e', accent: '#ea580c', accentSoft: '#ffedd5',
      band: '#ea580c', bandText: '#ffffff', panel: '#fff7ed', panelBorder: '#fdba74',
      grid: '#292524', gridAlt: '#fffbeb', highlight: '#fed7aa', rule: '#fb923c',
    },
    fonts: { heading: 'sans', body: 'sans', grid: 'sans' },
    motif: 'ball',
    decorative: true,
  },
  {
    id: 'seasonal',
    name: 'Seasonal',
    description: 'Festive evergreen with a leaf motif.',
    colors: {
      ink: '#134e4a', muted: '#0f766e', accent: '#047857', accentSoft: '#d1fae5',
      band: '#047857', bandText: '#ffffff', panel: '#ecfdf5', panelBorder: '#6ee7b7',
      grid: '#115e59', gridAlt: '#f0fdfa', highlight: '#a7f3d0', rule: '#34d399',
    },
    fonts: { heading: 'serif', body: 'sans', grid: 'sans' },
    motif: 'leaf',
    decorative: true,
  },
]

export const THEMES: Record<ThemeId, GameTheme> = Object.fromEntries(
  THEME_LIST.map((t) => [t.id, t]),
) as Record<ThemeId, GameTheme>

export const THEME_OPTIONS = THEME_LIST.map((t) => ({
  id: t.id,
  label: t.name,
  description: t.description,
  swatch: t.colors.accent,
}))

/**
 * Ink-saver variant: keeps every hue relationship but drops solid fills to
 * white and softens tints, cutting toner use dramatically while leaving the
 * sheet identical in structure.
 */
export function inkSaved(theme: GameTheme): GameTheme {
  return {
    ...theme,
    colors: {
      ...theme.colors,
      band: '#ffffff',
      bandText: theme.colors.accent,
      panel: '#ffffff',
      accentSoft: '#ffffff',
      gridAlt: '#ffffff',
      highlight: '#f1f5f9',
    },
    decorative: false,
  }
}

export function resolveTheme(id: ThemeId, inkSaver: boolean): GameTheme {
  const theme = THEMES[id] ?? THEMES.minimal
  return inkSaver ? inkSaved(theme) : theme
}
