import { jsPDF } from 'jspdf'
import type { FontFamily, FontStyle, FontWeight } from '../types/print'

/**
 * Font metrics shared by the SVG preview and the PDF exporter.
 *
 * Layout code must be able to ask "how wide is this string at 11pt bold?" while
 * building geometry, long before a PDF exists. We keep one hidden jsPDF instance
 * purely as a metrics oracle: measuring through the same engine that will later
 * draw the text is what guarantees the preview and the PDF agree, and it is what
 * lets the layout engine auto-shrink text instead of letting it overflow.
 */

let measureDoc: jsPDF | null = null

function getMeasureDoc(): jsPDF {
  if (!measureDoc) measureDoc = new jsPDF({ unit: 'mm', format: 'a4' })
  return measureDoc
}

export const PDF_FONT: Record<FontFamily, string> = {
  sans: 'helvetica',
  serif: 'times',
  mono: 'courier',
}

export const CSS_FONT: Record<FontFamily, string> = {
  sans: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  serif: '"Times New Roman", Times, "Liberation Serif", serif',
  mono: '"Courier New", Courier, "Liberation Mono", monospace',
}

/**
 * Vertical metrics as a fraction of font size, from the Adobe AFM files for the
 * PDF base-14 fonts. Used to convert between "top of line", "baseline" and
 * "optical centre" in a way both renderers reproduce identically.
 */
export const FONT_METRICS: Record<FontFamily, { ascent: number; descent: number; capHeight: number }> = {
  sans: { ascent: 0.718, descent: 0.207, capHeight: 0.718 },
  serif: { ascent: 0.683, descent: 0.217, capHeight: 0.662 },
  mono: { ascent: 0.629, descent: 0.157, capHeight: 0.562 },
}

function styleKey(weight: FontWeight, style: FontStyle): string {
  if (weight === 'bold' && style === 'italic') return 'bolditalic'
  if (weight === 'bold') return 'bold'
  if (style === 'italic') return 'italic'
  return 'normal'
}

/** Width of `text` in millimetres. `size` is in points, as everywhere else. */
export function measureText(
  text: string,
  size: number,
  font: FontFamily = 'sans',
  weight: FontWeight = 'normal',
  style: FontStyle = 'normal',
  charSpace = 0,
): number {
  if (!text) return 0
  const doc = getMeasureDoc()
  doc.setFont(PDF_FONT[font], styleKey(weight, style))
  doc.setFontSize(size)
  // getTextWidth returns the advance width in the document unit (mm here).
  return doc.getTextWidth(text) + charSpace * Math.max(0, text.length - 1)
}

/** Points to millimetres. jsPDF sizes fonts in points regardless of doc units. */
export const pt2mm = (pt: number): number => (pt * 25.4) / 72
export const mm2pt = (mm: number): number => (mm * 72) / 25.4

/** Height of one line box, in mm, for a given point size. */
export function lineHeight(size: number, factor = 1.25): number {
  return pt2mm(size) * factor
}

/** Baseline y for text whose *top* should sit at `top`. */
export function baselineFromTop(top: number, size: number, font: FontFamily = 'sans'): number {
  return top + pt2mm(size) * FONT_METRICS[font].ascent
}

/** Baseline y that optically centres capitals/digits inside a box centred on `cy`. */
export function baselineFromMiddle(cy: number, size: number, font: FontFamily = 'sans'): number {
  return cy + (pt2mm(size) * FONT_METRICS[font].capHeight) / 2
}

/** Greedy word wrap. Returns the lines that fit inside `maxWidth`. */
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  font: FontFamily = 'sans',
  weight: FontWeight = 'normal',
  style: FontStyle = 'normal',
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (measureText(candidate, size, font, weight, style) <= maxWidth || !line) {
      line = candidate
    } else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * Largest point size (<= `startSize`, >= `minSize`) at which `text` fits inside
 * `maxWidth` on a single line. The layout engine calls this everywhere a string
 * of unknown length has to sit in a fixed box - it is the main reason generated
 * sheets never overflow regardless of the content drawn.
 */
export function fitTextSize(
  text: string,
  maxWidth: number,
  startSize: number,
  minSize = 5,
  font: FontFamily = 'sans',
  weight: FontWeight = 'normal',
  style: FontStyle = 'normal',
): number {
  let size = startSize
  while (size > minSize && measureText(text, size, font, weight, style) > maxWidth) {
    size -= 0.25
  }
  return Math.max(minSize, size)
}

/** Escapes the five XML entities so generated content is safe inside SVG. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
