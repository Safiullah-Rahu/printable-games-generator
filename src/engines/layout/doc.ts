import type {
  FontFamily, FontStyle, FontWeight, Orientation, PageSizeId,
  PathCmd, PrintDoc, PrintElement, PrintPage, TextAlign,
} from '../../types'
import { PAGE_DIMENSIONS } from '../../types'
import { baselineFromMiddle, baselineFromTop, lineHeight, measureText, wrapText } from '../../utils/text'

/**
 * DocBuilder - the drawing surface every generator writes to.
 *
 * It is a thin, immediate-mode API over the PrintDoc IR: primitives push
 * elements onto the current page, and a small flow cursor (`y`) makes stacking
 * blocks down a page painless. Anything richer (headers, card grids, answer
 * keys) lives in ./components.ts and is built out of these primitives, so there
 * is exactly one place where geometry meets the page.
 */

export interface DocOptions {
  pageSize: PageSizeId
  orientation: Orientation
  title: string
  margin?: number | { top: number; right: number; bottom: number; left: number }
}

export interface TextOptions {
  size?: number
  font?: FontFamily
  weight?: FontWeight
  style?: FontStyle
  align?: TextAlign
  color?: string
  charSpace?: number
  rotate?: number
  maxWidth?: number
  opacity?: number
  /** Interpret `y` as the top of the line box instead of the baseline. */
  baseline?: 'alphabetic' | 'top' | 'middle'
}

export interface ShapeOptions {
  fill?: string
  stroke?: string
  lineWidth?: number
  dash?: number[]
  opacity?: number
  radius?: number
}

export class DocBuilder {
  readonly width: number
  readonly height: number
  readonly margin: { top: number; right: number; bottom: number; left: number }
  readonly title: string

  private pages: PrintPage[] = []
  private current: PrintPage | null = null
  /** Flow cursor for stacked blocks. */
  y = 0

  constructor(opts: DocOptions) {
    const base = PAGE_DIMENSIONS[opts.pageSize]
    const portrait = opts.orientation === 'portrait'
    this.width = portrait ? base.width : base.height
    this.height = portrait ? base.height : base.width
    this.title = opts.title

    const m = opts.margin ?? 12
    this.margin = typeof m === 'number' ? { top: m, right: m, bottom: m, left: m } : m
  }

  /* ----------------------------- geometry ----------------------------- */

  get left(): number { return this.margin.left }
  get right(): number { return this.width - this.margin.right }
  get top(): number { return this.margin.top }
  get bottom(): number { return this.height - this.margin.bottom }
  get contentWidth(): number { return this.right - this.left }
  get contentHeight(): number { return this.bottom - this.top }
  get centerX(): number { return this.width / 2 }

  /** Vertical space left between the cursor and the bottom margin. */
  get remaining(): number { return this.bottom - this.y }

  /* ------------------------------ pages ------------------------------- */

  page(label = 'Page', role: PrintPage['role'] = 'game'): this {
    this.current = { label, role, elements: [] }
    this.pages.push(this.current)
    this.y = this.top
    return this
  }

  /** Starts a new page only when `needed` mm will not fit on the current one. */
  ensureSpace(needed: number, label = 'Continued', role: PrintPage['role'] = 'game'): boolean {
    if (this.current && this.remaining >= needed) return false
    this.page(label, role)
    return true
  }

  get pageCount(): number { return this.pages.length }

  private target(): PrintPage {
    if (!this.current) this.page()
    return this.current as PrintPage
  }

  push(element: PrintElement): this {
    this.target().elements.push(element)
    return this
  }

  /* ---------------------------- primitives ---------------------------- */

  text(x: number, y: number, content: string, opts: TextOptions = {}): this {
    const size = opts.size ?? 10
    const font = opts.font ?? 'sans'
    let baselineY = y
    if (opts.baseline === 'top') baselineY = baselineFromTop(y, size, font)
    else if (opts.baseline === 'middle') baselineY = baselineFromMiddle(y, size, font)

    this.push({
      kind: 'text',
      x,
      y: baselineY,
      text: content,
      size,
      font,
      weight: opts.weight ?? 'normal',
      style: opts.style ?? 'normal',
      align: opts.align ?? 'left',
      color: opts.color ?? '#111827',
      charSpace: opts.charSpace,
      rotate: opts.rotate,
      maxWidth: opts.maxWidth,
      opacity: opts.opacity,
      exactWidth: content.length > 1 && !opts.rotate,
    })
    return this
  }

  rect(x: number, y: number, w: number, h: number, opts: ShapeOptions = {}): this {
    this.push({
      kind: 'rect', x, y, w, h,
      fill: opts.fill,
      stroke: opts.stroke,
      lineWidth: opts.lineWidth ?? (opts.stroke ? 0.3 : undefined),
      radius: opts.radius,
      dash: opts.dash,
      opacity: opts.opacity,
    })
    return this
  }

  line(x1: number, y1: number, x2: number, y2: number, opts: ShapeOptions & { cap?: 'butt' | 'round' | 'square' } = {}): this {
    this.push({
      kind: 'line', x1, y1, x2, y2,
      stroke: opts.stroke ?? '#111827',
      lineWidth: opts.lineWidth ?? 0.3,
      dash: opts.dash,
      cap: opts.cap,
      opacity: opts.opacity,
    })
    return this
  }

  circle(cx: number, cy: number, r: number, opts: ShapeOptions = {}): this {
    this.push({
      kind: 'circle', cx, cy, r,
      fill: opts.fill,
      stroke: opts.stroke,
      lineWidth: opts.lineWidth ?? (opts.stroke ? 0.3 : undefined),
      dash: opts.dash,
      opacity: opts.opacity,
    })
    return this
  }

  polygon(points: Array<[number, number]>, opts: ShapeOptions & { closed?: boolean } = {}): this {
    this.push({
      kind: 'polygon', points,
      fill: opts.fill,
      stroke: opts.stroke,
      lineWidth: opts.lineWidth ?? (opts.stroke ? 0.3 : undefined),
      closed: opts.closed ?? true,
      opacity: opts.opacity,
    })
    return this
  }

  path(d: PathCmd[], opts: ShapeOptions = {}): this {
    this.push({
      kind: 'path', d,
      fill: opts.fill,
      stroke: opts.stroke,
      lineWidth: opts.lineWidth ?? (opts.stroke ? 0.3 : undefined),
      dash: opts.dash,
      opacity: opts.opacity,
    })
    return this
  }

  /* --------------------------- composites ----------------------------- */

  /**
   * Draws wrapped body text and returns the height consumed. Does not move the
   * cursor - callers decide whether the block flows or is absolutely placed.
   */
  paragraph(
    x: number,
    y: number,
    width: number,
    content: string,
    opts: TextOptions & { lineFactor?: number } = {},
  ): number {
    const size = opts.size ?? 9
    const font = opts.font ?? 'sans'
    const weight = opts.weight ?? 'normal'
    const lh = lineHeight(size, opts.lineFactor ?? 1.3)
    const lines = wrapText(content, width, size, font, weight, opts.style ?? 'normal')
    lines.forEach((line, i) => {
      this.text(
        opts.align === 'center' ? x + width / 2 : opts.align === 'right' ? x + width : x,
        y + i * lh,
        line,
        { ...opts, size, font, weight, baseline: 'top', maxWidth: width },
      )
    })
    return lines.length * lh
  }

  /** Measured height of `paragraph` without drawing - useful for pre-planning. */
  paragraphHeight(width: number, content: string, size = 9, font: FontFamily = 'sans', lineFactor = 1.3): number {
    return wrapText(content, width, size, font).length * lineHeight(size, lineFactor)
  }

  /** Advances the flow cursor. */
  move(dy: number): this {
    this.y += dy
    return this
  }

  /* ------------------------------ output ------------------------------ */

  build(): PrintDoc {
    return {
      width: this.width,
      height: this.height,
      margin: this.margin,
      pages: this.pages,
      title: this.title,
    }
  }
}

/** Re-exported so generators do not each import from utils/text. */
export { measureText, lineHeight, wrapText }
