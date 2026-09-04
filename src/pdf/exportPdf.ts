import { jsPDF } from 'jspdf'
import type { GeneratedGame, PathCmd, PrintDoc, PrintElement } from '../types'
import { PDF_FONT } from '../utils/text'
import { slugify } from '../utils/misc'

/**
 * PrintDoc -> PDF.
 *
 * Everything is drawn as vectors and real text: the output is a few tens of
 * kilobytes, stays sharp at any zoom, and remains selectable and searchable.
 * The alternative most generators reach for - screenshotting the preview into
 * an image - would produce blurry multi-megabyte files, so the whole IR exists
 * to avoid it.
 *
 * The document units are millimetres, matching the IR exactly, so no coordinate
 * conversion happens anywhere in this file. Font sizes stay in points because
 * that is what jsPDF (and typography) uses.
 */

interface Rgb {
  r: number
  g: number
  b: number
}

function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '')
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean
  return {
    r: parseInt(full.slice(0, 2), 16) || 0,
    g: parseInt(full.slice(2, 4), 16) || 0,
    b: parseInt(full.slice(4, 6), 16) || 0,
  }
}

function styleFlag(fill?: string, stroke?: string): 'F' | 'S' | 'FD' | null {
  if (fill && stroke) return 'FD'
  if (fill) return 'F'
  if (stroke) return 'S'
  return null
}

/**
 * Converts a PathCmd list into the relative-delta arrays jsPDF's `lines`
 * expects: [dx, dy] for a straight segment, [dx1, dy1, dx2, dy2, dx, dy] for a
 * cubic. Each `M` starts a new subpath, which is emitted separately.
 */
function emitPath(doc: jsPDF, cmds: PathCmd[], style: 'F' | 'S' | 'FD'): void {
  let startX = 0
  let startY = 0
  let curX = 0
  let curY = 0
  let segments: number[][] = []
  let closed = false
  let open = false

  const flush = (): void => {
    if (open && segments.length > 0) {
      doc.lines(segments, startX, startY, [1, 1], style, closed)
    }
    segments = []
    closed = false
  }

  for (const cmd of cmds) {
    if (cmd.t === 'M') {
      flush()
      startX = cmd.x
      startY = cmd.y
      curX = cmd.x
      curY = cmd.y
      open = true
    } else if (cmd.t === 'L') {
      segments.push([cmd.x - curX, cmd.y - curY])
      curX = cmd.x
      curY = cmd.y
    } else if (cmd.t === 'C') {
      segments.push([
        cmd.x1 - curX, cmd.y1 - curY,
        cmd.x2 - curX, cmd.y2 - curY,
        cmd.x - curX, cmd.y - curY,
      ])
      curX = cmd.x
      curY = cmd.y
    } else {
      closed = true
    }
  }
  flush()
}

function applyOpacity(doc: jsPDF, opacity: number | undefined): boolean {
  if (opacity === undefined || opacity >= 1) return false
  // jsPDF exposes graphics state through a constructor hung off the instance.
  const GState = (doc as unknown as { GState: new (o: Record<string, number>) => unknown }).GState
  ;(doc as unknown as { setGState: (s: unknown) => void }).setGState(
    new GState({ opacity, 'stroke-opacity': opacity }),
  )
  return true
}

function resetOpacity(doc: jsPDF): void {
  const GState = (doc as unknown as { GState: new (o: Record<string, number>) => unknown }).GState
  ;(doc as unknown as { setGState: (s: unknown) => void }).setGState(
    new GState({ opacity: 1, 'stroke-opacity': 1 }),
  )
}

function drawElement(doc: jsPDF, el: PrintElement): void {
  const usedOpacity = applyOpacity(doc, 'opacity' in el ? el.opacity : undefined)

  switch (el.kind) {
    case 'rect': {
      const style = styleFlag(el.fill, el.stroke)
      if (!style) break
      if (el.fill) {
        const { r, g, b } = hexToRgb(el.fill)
        doc.setFillColor(r, g, b)
      }
      if (el.stroke) {
        const { r, g, b } = hexToRgb(el.stroke)
        doc.setDrawColor(r, g, b)
        doc.setLineWidth(el.lineWidth ?? 0.3)
      }
      doc.setLineDashPattern(el.dash ?? [], 0)
      if (el.radius && el.radius > 0) {
        doc.roundedRect(el.x, el.y, el.w, el.h, el.radius, el.radius, style)
      } else {
        doc.rect(el.x, el.y, el.w, el.h, style)
      }
      doc.setLineDashPattern([], 0)
      break
    }

    case 'line': {
      const { r, g, b } = hexToRgb(el.stroke ?? '#000000')
      doc.setDrawColor(r, g, b)
      doc.setLineWidth(el.lineWidth ?? 0.3)
      doc.setLineDashPattern(el.dash ?? [], 0)
      if (el.cap) doc.setLineCap(el.cap)
      doc.line(el.x1, el.y1, el.x2, el.y2)
      doc.setLineCap('butt')
      doc.setLineDashPattern([], 0)
      break
    }

    case 'circle': {
      const style = styleFlag(el.fill, el.stroke)
      if (!style) break
      if (el.fill) {
        const { r, g, b } = hexToRgb(el.fill)
        doc.setFillColor(r, g, b)
      }
      if (el.stroke) {
        const { r, g, b } = hexToRgb(el.stroke)
        doc.setDrawColor(r, g, b)
        doc.setLineWidth(el.lineWidth ?? 0.3)
      }
      doc.setLineDashPattern(el.dash ?? [], 0)
      doc.circle(el.cx, el.cy, el.r, style)
      doc.setLineDashPattern([], 0)
      break
    }

    case 'polygon': {
      const style = styleFlag(el.fill, el.stroke)
      if (!style || el.points.length < 2) break
      if (el.fill) {
        const { r, g, b } = hexToRgb(el.fill)
        doc.setFillColor(r, g, b)
      }
      if (el.stroke) {
        const { r, g, b } = hexToRgb(el.stroke)
        doc.setDrawColor(r, g, b)
        doc.setLineWidth(el.lineWidth ?? 0.3)
      }
      const [firstX, firstY] = el.points[0]
      const deltas: number[][] = []
      let prevX = firstX
      let prevY = firstY
      for (let i = 1; i < el.points.length; i++) {
        const [x, y] = el.points[i]
        deltas.push([x - prevX, y - prevY])
        prevX = x
        prevY = y
      }
      doc.lines(deltas, firstX, firstY, [1, 1], style, el.closed !== false)
      break
    }

    case 'path': {
      const style = styleFlag(el.fill, el.stroke)
      if (!style) break
      if (el.fill) {
        const { r, g, b } = hexToRgb(el.fill)
        doc.setFillColor(r, g, b)
      }
      if (el.stroke) {
        const { r, g, b } = hexToRgb(el.stroke)
        doc.setDrawColor(r, g, b)
        doc.setLineWidth(el.lineWidth ?? 0.3)
      }
      doc.setLineDashPattern(el.dash ?? [], 0)
      emitPath(doc, el.d, style)
      doc.setLineDashPattern([], 0)
      break
    }

    case 'text': {
      const { r, g, b } = hexToRgb(el.color ?? '#111827')
      doc.setTextColor(r, g, b)
      const weight = el.weight === 'bold'
      const italic = el.style === 'italic'
      const fontStyle = weight && italic ? 'bolditalic' : weight ? 'bold' : italic ? 'italic' : 'normal'
      doc.setFont(PDF_FONT[el.font ?? 'sans'], fontStyle)
      doc.setFontSize(el.size)
      doc.text(el.text, el.x, el.y, {
        align: el.align ?? 'left',
        baseline: 'alphabetic',
        angle: el.rotate ? el.rotate : undefined,
        charSpace: el.charSpace ?? 0,
      })
      break
    }
  }

  if (usedOpacity) resetOpacity(doc)
}

export interface PdfOptions {
  /** Drop pages the user chose to hide (answer keys). */
  includeAnswerKey?: boolean
  title?: string
  subject?: string
  keywords?: string
}

/** Renders a PrintDoc into a jsPDF instance. */
export function renderPdf(doc: PrintDoc, options: PdfOptions = {}): jsPDF {
  const pages = options.includeAnswerKey === false
    ? doc.pages.filter((p) => p.role !== 'answerKey')
    : doc.pages

  const landscape = doc.width > doc.height
  const pdf = new jsPDF({
    unit: 'mm',
    format: [doc.width, doc.height],
    orientation: landscape ? 'landscape' : 'portrait',
    compress: true,
  })

  pdf.setProperties({
    title: options.title ?? doc.title,
    subject: options.subject ?? 'Printable educational game',
    creator: 'Printable Games Generator',
    author: 'Printable Games Generator',
    keywords: options.keywords ?? 'printable, worksheet, game, education',
  })

  pages.forEach((page, index) => {
    if (index > 0) pdf.addPage([doc.width, doc.height], landscape ? 'landscape' : 'portrait')
    pdf.setLineJoin('round')
    for (const element of page.elements) {
      drawElement(pdf, element)
    }
  })

  return pdf
}

export function pdfFilename(game: GeneratedGame): string {
  return `${slugify(game.meta.title)}-${slugify(game.config.seed)}.pdf`
}

/** Triggers a browser download of the finished PDF. */
export function downloadPdf(game: GeneratedGame, options: PdfOptions = {}): void {
  const pdf = renderPdf(game.doc, {
    title: game.meta.title,
    subject: `${game.generatorName} - ${game.config.subject}`,
    keywords: [game.generatorName, game.config.subject, game.config.grade, game.config.difficulty].join(', '),
    ...options,
  })
  pdf.save(pdfFilename(game))
}

/** Blob URL for the finished PDF - used by the "open in a new tab" action. */
export function pdfBlobUrl(game: GeneratedGame, options: PdfOptions = {}): string {
  const pdf = renderPdf(game.doc, { title: game.meta.title, ...options })
  return URL.createObjectURL(pdf.output('blob'))
}
