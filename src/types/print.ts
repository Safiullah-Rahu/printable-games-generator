/**
 * PrintDoc — the intermediate representation (IR) for every printable page.
 *
 * WHY AN IR: the on-screen preview and the exported PDF must be pixel-identical.
 * Rather than screenshotting HTML into a PDF (blurry, huge files, unpredictable
 * page breaks), every generator emits this geometric document. Two renderers
 * consume it:
 *   - src/components/DocPreview.tsx  -> SVG (screen preview + browser printing)
 *   - src/pdf/exportPdf.ts           -> jsPDF vector output (crisp, small, exact)
 *
 * UNITS: every coordinate is in millimetres, origin at the top-left of the page.
 * TEXT: `y` is always the *alphabetic baseline*. Helpers in engines/layout/doc.ts
 * convert from "top of line" / "vertical centre" using shared font metrics so the
 * two renderers never disagree.
 */

export type FontFamily = 'sans' | 'serif' | 'mono'
export type FontWeight = 'normal' | 'bold'
export type FontStyle = 'normal' | 'italic'
export type TextAlign = 'left' | 'center' | 'right'

export interface TextElement {
  kind: 'text'
  x: number
  y: number
  text: string
  size: number
  font?: FontFamily
  weight?: FontWeight
  style?: FontStyle
  align?: TextAlign
  color?: string
  /** Character spacing in mm, added after every glyph. */
  charSpace?: number
  /** Rotation in degrees, counter-clockwise, about (x, y). */
  rotate?: number
  /** Advisory width used by the doc validator to flag overflow. */
  maxWidth?: number
  /** Force the preview to match the PDF's measured advance width exactly. */
  exactWidth?: boolean
  opacity?: number
}

export interface RectElement {
  kind: 'rect'
  x: number
  y: number
  w: number
  h: number
  fill?: string
  stroke?: string
  lineWidth?: number
  /** Corner radius in mm. */
  radius?: number
  dash?: number[]
  opacity?: number
}

export interface LineElement {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke?: string
  lineWidth?: number
  dash?: number[]
  cap?: 'butt' | 'round' | 'square'
  opacity?: number
}

export interface CircleElement {
  kind: 'circle'
  cx: number
  cy: number
  r: number
  fill?: string
  stroke?: string
  lineWidth?: number
  dash?: number[]
  opacity?: number
}

export interface PolygonElement {
  kind: 'polygon'
  points: Array<[number, number]>
  fill?: string
  stroke?: string
  lineWidth?: number
  closed?: boolean
  opacity?: number
}

export type PathCmd =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: 'Z' }

export interface PathElement {
  kind: 'path'
  d: PathCmd[]
  fill?: string
  stroke?: string
  lineWidth?: number
  dash?: number[]
  opacity?: number
}

export type PrintElement =
  | TextElement
  | RectElement
  | LineElement
  | CircleElement
  | PolygonElement
  | PathElement

export interface PrintPage {
  /** Human label shown under the preview thumbnail, e.g. "Answer Key". */
  label: string
  elements: PrintElement[]
  /** Pages marked `answerKey` are dropped when the user hides the answer key. */
  role?: 'game' | 'instructions' | 'answerKey' | 'cards' | 'board'
}

export interface PrintDoc {
  /** Page box in mm. */
  width: number
  height: number
  margin: { top: number; right: number; bottom: number; left: number }
  pages: PrintPage[]
  title: string
}

/** mm dimensions of the supported paper stocks, portrait orientation. */
export const PAGE_DIMENSIONS = {
  a4: { width: 210, height: 297, label: 'A4 (210 × 297 mm)' },
  letter: { width: 215.9, height: 279.4, label: 'US Letter (8.5 × 11 in)' },
} as const
