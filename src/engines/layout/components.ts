import type { AnswerKey, GameConfig, GameMeta, PrintDoc, PrintPage } from '../../types'
import { chunk } from '../../utils/misc'
import { fitTextSize, lineHeight, measureText, wrapText } from '../../utils/text'
import { DocBuilder } from './doc'
import { drawMotif, scatterMotifs } from './motifs'
import type { GameTheme } from './theme'

/**
 * Reusable page furniture.
 *
 * Every generator draws the same header, instruction panel, footer and answer
 * key through these helpers, which is what makes eighteen very different games
 * look like one coherent product. Generators only implement the part that is
 * actually unique to them.
 */

export const HEADER_BAND_HEIGHT = 15

export interface HeaderOptions {
  title: string
  subtitle?: string
  /** Small right-aligned tag, e.g. "Card 2 of 6" or "Answer Key". */
  tag?: string
  nameLine?: boolean
  compact?: boolean
}

/** Draws the title band and optional name rule. Returns the y below it. */
export function drawHeader(b: DocBuilder, theme: GameTheme, opts: HeaderOptions): number {
  const bandH = opts.compact ? HEADER_BAND_HEIGHT * 0.75 : HEADER_BAND_HEIGHT
  const x = b.left
  const w = b.contentWidth
  let y = b.top

  const filled = theme.colors.band !== '#ffffff'
  b.rect(x, y, w, bandH, {
    fill: theme.colors.band,
    stroke: filled ? undefined : theme.colors.accent,
    lineWidth: filled ? undefined : 0.6,
    radius: 2,
  })

  if (theme.decorative) {
    // Motifs sit inside the band, behind the title, at low opacity.
    scatterMotifs(b, theme.motif, x + 6, y + bandH / 2, w * 0.24, 3, bandH * 0.34, theme.colors.bandText, 0.35)
    scatterMotifs(b, theme.motif, x + w * 0.76 - 6, y + bandH / 2, w * 0.24, 3, bandH * 0.34, theme.colors.bandText, 0.35)
  }

  const titleSize = fitTextSize(opts.title, w * 0.7, opts.compact ? 15 : 19, 10, theme.fonts.heading, 'bold')
  b.text(b.centerX, y + bandH / 2, opts.title, {
    size: titleSize,
    font: theme.fonts.heading,
    weight: 'bold',
    align: 'center',
    color: theme.colors.bandText,
    baseline: 'middle',
    maxWidth: w * 0.72,
  })

  y += bandH

  if (opts.subtitle || opts.tag) {
    y += 3.2
    if (opts.subtitle) {
      b.text(x, y, opts.subtitle, {
        size: 8.5,
        font: theme.fonts.body,
        color: theme.colors.muted,
        baseline: 'top',
        maxWidth: w * 0.7,
      })
    }
    if (opts.tag) {
      b.text(b.right, y, opts.tag, {
        size: 8.5,
        font: theme.fonts.body,
        weight: 'bold',
        align: 'right',
        color: theme.colors.accent,
        baseline: 'top',
      })
    }
    y += lineHeight(8.5)
  }

  if (opts.nameLine) {
    y += 2
    const gap = 6
    const dateW = 42
    const nameW = w - dateW - gap
    b.text(x, y, 'Name', { size: 8.5, color: theme.colors.muted, baseline: 'top', font: theme.fonts.body })
    const labelW = measureText('Name', 8.5, theme.fonts.body) + 2
    b.line(x + labelW, y + 4.2, x + nameW, y + 4.2, { stroke: theme.colors.rule, lineWidth: 0.35 })
    b.text(x + nameW + gap, y, 'Date', { size: 8.5, color: theme.colors.muted, baseline: 'top', font: theme.fonts.body })
    const dLabelW = measureText('Date', 8.5, theme.fonts.body) + 2
    b.line(x + nameW + gap + dLabelW, y + 4.2, b.right, y + 4.2, { stroke: theme.colors.rule, lineWidth: 0.35 })
    y += 7
  }

  return y + 3
}

/** Instruction panel. Returns the y below it, or `y` unchanged when skipped. */
export function drawInstructions(
  b: DocBuilder,
  theme: GameTheme,
  y: number,
  lines: string[],
  opts: { heading?: string; width?: number; x?: number; size?: number } = {},
): number {
  if (lines.length === 0) return y
  const x = opts.x ?? b.left
  const w = opts.width ?? b.contentWidth
  const size = opts.size ?? 8.4
  const heading = opts.heading ?? 'How to play'
  const padX = 4
  const padY = 3.4
  const numberW = 5

  const wrapped = lines.map((line) => wrapText(line, w - padX * 2 - numberW, size, theme.fonts.body))
  const bodyH = wrapped.reduce((acc, ls) => acc + ls.length * lineHeight(size, 1.28), 0)
  const headH = lineHeight(9.4, 1.2)
  const boxH = padY * 2 + headH + bodyH + 1

  b.rect(x, y, w, boxH, {
    fill: theme.colors.panel,
    stroke: theme.colors.panelBorder,
    lineWidth: 0.4,
    radius: 1.8,
  })
  // Accent spine makes the panel readable even in greyscale.
  b.rect(x, y, 1.4, boxH, { fill: theme.colors.accent, radius: 0.7 })

  let cy = y + padY
  b.text(x + padX, cy, heading.toUpperCase(), {
    size: 9.4,
    weight: 'bold',
    font: theme.fonts.heading,
    color: theme.colors.accent,
    baseline: 'top',
    charSpace: 0.25,
  })
  cy += headH

  wrapped.forEach((ls, i) => {
    b.text(x + padX, cy, `${i + 1}.`, {
      size,
      weight: 'bold',
      font: theme.fonts.body,
      color: theme.colors.accent,
      baseline: 'top',
    })
    ls.forEach((line, j) => {
      b.text(x + padX + numberW, cy + j * lineHeight(size, 1.28), line, {
        size,
        font: theme.fonts.body,
        color: theme.colors.ink,
        baseline: 'top',
      })
    })
    cy += ls.length * lineHeight(size, 1.28)
  })

  return y + boxH + 4
}

/** Section heading with a rule - used to separate blocks within a page. */
export function drawSectionTitle(
  b: DocBuilder,
  theme: GameTheme,
  y: number,
  text: string,
  opts: { x?: number; width?: number; size?: number } = {},
): number {
  const x = opts.x ?? b.left
  const w = opts.width ?? b.contentWidth
  const size = opts.size ?? 10.5
  b.text(x, y, text.toUpperCase(), {
    size,
    weight: 'bold',
    font: theme.fonts.heading,
    color: theme.colors.accent,
    baseline: 'top',
    charSpace: 0.3,
  })
  const tw = measureText(text.toUpperCase(), size, theme.fonts.heading, 'bold', 'normal', 0.3)
  const ruleY = y + lineHeight(size, 1) * 0.62
  if (tw + 4 < w) {
    b.line(x + tw + 3, ruleY, x + w, ruleY, { stroke: theme.colors.rule, lineWidth: 0.35 })
  }
  return y + lineHeight(size, 1.55)
}

/* ------------------------------------------------------------------ *
 * Card grids (matching, memory, quiz, flash, challenge, trivia)
 * ------------------------------------------------------------------ */

export interface CardRect {
  x: number
  y: number
  w: number
  h: number
  index: number
  row: number
  col: number
}

export interface CardGridOptions {
  cols: number
  rows: number
  x: number
  y: number
  width: number
  height: number
  gap?: number
}

/** Computes evenly spaced card rectangles for one page. */
export function cardGrid(opts: CardGridOptions): CardRect[] {
  const gap = opts.gap ?? 3
  const cw = (opts.width - gap * (opts.cols - 1)) / opts.cols
  const ch = (opts.height - gap * (opts.rows - 1)) / opts.rows
  const out: CardRect[] = []
  for (let r = 0; r < opts.rows; r++) {
    for (let c = 0; c < opts.cols; c++) {
      out.push({
        x: opts.x + c * (cw + gap),
        y: opts.y + r * (ch + gap),
        w: cw,
        h: ch,
        index: r * opts.cols + c,
        row: r,
        col: c,
      })
    }
  }
  return out
}

/**
 * Dashed cutting guides around a card grid. Drawn as full-bleed rules through
 * the gutters so a guillotine or scissors can follow a single straight line
 * across the whole sheet rather than card-by-card.
 */
export function drawCutGuides(
  b: DocBuilder,
  theme: GameTheme,
  opts: CardGridOptions,
): void {
  const gap = opts.gap ?? 3
  const cw = (opts.width - gap * (opts.cols - 1)) / opts.cols
  const ch = (opts.height - gap * (opts.rows - 1)) / opts.rows
  const dash = [1.6, 1.6]
  const style = { stroke: theme.colors.rule, lineWidth: 0.25, dash }

  for (let c = 0; c <= opts.cols; c++) {
    const x = c === 0 ? opts.x : opts.x + c * (cw + gap) - gap / 2
    b.line(x, opts.y - 3, x, opts.y + opts.height + 3, style)
  }
  for (let r = 0; r <= opts.rows; r++) {
    const y = r === 0 ? opts.y : opts.y + r * (ch + gap) - gap / 2
    b.line(opts.x - 3, y, opts.x + opts.width + 3, y, style)
  }
}

/** Standard card frame: rounded border plus optional tinted header strip. */
export function drawCardFrame(
  b: DocBuilder,
  theme: GameTheme,
  card: CardRect,
  opts: { headerHeight?: number; headerLabel?: string; fill?: string } = {},
): number {
  b.rect(card.x, card.y, card.w, card.h, {
    fill: opts.fill ?? '#ffffff',
    stroke: theme.colors.grid,
    lineWidth: 0.45,
    radius: 2,
  })
  if (opts.headerHeight && opts.headerHeight > 0) {
    b.rect(card.x, card.y, card.w, opts.headerHeight, {
      fill: theme.colors.accentSoft,
      radius: 2,
    })
    // Square off the bottom corners of the header strip.
    b.rect(card.x, card.y + opts.headerHeight - 2, card.w, 2, { fill: theme.colors.accentSoft })
    b.line(card.x, card.y + opts.headerHeight, card.x + card.w, card.y + opts.headerHeight, {
      stroke: theme.colors.panelBorder,
      lineWidth: 0.3,
    })
    if (opts.headerLabel) {
      const size = fitTextSize(opts.headerLabel, card.w - 6, 7.5, 5, theme.fonts.body, 'bold')
      b.text(card.x + card.w / 2, card.y + opts.headerHeight / 2, opts.headerLabel, {
        size,
        weight: 'bold',
        align: 'center',
        font: theme.fonts.body,
        color: theme.colors.accent,
        baseline: 'middle',
      })
    }
    return card.y + opts.headerHeight
  }
  return card.y
}

/* ------------------------------------------------------------------ *
 * Answer key
 * ------------------------------------------------------------------ */

/**
 * Lays out the answer key across as many pages as it needs, balancing entries
 * into two or three columns depending on how long the answers are.
 */
export function drawAnswerKeyPages(
  b: DocBuilder,
  theme: GameTheme,
  key: AnswerKey,
  meta: GameMeta,
  config: GameConfig,
): void {
  if (key.entries.length === 0 && (key.notes ?? []).length === 0) return

  b.page('Answer Key', 'answerKey')
  let y = drawHeader(b, theme, {
    title: config.customTitle || meta.title,
    subtitle: meta.subtitle,
    tag: 'ANSWER KEY',
    nameLine: false,
  })

  if (key.notes?.length) {
    y = drawInstructions(b, theme, y, key.notes, { heading: 'Notes for the teacher' })
  }

  if (key.entries.length === 0) return

  y = drawSectionTitle(b, theme, y, 'Answers')

  // Wider answers get fewer columns so nothing has to be truncated.
  const longest = Math.max(...key.entries.map((e) => measureText(`${e.label}  ${e.answer}`, 9)))
  const cols = longest > b.contentWidth / 2 - 8 ? 1 : longest > b.contentWidth / 3 - 8 ? 2 : 3
  const gutter = 6
  const colW = (b.contentWidth - gutter * (cols - 1)) / cols
  const rowH = 5.6

  let index = 0
  while (index < key.entries.length) {
    const capacity = Math.max(1, Math.floor((b.bottom - y) / rowH)) * cols
    const slice = key.entries.slice(index, index + capacity)
    const perCol = Math.ceil(slice.length / cols)
    const columns = chunk(slice, perCol)

    columns.forEach((colEntries, ci) => {
      const cx = b.left + ci * (colW + gutter)
      colEntries.forEach((entry, ri) => {
        const ey = y + ri * rowH
        if (ri % 2 === 1) {
          b.rect(cx - 1, ey - 0.6, colW + 2, rowH, { fill: theme.colors.gridAlt })
        }
        b.text(cx, ey, entry.label, {
          size: 8.6,
          weight: 'bold',
          font: theme.fonts.body,
          color: theme.colors.muted,
          baseline: 'top',
        })
        const labelW = measureText(entry.label, 8.6, theme.fonts.body, 'bold') + 2.5
        const answerSize = fitTextSize(entry.answer, colW - labelW, 8.6, 5.5, theme.fonts.body, 'bold')
        b.text(cx + labelW, ey, entry.answer, {
          size: answerSize,
          weight: 'bold',
          font: theme.fonts.body,
          color: theme.colors.ink,
          baseline: 'top',
          maxWidth: colW - labelW,
        })
      })
    })

    index += slice.length
    if (index < key.entries.length) {
      b.page('Answer Key (cont.)', 'answerKey')
      y = drawHeader(b, theme, {
        title: config.customTitle || meta.title,
        tag: 'ANSWER KEY (CONTINUED)',
      })
    }
  }
}

/* ------------------------------------------------------------------ *
 * Footers (applied once the page count is known)
 * ------------------------------------------------------------------ */

/**
 * Stamps a footer on every page. Run as a post-pass by the pipeline because
 * "Page 2 of 5" cannot be known while the pages are still being produced.
 */
export function applyFooters(
  doc: PrintDoc,
  theme: GameTheme,
  meta: GameMeta,
  config: GameConfig,
): void {
  const total = doc.pages.length
  const y = doc.height - doc.margin.bottom + 5.5
  const left = doc.margin.left
  const right = doc.width - doc.margin.right

  doc.pages.forEach((page, i) => {
    page.elements.push(
      {
        kind: 'line',
        x1: left, y1: y - 2.6, x2: right, y2: y - 2.6,
        stroke: theme.colors.rule, lineWidth: 0.25,
      },
      {
        kind: 'text',
        x: left, y: y + 1.6,
        text: meta.title,
        size: 6.8, font: theme.fonts.body, weight: 'normal', style: 'normal',
        align: 'left', color: theme.colors.muted, exactWidth: true,
      },
      {
        kind: 'text',
        x: (left + right) / 2, y: y + 1.6,
        text: `Page ${i + 1} of ${total}`,
        size: 6.8, font: theme.fonts.body, weight: 'normal', style: 'normal',
        align: 'center', color: theme.colors.muted, exactWidth: true,
      },
      {
        kind: 'text',
        x: right, y: y + 1.6,
        text: `seed ${config.seed}`,
        size: 6.8, font: 'mono', weight: 'normal', style: 'normal',
        align: 'right', color: theme.colors.muted, exactWidth: true,
      },
    )
  })
}

/** Convenience: builds a fresh page with the standard header already drawn. */
export function startGamePage(
  b: DocBuilder,
  theme: GameTheme,
  meta: GameMeta,
  config: GameConfig,
  opts: { label?: string; role?: PrintPage['role']; tag?: string; nameLine?: boolean; compact?: boolean } = {},
): number {
  b.page(opts.label ?? 'Game', opts.role ?? 'game')
  return drawHeader(b, theme, {
    title: config.customTitle || meta.title,
    subtitle: config.customSubtitle || meta.subtitle,
    tag: opts.tag,
    nameLine: opts.nameLine ?? config.nameLine,
    compact: opts.compact,
  })
}

export { drawMotif }
