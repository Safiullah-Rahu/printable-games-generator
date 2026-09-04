import { drawCardFrame } from '../engines/layout/components'
import { chooseCardSheet } from '../templates/cardSheets'
import { drawMotif } from '../engines/layout/motifs'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp } from '../utils/misc'
import { lineHeight, wrapText } from '../utils/text'
import { buildPrompts, CHOICE_LETTERS, validatePrompts, type PromptItem } from './promptSource'
import { baseMeta, drawSimpleCard, finishDoc, fitBlock, layoutCardPages, setupDoc } from './shared'

/**
 * The card family: quiz cards, flash cards, memory cards and challenge cards.
 *
 * They share a payload shape and the duplex-aware pagination in shared.ts, and
 * differ only in what a single card face looks like. Grouping them keeps the
 * duplex logic in one place - the part that is genuinely easy to get wrong.
 */

export interface CardsPayload {
  items: PromptItem[]
  /** Cards per sheet, chosen from the difficulty and content length. */
  cols: number
  rows: number
  variant: string
}

/**
 * Picks a card-sheet template from templates/cardSheets.ts based on how much
 * text the longest card in the deck actually carries.
 */
function chooseGrid(
  items: PromptItem[],
  bounds: { minPerSheet?: number; maxPerSheet?: number },
  weight = 1,
): { cols: number; rows: number } {
  const longest = Math.max(...items.map((i) => (i.prompt.length + i.answer.length) * weight), 0)
  const template = chooseCardSheet({ contentLength: longest, ...bounds })
  return { cols: template.cols, rows: template.rows }
}

/* ------------------------------------------------------------------ *
 * Quiz cards
 * ------------------------------------------------------------------ */

export const quizCardsGenerator: GameGenerator<CardsPayload> = {
  id: 'quiz-cards',
  name: 'Quiz Cards',
  description: 'Multiple-choice cards with A-D options, printable with matching backs.',
  category: 'cards',
  glyph: 'QC',
  subjects: ['mathematics', 'english', 'science', 'geography', 'history', 'general-knowledge', 'logic', 'vocabulary'],
  defaults: { itemCount: 18, lengthMinutes: 20 },
  itemRange: [4, 60],
  itemLabel: 'Questions',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): CardsPayload {
    const count = clamp(ctx.config.itemCount, 4, 60)
    const optionCount = ctx.profile.score < 20 ? 3 : 4
    const items = buildPrompts(ctx, count, { optionCount, maxPromptLength: 110 })
    const grid = chooseGrid(items, { minPerSheet: 4, maxPerSheet: 8 }, 1.6)
    return { items, ...grid, variant: `${optionCount}-choice, ${grid.cols}x${grid.rows} per sheet` }
  },

  validate: (payload, ctx) => validatePrompts(payload.items, clamp(ctx.config.itemCount, 4, 60), true),

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.items.map((item, i) => ({
        label: `${i + 1}.`,
        answer: `${CHOICE_LETTERS[item.correctIndex]} - ${item.answer}`,
      })),
      notes: ['Card numbers match the small number printed on each card.'],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Quiz Cards',
      [
        'Cut along the dashed lines to separate the cards.',
        'Read the question and choose the letter you think is correct.',
        'Answers are printed on the reverse - print double-sided (flip on the long edge) to use them.',
        'Play solo, or in pairs where one player reads and the other answers.',
      ],
      { Cards: payload.items.length, Choices: payload.items[0]?.options.length ?? 0, 'Per sheet': payload.cols * payload.rows },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx, undefined, 'cards')

    layoutCardPages(b, theme, ctx, {
      items: payload.items,
      cols: payload.cols,
      rows: payload.rows,
      instructions: ctx.meta.instructions,
      render: (doc, th, card, item, index) => {
        const bodyTop = drawCardFrame(doc, th, card, { headerHeight: 6.5, headerLabel: `Q${index + 1}` })
        const pad = 3
        const width = card.w - pad * 2
        const cardBottom = card.y + card.h

        // The question takes the space it needs; the options then expand to fill
        // whatever is left, so a card is never half empty.
        const questionBudget = (cardBottom - bodyTop - pad * 2) * 0.45
        const { size, lines } = fitBlock(item.prompt, width, questionBudget, 10, th, 6)
        lines.forEach((line, li) => {
          doc.text(card.x + pad, bodyTop + pad + li * lineHeight(size, 1.2), line, {
            size,
            font: th.fonts.body,
            color: th.colors.ink,
            baseline: 'top',
            maxWidth: width,
          })
        })

        const questionH = lines.length * lineHeight(size, 1.2)
        let oy = bodyTop + pad + questionH + 2.5
        const optionH = clamp((cardBottom - pad - oy) / item.options.length, 4, 9)
        item.options.forEach((option, oi) => {
          const label = `${CHOICE_LETTERS[oi]}`
          doc.circle(card.x + pad + 2.2, oy + optionH / 2 - 0.4, 2.1, {
            stroke: th.colors.rule,
            lineWidth: 0.3,
          })
          doc.text(card.x + pad + 2.2, oy + optionH / 2 - 0.4, label, {
            size: 6,
            align: 'center',
            weight: 'bold',
            color: th.colors.muted,
            baseline: 'middle',
            font: th.fonts.body,
          })
          const optSize = Math.min(9, optionH * 1.35)
          const fitted = fitBlock(option, width - 8, optionH, optSize, th, 5)
          doc.text(card.x + pad + 6.5, oy + optionH / 2 - 0.4, fitted.lines[0] ?? option, {
            size: fitted.size,
            font: th.fonts.body,
            color: th.colors.ink,
            baseline: 'middle',
            maxWidth: width - 8,
          })
          oy += optionH
        })
      },
      renderBack: (doc, th, card, item, index) => {
        drawSimpleCard(doc, th, card, {
          header: `Answer ${index + 1}`,
          body: `${CHOICE_LETTERS[item.correctIndex]}\n${item.answer}`.replace('\n', '   '),
          footer: item.problem?.steps[0] ?? item.category,
        })
      },
    })

    return finishDoc(b, theme, ctx)
  },
}

/* ------------------------------------------------------------------ *
 * Flash cards
 * ------------------------------------------------------------------ */

export const flashCardsGenerator: GameGenerator<CardsPayload> = {
  id: 'flash-cards',
  name: 'Flash Cards',
  description: 'Large prompt on the front, answer on the back, ready for double-sided printing.',
  category: 'cards',
  glyph: 'FC',
  // Logic is included because riddle flash cards work beautifully: question on
  // the front, answer on the back is exactly how a riddle wants to be read.
  subjects: ['mathematics', 'english', 'science', 'geography', 'history', 'general-knowledge', 'logic', 'vocabulary'],
  defaults: { itemCount: 24, lengthMinutes: 10 },
  itemRange: [4, 60],
  itemLabel: 'Cards',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): CardsPayload {
    const count = clamp(ctx.config.itemCount, 4, 60)
    const items = buildPrompts(ctx, count, { maxPromptLength: 80 })
    const grid = chooseGrid(items, { minPerSheet: 4, maxPerSheet: 12 })
    return { items, ...grid, variant: `${grid.cols}x${grid.rows} per sheet, duplex backs` }
  },

  validate: (payload, ctx) => validatePrompts(payload.items, clamp(ctx.config.itemCount, 4, 60)),

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.items.map((item, i) => ({ label: `${i + 1}.`, answer: `${item.compact}  =  ${item.answer}` })),
      notes: ['Use this list to check a set of cards after cutting.'],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Flash Cards',
      [
        'Print double-sided, flipping on the long edge, so each answer lands behind its prompt.',
        'Cut along the dashed guides.',
        'Look at the front, say your answer aloud, then turn the card over to check.',
        'Keep the ones you got wrong in a separate pile and go through them again.',
      ],
      { Cards: payload.items.length, 'Per sheet': payload.cols * payload.rows },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx, undefined, 'cards')

    layoutCardPages(b, theme, ctx, {
      items: payload.items,
      cols: payload.cols,
      rows: payload.rows,
      instructions: ctx.meta.instructions,
      label: 'Fronts',
      backLabel: 'Backs',
      render: (doc, th, card, item, index) => {
        drawSimpleCard(doc, th, card, {
          body: item.compact,
          footer: `${index + 1}`,
          bodySize: 20,
        })
      },
      renderBack: (doc, th, card, item, index) => {
        drawSimpleCard(doc, th, card, {
          body: item.answer,
          footer: `${index + 1}`,
          bodySize: 22,
        })
      },
    })

    return finishDoc(b, theme, ctx)
  },
}

/* ------------------------------------------------------------------ *
 * Memory / pairs
 * ------------------------------------------------------------------ */

export interface MemoryPayload extends CardsPayload {
  /** Shuffled tiles, two per pair. */
  tiles: Array<{ pairId: number; text: string; side: 'prompt' | 'answer' }>
}

export const memoryCardsGenerator: GameGenerator<MemoryPayload> = {
  id: 'memory-cards',
  name: 'Memory Cards',
  description: 'Matching-pairs tiles with a uniform card back for a classic memory game.',
  category: 'cards',
  glyph: 'MC',
  subjects: ['mathematics', 'english', 'science', 'geography', 'history', 'general-knowledge', 'vocabulary'],
  defaults: { itemCount: 12, lengthMinutes: 15, players: '2' },
  itemRange: [6, 24],
  itemLabel: 'Pairs',
  usesPlayers: true,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): MemoryPayload {
    const pairs = clamp(ctx.config.itemCount, 6, 24)
    // Short text only: a memory tile has to be readable face-up at a glance.
    const items = buildPrompts(ctx, pairs, { maxPromptLength: 40, maxAnswerLength: 14 })

    const tiles = ctx.rng.shuffle(
      items.flatMap((item, i) => [
        { pairId: i + 1, text: item.compact, side: 'prompt' as const },
        { pairId: i + 1, text: item.answer, side: 'answer' as const },
      ]),
    )

    // Tiles carry only one short phrase each, so they take a dense template.
    const longestTile = Math.max(...tiles.map((t) => t.text.length), 0)
    const template = chooseCardSheet({ contentLength: longestTile, minPerSheet: 12, maxPerSheet: 30 })
    return {
      items,
      tiles,
      cols: template.cols,
      rows: template.rows,
      variant: `${pairs} pairs, ${tiles.length} tiles, ${template.label.toLowerCase()}`,
    }
  },

  validate(payload, ctx) {
    const base = validatePrompts(payload.items, clamp(ctx.config.itemCount, 6, 24))
    const counts = new Map<number, number>()
    for (const tile of payload.tiles) counts.set(tile.pairId, (counts.get(tile.pairId) ?? 0) + 1)
    const balanced = Array.from(counts.values()).every((n) => n === 2)
    return {
      ok: base.ok && balanced,
      issues: [
        ...base.issues,
        ...(balanced ? [] : [{ severity: 'error' as const, code: 'memory.unbalanced', message: 'A pair does not have exactly two tiles.' }]),
      ],
    }
  },

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.items.map((item, i) => ({ label: `Pair ${i + 1}.`, answer: `${item.compact}  <->  ${item.answer}` })),
      notes: ['Use this list to settle disputes about whether two tiles match.'],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Memory Match',
      [
        'Print the tile sheets, then print the card-back sheet on the reverse (or glue them onto card).',
        'Cut out all tiles and lay them face down in a grid.',
        'Turn over two tiles. If they make a matching pair, keep them and go again.',
        'If they do not match, turn them back over and play passes to the next person.',
        'The player with the most pairs when the table is clear wins.',
      ],
      { Pairs: payload.items.length, Tiles: payload.tiles.length, 'Per sheet': payload.cols * payload.rows },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx, undefined, 'cards')

    layoutCardPages(b, theme, ctx, {
      items: payload.tiles,
      cols: payload.cols,
      rows: payload.rows,
      instructions: ctx.meta.instructions,
      label: 'Tiles',
      backLabel: 'Tile backs',
      render: (doc, th, card, tile) => {
        drawSimpleCard(doc, th, card, {
          body: tile.text,
          bodySize: 14,
        })
      },
      renderBack: (doc, th, card) => {
        // A uniform back: identical on every tile so nothing gives a pair away.
        doc.rect(card.x, card.y, card.w, card.h, {
          fill: th.colors.accentSoft,
          stroke: th.colors.grid,
          lineWidth: 0.45,
          radius: 2,
        })
        drawMotif(
          doc,
          th.motif === 'none' ? 'sparkle' : th.motif,
          card.x + card.w / 2,
          card.y + card.h / 2,
          Math.min(card.w, card.h) * 0.5,
          th.colors.accent,
          0.5,
        )
      },
    })

    return finishDoc(b, theme, ctx)
  },
}

/* ------------------------------------------------------------------ *
 * Challenge cards
 * ------------------------------------------------------------------ */

export interface ChallengePayload extends CardsPayload {
  challenges: Array<{ item: PromptItem; action: string; points: number }>
}

const ACTIONS = [
  'Answer this before the timer hits 30 seconds.',
  'Say your answer out loud, then explain how you got it.',
  'Answer it, then make up a similar question for the next player.',
  'Answer with your eyes closed - no writing allowed.',
  'Whisper the answer to the player on your left; they decide if it is right.',
  'Answer it, then give one real-world example.',
  'Draw or act out the answer instead of saying it.',
  'Answer it backwards: give the answer first, then the reason.',
  'Team up with another player - both must agree before answering.',
  'Answer it, then name one thing it reminds you of.',
]

export const challengeCardsGenerator: GameGenerator<ChallengePayload> = {
  id: 'challenge-cards',
  name: 'Challenge Cards',
  description: 'Task cards pairing a question with an action and a points value.',
  category: 'cards',
  glyph: 'CC',
  subjects: ['mathematics', 'english', 'science', 'geography', 'history', 'general-knowledge', 'logic', 'vocabulary'],
  defaults: { itemCount: 16, lengthMinutes: 20, players: '3-4' },
  itemRange: [4, 40],
  itemLabel: 'Cards',
  usesPlayers: true,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): ChallengePayload {
    const count = clamp(ctx.config.itemCount, 4, 40)
    const items = buildPrompts(ctx, count, { maxPromptLength: 120 })
    const challenges = items.map((item) => ({
      item,
      action: ctx.rng.pick(ACTIONS),
      // Harder items are worth more; the weighting keeps scoring meaningful.
      points: ctx.rng.pick([10, 10, 15, 20, 20, 25, 30]),
    }))
    // A challenge card holds a question, an action line and a points badge.
    const longest = Math.max(...challenges.map((c) => c.item.prompt.length + c.action.length), 0)
    const template = chooseCardSheet({ contentLength: longest, minPerSheet: 4, maxPerSheet: 8 })
    return {
      items,
      challenges,
      cols: template.cols,
      rows: template.rows,
      variant: `${count} challenge cards, ${template.label.toLowerCase()}`,
    }
  },

  validate: (payload, ctx) => validatePrompts(payload.items, clamp(ctx.config.itemCount, 4, 40)),

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.challenges.map((c, i) => ({
        label: `${i + 1}. (${c.points} pts)`,
        answer: c.item.answer,
      })),
      notes: ['Point values are printed on each card; total them at the end of the game.'],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Challenge Cards',
      [
        'Cut out the cards and shuffle them into a face-down pile.',
        'On your turn, take the top card and do exactly what it says.',
        'Score the points shown if the group agrees your answer is right.',
        'Play until the pile runs out. The highest score wins.',
      ],
      {
        Cards: payload.challenges.length,
        'Total points': payload.challenges.reduce((a, c) => a + c.points, 0),
        'Per sheet': payload.cols * payload.rows,
      },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx, undefined, 'cards')

    layoutCardPages(b, theme, ctx, {
      items: payload.challenges,
      cols: payload.cols,
      rows: payload.rows,
      instructions: ctx.meta.instructions,
      label: 'Challenge cards',
      render: (doc, th, card, challenge, index) => {
        const bodyTop = drawCardFrame(doc, th, card, {
          headerHeight: 7,
          headerLabel: `Challenge ${index + 1}`,
        })
        const pad = 3.5
        const width = card.w - pad * 2

        // Points badge in the corner.
        doc.circle(card.x + card.w - 7, card.y + 14, 5.4, { fill: th.colors.accent })
        doc.text(card.x + card.w - 7, card.y + 14, String(challenge.points), {
          size: 8.4, align: 'center', weight: 'bold', color: '#ffffff', baseline: 'middle', font: th.fonts.body,
        })

        const qBlock = fitBlock(challenge.item.prompt, width - 12, (card.h - 14) * 0.45, 10.5, th, 5, 'bold')
        qBlock.lines.forEach((line, li) => {
          doc.text(card.x + pad, bodyTop + pad + li * lineHeight(qBlock.size, 1.2), line, {
            size: qBlock.size, weight: 'bold', font: th.fonts.body, color: th.colors.ink, baseline: 'top', maxWidth: width - 12,
          })
        })

        const actionY = bodyTop + pad + qBlock.lines.length * lineHeight(qBlock.size, 1.2) + 3
        doc.line(card.x + pad, actionY - 1.5, card.x + card.w - pad, actionY - 1.5, {
          stroke: th.colors.rule, lineWidth: 0.25, dash: [1, 1],
        })
        const aLines = wrapText(challenge.action, width, 7.6, th.fonts.body)
        aLines.forEach((line, li) => {
          doc.text(card.x + pad, actionY + li * lineHeight(7.6, 1.2), line, {
            size: 7.6, style: 'italic', font: th.fonts.body, color: th.colors.muted, baseline: 'top', maxWidth: width,
          })
        })
      },
    })

    return finishDoc(b, theme, ctx)
  },
}
