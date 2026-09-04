import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp } from '../utils/misc'
import { lineHeight, wrapText } from '../utils/text'
import { buildPrompts, validatePrompts, type PromptItem } from './promptSource'
import { baseMeta, finishDoc, setupDoc } from './shared'

/**
 * Matching sheets: draw a line from each item on the left to its partner on the
 * right. Two generators share the implementation because "match the equation to
 * its answer" and "match the word to its meaning" are the same sheet with a
 * different content source.
 *
 * The right column is shuffled independently of the left, and the shuffle is
 * checked so no item accidentally lines up opposite its own partner - a row that
 * matches straight across gives the whole puzzle away.
 */

export interface MatchingPayload {
  items: PromptItem[]
  /** Index into `items` for each right-hand slot. */
  rightOrder: number[]
  variant: string
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function buildMatching(ctx: GenContext, source: 'math' | 'auto', maxItems: number): MatchingPayload {
  const count = clamp(ctx.config.itemCount, 4, maxItems)
  const items = buildPrompts(ctx, count, { source, maxPromptLength: 90, maxAnswerLength: 20 })

  // Shuffle until no answer sits directly opposite its own prompt.
  let rightOrder = ctx.rng.shuffle(items.map((_, i) => i))
  for (let attempt = 0; attempt < 24; attempt++) {
    if (rightOrder.every((sourceIndex, slot) => sourceIndex !== slot)) break
    rightOrder = ctx.rng.shuffle(items.map((_, i) => i))
  }
  // A derangement is impossible for a single item; accept it in that case.
  if (items.length > 1 && rightOrder.every((s, i) => s === i)) {
    rightOrder = [...rightOrder.slice(1), rightOrder[0]]
  }

  return { items, rightOrder, variant: `${items.length} pairs, shuffled right column` }
}

function matchingKey(payload: MatchingPayload): AnswerKey {
  // Slot letter for each left-hand number.
  const slotOf = new Map<number, number>()
  payload.rightOrder.forEach((sourceIndex, slot) => slotOf.set(sourceIndex, slot))

  return {
    entries: payload.items.map((item, i) => ({
      label: `${i + 1}.`,
      answer: `${LETTERS[slotOf.get(i) ?? 0]}  (${item.answer})`,
    })),
    notes: ['Each number on the left pairs with exactly one letter on the right.'],
  }
}

function layoutMatching(payload: MatchingPayload, ctx: LayoutContext, leftTitle: string, rightTitle: string): PrintDoc {
  const { builder: b, theme } = setupDoc(ctx)
  const { items, rightOrder } = payload

  let y = startGamePage(b, theme, ctx.meta, ctx.config)
  if (ctx.config.includeInstructions) {
    y = drawInstructions(b, theme, y, ctx.meta.instructions)
  }

  const gutter = Math.max(24, b.contentWidth * 0.16)
  const colW = (b.contentWidth - gutter) / 2
  const rightX = b.left + colW + gutter

  // Draw both headings, then size rows to whatever height is left.
  drawSectionTitle(b, theme, y, leftTitle, { x: b.left, width: colW, size: 9.5 })
  y = drawSectionTitle(b, theme, y, rightTitle, { x: rightX, width: colW, size: 9.5 })

  const available = b.bottom - y - 4
  const rowH = Math.min(16, available / items.length)
  const textSize = clamp(rowH * 0.62, 6.5, 10.5)

  // Pass 1: zebra stripes, so every tint sits behind every glyph.
  items.forEach((_, i) => {
    if (i % 2 !== 1) return
    const ry = y + i * rowH
    b.rect(b.left - 1, ry, colW + 2, rowH, { fill: theme.colors.gridAlt })
    b.rect(rightX - 1, ry, colW + 2, rowH, { fill: theme.colors.gridAlt })
  })

  // Pass 2: content.
  items.forEach((item, i) => {
    const ry = y + i * rowH
    const cy = ry + rowH / 2

    /* left: numbered prompt with a connector dot */
    b.text(b.left, cy, `${i + 1}.`, {
      size: textSize,
      weight: 'bold',
      font: theme.fonts.body,
      color: theme.colors.accent,
      baseline: 'middle',
    })
    const promptLines = wrapText(item.prompt, colW - 14, textSize, theme.fonts.body)
    const shown = promptLines.length > 2 ? [promptLines[0], `${promptLines[1].slice(0, -3)}...`] : promptLines
    const blockTop = cy - (shown.length * lineHeight(textSize, 1.15)) / 2
    shown.forEach((line, li) => {
      b.text(b.left + 7, blockTop + li * lineHeight(textSize, 1.15), line, {
        size: textSize,
        font: theme.fonts.body,
        color: theme.colors.ink,
        baseline: 'top',
        maxWidth: colW - 14,
      })
    })
    b.circle(b.left + colW - 2, cy, 1.1, { fill: theme.colors.rule })

    /* right: lettered answer with its own connector dot */
    const sourceIndex = rightOrder[i]
    const answer = items[sourceIndex].answer
    b.circle(rightX + 2, cy, 1.1, { fill: theme.colors.rule })
    b.text(rightX + 6, cy, `${LETTERS[i]}.`, {
      size: textSize,
      weight: 'bold',
      font: theme.fonts.body,
      color: theme.colors.accent,
      baseline: 'middle',
    })
    b.text(rightX + 13, cy, answer, {
      size: textSize,
      font: theme.fonts.body,
      color: theme.colors.ink,
      baseline: 'middle',
      maxWidth: colW - 15,
    })
  })

  // Answer-writing boxes under the columns, for classes that prefer letters to lines.
  const boxY = y + items.length * rowH + 4
  if (b.bottom - boxY > 12) {
    b.text(b.left, boxY, 'Or write the matching letter beside each number:', {
      size: 8, style: 'italic', color: theme.colors.muted, baseline: 'top', font: theme.fonts.body,
    })
    const perRow = Math.min(items.length, 10)
    const boxW = b.contentWidth / perRow
    items.forEach((_, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const bx = b.left + col * boxW
      const by = boxY + 5 + row * 9
      if (by + 8 > b.bottom) return
      b.text(bx, by + 3, `${i + 1}`, {
        size: 7.5, color: theme.colors.muted, baseline: 'middle', font: theme.fonts.body,
      })
      b.rect(bx + 5, by, Math.min(9, boxW - 7), 7, { stroke: theme.colors.rule, lineWidth: 0.35, radius: 1 })
    })
  }

  return finishDoc(b, theme, ctx, matchingKey(payload))
}

export const matchingCardsGenerator: GameGenerator<MatchingPayload> = {
  id: 'matching-game',
  name: 'Matching Game',
  description: 'Two shuffled columns to connect with lines, on any subject.',
  category: 'puzzle',
  glyph: 'MG',
  subjects: ['mathematics', 'english', 'science', 'geography', 'history', 'general-knowledge', 'logic', 'vocabulary'],
  defaults: { itemCount: 10, lengthMinutes: 10 },
  itemRange: [4, 18],
  itemLabel: 'Pairs',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate: (ctx) => buildMatching(ctx, 'auto', 18),
  validate: (payload, ctx) => validatePrompts(payload.items, clamp(ctx.config.itemCount, 4, 18)),
  generateAnswerKey: matchingKey,
  meta: (payload, ctx): GameMeta =>
    baseMeta(
      ctx.config,
      'Matching Game',
      [
        'Draw a line from each number on the left to its partner on the right.',
        'Each item pairs with exactly one other - no letter is used twice.',
        'If you prefer, write the matching letter in the box at the bottom instead.',
        'Cross off pairs as you go so the last few are easier to spot.',
      ],
      { Pairs: payload.items.length },
      payload.variant,
    ),
  layout: (payload, ctx) => layoutMatching(payload, ctx, 'Match these', 'To these'),
}

export const equationMatchingGenerator: GameGenerator<MatchingPayload> = {
  id: 'equation-matching',
  name: 'Equation Matching',
  description: 'Connect each equation to its correct answer.',
  category: 'math',
  glyph: 'EM',
  subjects: ['mathematics'],
  defaults: { itemCount: 12, lengthMinutes: 10, subject: 'mathematics' },
  itemRange: [4, 18],
  itemLabel: 'Equations',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate: (ctx) => buildMatching(ctx, 'math', 18),
  validate: (payload, ctx) => validatePrompts(payload.items, clamp(ctx.config.itemCount, 4, 18)),
  generateAnswerKey: matchingKey,
  meta: (payload, ctx): GameMeta =>
    baseMeta(
      ctx.config,
      'Equation Matching',
      [
        'Work out each equation on the left.',
        'Draw a line to its answer on the right.',
        'Every answer is used exactly once - use that to check the ones you are unsure of.',
        'Show your working in the margin if it helps.',
      ],
      { Equations: payload.items.length },
      payload.variant,
    ),
  layout: (payload, ctx) => layoutMatching(payload, ctx, 'Equations', 'Answers'),
}
