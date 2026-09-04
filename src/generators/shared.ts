import type { AnswerKey, FontWeight, GameCategory, GameConfig, GameMeta, LayoutContext, Orientation, PlayersOption } from '../types'
import { PLAYER_OPTIONS } from '../types'
import { DocBuilder } from '../engines/layout/doc'
import {
  cardGrid, drawAnswerKeyPages, drawCardFrame, drawCutGuides, drawInstructions,
  startGamePage, type CardRect,
} from '../engines/layout/components'
import { resolveTheme, type GameTheme } from '../engines/layout/theme'
import { marginsFor } from '../layouts/paper'
import { chunk } from '../utils/misc'
import { lineHeight, measureText, wrapText } from '../utils/text'

/**
 * Helpers shared by the generators.
 *
 * Anything that more than one game needs - starting a document, paginating a
 * deck of cards, printing duplex-aligned backs - lives here so the individual
 * generators stay focused on their own mechanics.
 */

export interface DocSetup {
  builder: DocBuilder
  theme: GameTheme
}

/**
 * Creates the DocBuilder and resolves the theme for a layout pass.
 *
 * Margins come from the paper presets in layouts/paper.ts, keyed by category:
 * a board game earns a tighter margin than a worksheet because every millimetre
 * of edge is a millimetre off the board.
 */
export function setupDoc(
  ctx: LayoutContext,
  orientation?: Orientation,
  category: GameCategory = 'puzzle',
): DocSetup {
  const builder = new DocBuilder({
    pageSize: ctx.config.pageSize,
    orientation: orientation ?? ctx.config.orientation,
    title: ctx.config.customTitle || ctx.meta.title,
    margin: marginsFor(category),
  })
  return { builder, theme: resolveTheme(ctx.config.theme, ctx.config.inkSaver) }
}

/** Draws the answer-key pages when the user asked for them. */
export function finishDoc(b: DocBuilder, theme: GameTheme, ctx: LayoutContext, key?: AnswerKey) {
  if (ctx.config.includeAnswerKey) {
    drawAnswerKeyPages(b, theme, key ?? ctx.answerKey, ctx.meta, ctx.config)
  }
  return b.build()
}

export function playerCount(players: PlayersOption): number {
  return PLAYER_OPTIONS.find((p) => p.id === players)?.count ?? 1
}

/* ------------------------------------------------------------------ *
 * Card deck pagination
 * ------------------------------------------------------------------ */

export interface CardPageOptions<T> {
  items: T[]
  cols: number
  rows: number
  /** Draws one card. `frame` is the outer rect; `body` is below the header. */
  render: (b: DocBuilder, theme: GameTheme, card: CardRect, item: T, index: number) => void
  /** Optional duplex-aligned back face. */
  renderBack?: (b: DocBuilder, theme: GameTheme, card: CardRect, item: T, index: number) => void
  label?: string
  backLabel?: string
  tag?: (page: number, total: number) => string
  /** Instructions printed above the first sheet of cards. */
  instructions?: string[]
  gap?: number
}

/**
 * Lays a deck of cards across as many sheets as needed.
 *
 * When `renderBack` is supplied, each front sheet is followed by a back sheet
 * whose columns are mirrored left-to-right. That is what makes long-edge duplex
 * printing land the right answer behind the right question - getting this wrong
 * is the classic flash-card printing failure, so it is handled once, here.
 */
export function layoutCardPages<T>(
  b: DocBuilder,
  theme: GameTheme,
  ctx: LayoutContext,
  opts: CardPageOptions<T>,
): void {
  const perPage = opts.cols * opts.rows
  const pages = chunk(opts.items, perPage)
  const gap = opts.gap ?? 3

  pages.forEach((pageItems, pageIndex) => {
    let y = startGamePage(b, theme, ctx.meta, ctx.config, {
      label: `${opts.label ?? 'Cards'} ${pageIndex + 1}`,
      role: 'cards',
      tag: opts.tag ? opts.tag(pageIndex + 1, pages.length) : `Sheet ${pageIndex + 1} of ${pages.length}`,
      nameLine: false,
      compact: pageIndex > 0,
    })

    if (pageIndex === 0 && opts.instructions?.length && ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, opts.instructions)
    }

    const gridOpts = {
      cols: opts.cols,
      rows: opts.rows,
      x: b.left,
      y,
      width: b.contentWidth,
      height: b.bottom - y - 2,
      gap,
    }

    if (ctx.config.cutLines) drawCutGuides(b, theme, gridOpts)
    const rects = cardGrid(gridOpts)

    pageItems.forEach((item, i) => {
      opts.render(b, theme, rects[i], item, pageIndex * perPage + i)
    })

    if (opts.renderBack) {
      const backY = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: `${opts.backLabel ?? 'Card backs'} ${pageIndex + 1}`,
        role: 'cards',
        tag: `Backs for sheet ${pageIndex + 1} - print on the reverse`,
        nameLine: false,
        compact: true,
      })
      const backGrid = { ...gridOpts, y: backY, height: b.bottom - backY - 2 }
      if (ctx.config.cutLines) drawCutGuides(b, theme, backGrid)
      const backRects = cardGrid(backGrid)

      pageItems.forEach((item, i) => {
        const row = Math.floor(i / opts.cols)
        const col = i % opts.cols
        // Mirror the column so duplex printing aligns front to back.
        const mirroredIndex = row * opts.cols + (opts.cols - 1 - col)
        opts.renderBack?.(b, theme, backRects[mirroredIndex], item, pageIndex * perPage + i)
      })
    }
  })
}

/** Card body helper: frame plus a centred, auto-fitting block of text. */
export function drawSimpleCard(
  b: DocBuilder,
  theme: GameTheme,
  card: CardRect,
  opts: { header?: string; body: string; footer?: string; bodySize?: number; headerHeight?: number },
): void {
  const headerHeight = opts.header ? (opts.headerHeight ?? 7) : 0
  const bodyTop = drawCardFrame(b, theme, card, {
    headerHeight,
    headerLabel: opts.header,
  })

  const padding = 3.5
  const availableW = card.w - padding * 2
  const footerH = opts.footer ? 5 : 0
  const availableH = card.y + card.h - bodyTop - padding * 2 - footerH

  const start = opts.bodySize ?? Math.min(14, Math.max(8, availableH * 0.42))
  const { size, lines } = fitBlock(opts.body, availableW, availableH, start, theme)
  const lineH = lineHeight(size, 1.25)
  const blockH = lines.length * lineH
  const top = bodyTop + (card.y + card.h - footerH - bodyTop - blockH) / 2

  lines.forEach((line, i) => {
    b.text(card.x + card.w / 2, top + i * lineH, line, {
      size,
      align: 'center',
      font: theme.fonts.body,
      color: theme.colors.ink,
      baseline: 'top',
      maxWidth: availableW,
    })
  })

  if (opts.footer) {
    b.text(card.x + card.w / 2, card.y + card.h - 2.4, opts.footer, {
      size: 6.4,
      align: 'center',
      font: theme.fonts.body,
      color: theme.colors.muted,
      baseline: 'alphabetic',
      maxWidth: availableW,
    })
  }
}

/**
 * Shrink-to-fit wrapping used by every card face.
 *
 * Steps the point size down until the wrapped block fits the box. Cards hold
 * content of wildly varying length (a 3-character answer or a 20-word question),
 * so fitting rather than truncating is what keeps decks looking deliberate.
 */
export function fitBlock(
  text: string,
  width: number,
  height: number,
  startSize: number,
  theme: GameTheme,
  minSize = 5,
  weight: FontWeight = 'normal',
): { size: number; lines: string[] } {
  let size = startSize
  for (;;) {
    const lines = wrapText(text, width, size, theme.fonts.body, weight)
    const blockHeight = lines.length * lineHeight(size, 1.25)
    const widest = Math.max(...lines.map((l) => measureText(l, size, theme.fonts.body, weight)), 0)
    // Height AND width both have to fit: a single long word never wraps, so
    // without the width test it would silently overrun its box.
    if ((blockHeight <= height && widest <= width) || size <= minSize) return { size, lines }
    size -= 0.25
  }
}

/* ------------------------------------------------------------------ *
 * Meta helpers
 * ------------------------------------------------------------------ */

export function baseMeta(
  config: GameConfig,
  title: string,
  instructions: string[],
  stats: Record<string, string | number>,
  variant: string,
): GameMeta {
  return {
    title: config.customTitle || title,
    subtitle: config.customSubtitle || subtitleFor(config),
    instructions,
    stats,
    variant,
  }
}

export function subtitleFor(config: GameConfig): string {
  const grade = config.grade === 'adult' ? 'Adult' : config.grade === 'K' ? 'Kindergarten' : `Grade ${config.grade}`
  const difficulty = config.difficulty.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return `${grade}  |  ${difficulty}  |  ${config.lengthMinutes} min`
}

/** Numbered answer-key entries from a list of answers. */
export function numberedKey(answers: string[], prefix = ''): AnswerKey {
  return {
    entries: answers.map((answer, i) => ({ label: `${prefix}${i + 1}.`, answer })),
  }
}
