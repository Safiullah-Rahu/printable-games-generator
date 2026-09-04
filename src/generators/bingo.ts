import { generateProblemSet, type MathProblem } from '../engines/equations'
import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { drawGrid, drawTable } from '../engines/layout/grid'
import { check, combine, verifyMathProblems } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp, range } from '../utils/misc'
import { fitTextSize } from '../utils/text'
import { baseMeta, finishDoc, playerCount, setupDoc } from './shared'

/**
 * Bingo, in two flavours that share one engine.
 *
 *  - Math Bingo: the caller reads a question, players cover the answer.
 *  - Number Bingo: the caller reads a number, players cover it. Five-column
 *    cards use the traditional per-column ranges (B 1-15, I 16-30 ...), which is
 *    what makes a printed card feel like a real bingo card.
 *
 * The pool is deliberately larger than one card so that no two cards are the
 * same and no single card can be completed too quickly.
 */

export type BingoMode = 'math' | 'number'

export interface BingoCard {
  id: number
  /** null marks the FREE square. */
  grid: Array<Array<number | null>>
}

export interface BingoCall {
  order: number
  call: string
  value: number
  problem?: MathProblem
}

export interface BingoPayload {
  mode: BingoMode
  size: 3 | 4 | 5
  headers: string[]
  cards: BingoCard[]
  calls: BingoCall[]
  freeSpace: boolean
  /** Per-column value ranges, when the classic column layout is in use. */
  columnRanges: Array<[number, number]> | null
  variant: string
}

const HEADERS: Record<number, string[]> = {
  3: ['F', 'U', 'N'],
  4: ['P', 'L', 'A', 'Y'],
  5: ['B', 'I', 'N', 'G', 'O'],
}

function buildPayload(ctx: GenContext, mode: BingoMode): BingoPayload {
  const { rng, profile, config } = ctx
  const size = profile.bingoSize
  const cells = size * size
  const freeSpace = size % 2 === 1
  const perCard = freeSpace ? cells - 1 : cells
  const cards = clamp(playerCount(config.players), 1, 30)

  const headers = HEADERS[size]

  if (mode === 'number') {
    // Classic column ranges keep each column's numbers in its own band.
    const band = size === 5 ? 15 : size === 4 ? 12 : 10
    const columnRanges: Array<[number, number]> = range(size).map((i) => [i * band + 1, (i + 1) * band])

    const cardList: BingoCard[] = range(cards).map((i) => {
      const grid: Array<Array<number | null>> = Array.from({ length: size }, () => Array(size).fill(null))
      for (let c = 0; c < size; c++) {
        const [lo, hi] = columnRanges[c]
        const picks = rng.sample(range(hi - lo + 1, lo), size)
        for (let r = 0; r < size; r++) grid[r][c] = picks[r]
      }
      if (freeSpace) {
        const mid = Math.floor(size / 2)
        grid[mid][mid] = null
      }
      return { id: i + 1, grid }
    })

    // Call every number in every band, shuffled.
    const allNumbers = columnRanges.flatMap(([lo, hi], ci) =>
      range(hi - lo + 1, lo).map((value) => ({ value, column: ci })),
    )
    const calls: BingoCall[] = rng.shuffle(allNumbers).map((n, i) => ({
      order: i + 1,
      call: `${headers[n.column]} - ${n.value}`,
      value: n.value,
    }))

    return {
      mode,
      size,
      headers,
      cards: cardList,
      calls,
      freeSpace,
      columnRanges,
      variant: `${size}x${size} column bingo, ${cards} card${cards === 1 ? '' : 's'}`,
    }
  }

  /* --------------------------- math bingo ---------------------------- */
  // Pool must exceed one card comfortably so cards differ from one another.
  const poolSize = clamp(Math.max(config.itemCount, perCard * 2), perCard + 6, 90)
  const problems = generateProblemSet(poolSize, ctx, {
    integerAnswersOnly: true,
    uniqueAnswers: true,
    answerRange: [0, 999],
    maxQuestionLength: 34,
  })

  const values = problems.map((p) => p.value as number)

  const cardList: BingoCard[] = range(cards).map((i) => {
    const picks = rng.sample(values, perCard)
    const grid: Array<Array<number | null>> = Array.from({ length: size }, () => Array(size).fill(null))
    let k = 0
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (freeSpace && r === Math.floor(size / 2) && c === Math.floor(size / 2)) continue
        grid[r][c] = picks[k++] ?? values[rng.int(0, values.length - 1)]
      }
    }
    return { id: i + 1, grid }
  })

  const calls: BingoCall[] = rng.shuffle(problems).map((p, i) => ({
    order: i + 1,
    call: p.question.replace(/\s*=\s*\?$/, ''),
    value: p.value as number,
    problem: p,
  }))

  return {
    mode,
    size,
    headers,
    cards: cardList,
    calls,
    freeSpace,
    columnRanges: null,
    variant: `${size}x${size} math bingo, ${cards} card${cards === 1 ? '' : 's'}, ${problems.length} calls`,
  }
}

function validateBingo(payload: BingoPayload) {
  const { cards, calls, size, freeSpace } = payload
  const callValues = new Set(calls.map((c) => c.value))
  const expectedFilled = size * size - (freeSpace ? 1 : 0)

  const structural = check([
    [cards.length > 0, 'bingo.no-cards', 'No bingo cards were produced.'],
    [calls.length >= expectedFilled, 'bingo.short-pool', `Only ${calls.length} calls for ${expectedFilled} squares.`],
    [new Set(calls.map((c) => c.value)).size === calls.length, 'bingo.dup-call', 'Two calls share the same answer.'],
  ])

  const cardChecks = cards.map((card) => {
    const flat = card.grid.flat().filter((v): v is number => v !== null)
    if (flat.length !== expectedFilled) {
      return { ok: false, issues: [{ severity: 'error' as const, code: 'bingo.card-size', message: `Card ${card.id} has ${flat.length} numbers, expected ${expectedFilled}.` }] }
    }
    if (new Set(flat).size !== flat.length) {
      return { ok: false, issues: [{ severity: 'error' as const, code: 'bingo.card-dup', message: `Card ${card.id} repeats a number.` }] }
    }
    // Every square must be reachable, or a player could never complete a line.
    const unreachable = flat.filter((v) => !callValues.has(v))
    if (unreachable.length > 0) {
      return { ok: false, issues: [{ severity: 'error' as const, code: 'bingo.unreachable', message: `Card ${card.id} contains ${unreachable.length} value(s) that are never called.` }] }
    }
    return { ok: true, issues: [] }
  })

  const mathChecks = payload.calls
    .map((c) => c.problem)
    .filter((p): p is MathProblem => Boolean(p))

  return combine(structural, ...cardChecks, verifyMathProblems(mathChecks))
}

function layoutBingo(payload: BingoPayload, ctx: LayoutContext): PrintDoc {
  const { builder: b, theme } = setupDoc(ctx)
  const { cards, size, headers, calls, freeSpace } = payload

  // One big card per page when only a couple of players; two when a class needs
  // a stack of them - the sheet stays readable and the paper count stays sane.
  const cardsPerPage = cards.length <= 2 ? 1 : 2

  // Page geometry is computed ONCE per sheet and then sliced into equal slots.
  // Deriving the second card's slot from wherever the first one finished is the
  // obvious-looking approach and produces unreadably small cards.
  let pageTop = 0

  cards.forEach((card, i) => {
    const slotIndex = i % cardsPerPage
    if (slotIndex === 0) {
      pageTop = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: `Card ${card.id}`,
        role: 'cards',
        tag: `Card ${card.id} of ${cards.length}`,
        nameLine: cardsPerPage === 1 && ctx.config.nameLine,
      })
      if (i === 0 && ctx.config.includeInstructions) {
        pageTop = drawInstructions(b, theme, pageTop, ctx.meta.instructions)
      }
    }

    const slotHeight = (b.bottom - pageTop) / cardsPerPage
    let y = pageTop + slotIndex * slotHeight
    const headerH = Math.min(12, slotHeight * 0.1)
    const labelH = cardsPerPage > 1 ? 5 : 0
    const cell = Math.max(
      4,
      Math.min(
        (b.contentWidth * (cardsPerPage === 1 ? 0.86 : 0.66)) / size,
        (slotHeight - headerH - labelH - 6) / size,
      ),
    )
    const gridW = cell * size
    const gridX = b.left + (b.contentWidth - gridW) / 2

    if (cardsPerPage > 1) {
      b.text(gridX, y, `Card ${card.id}`, {
        size: 8.5,
        weight: 'bold',
        color: theme.colors.muted,
        baseline: 'top',
        font: theme.fonts.body,
      })
      y += labelH
    }

    drawGrid(b, {
      x: gridX,
      y,
      cols: size,
      rows: size,
      cell,
      stroke: theme.colors.grid,
      lineWidth: 0.35,
      outerLineWidth: 0.9,
      colHeaders: headers,
      colHeaderHeight: headerH,
      colHeaderStyle: {
        fill: theme.colors.band === '#ffffff' ? theme.colors.accentSoft : theme.colors.band,
        color: theme.colors.band === '#ffffff' ? theme.colors.accent : theme.colors.bandText,
        size: headerH * 1.5,
        font: theme.fonts.heading,
      },
      style: (r, c) => {
        const value = card.grid[r][c]
        if (value === null) {
          return {
            fill: theme.colors.accentSoft,
            text: 'FREE',
            textSize: fitTextSize('FREE', cell * 0.86, cell * 1.3, 3.2, theme.fonts.heading, 'bold'),
            textWeight: 'bold',
            textColor: theme.colors.accent,
            textFont: theme.fonts.heading,
          }
        }
        const label = String(value)
        return {
          text: label,
          textSize: fitTextSize(label, cell * 0.86, cell * 1.5, 3.6, theme.fonts.grid, 'bold'),
          textWeight: 'bold',
          textFont: theme.fonts.grid,
          textColor: theme.colors.ink,
        }
      },
    })

  })

  /* ---------------------------- call sheet ---------------------------- */
  const callsToPrint = calls.slice(0, Math.min(calls.length, 60))
  let cy = startGamePage(b, theme, ctx.meta, ctx.config, {
    label: 'Caller sheet',
    role: 'game',
    tag: 'CALLER SHEET',
    nameLine: false,
  })
  cy = drawInstructions(b, theme, cy, [
    'Call items in the order listed, or shuffle by cutting the list into strips.',
    'Tick each call as you make it so you can check a winning card afterwards.',
    payload.mode === 'math'
      ? 'Read out the question only. Players cover the answer on their card.'
      : 'Read out the letter and the number, e.g. "B - 12".',
  ], { heading: 'For the caller' })

  cy = drawSectionTitle(b, theme, cy, 'Call list')

  const columns = payload.mode === 'math' ? 2 : 3
  const gutter = 5
  const tableW = (b.contentWidth - gutter * (columns - 1)) / columns
  const perColumn = Math.ceil(callsToPrint.length / columns)

  for (let ci = 0; ci < columns; ci++) {
    const slice = callsToPrint.slice(ci * perColumn, (ci + 1) * perColumn)
    if (slice.length === 0) continue
    drawTable(b, {
      x: b.left + ci * (tableW + gutter),
      y: cy,
      width: tableW,
      rowHeight: 5.4,
      columns: [
        { label: '#', width: tableW * 0.13, align: 'center' },
        { label: payload.mode === 'math' ? 'Question' : 'Call', width: tableW * 0.55 },
        { label: 'Answer', width: tableW * 0.32, align: 'center' },
      ],
      rows: slice.map((c) => [String(c.order), c.call, String(c.value)]),
      headerFill: theme.colors.accentSoft,
      headerColor: theme.colors.accent,
      stripeFill: theme.colors.gridAlt,
      stroke: theme.colors.rule,
      size: 7.4,
      font: theme.fonts.body,
    })
  }

  const key: AnswerKey = {
    entries: callsToPrint.map((c) => ({ label: `${c.order}.`, answer: `${c.call} = ${c.value}` })),
    notes: [
      `${cards.length} unique card${cards.length === 1 ? '' : 's'} were generated; no two are identical.`,
      freeSpace ? 'The centre square is FREE and counts towards every line.' : 'There is no free square on this card size.',
    ],
  }

  return finishDoc(b, theme, ctx, key)
}

function bingoMeta(payload: BingoPayload, ctx: GenContext, title: string): GameMeta {
  return baseMeta(
    ctx.config,
    title,
    [
      'Give every player a card and something to cover squares with.',
      payload.mode === 'math'
        ? 'The caller reads a question. Work out the answer and cover it if it is on your card.'
        : 'The caller reads a letter and number. Cover that square if you have it.',
      payload.freeSpace ? 'The centre FREE square is covered from the start.' : 'Every square must be earned on this card size.',
      'Call "Bingo!" when you complete a full row, column or diagonal.',
      'The caller checks the winning card against the call sheet.',
    ],
    {
      Cards: payload.cards.length,
      Card: `${payload.size} x ${payload.size}`,
      Calls: payload.calls.length,
      Free: payload.freeSpace ? 'Yes' : 'No',
    },
    payload.variant,
  )
}

export const mathBingoGenerator: GameGenerator<BingoPayload> = {
  id: 'math-bingo',
  name: 'Math Bingo',
  description: 'Bingo cards covered by solving called questions, plus a caller sheet.',
  category: 'math',
  glyph: 'MB',
  subjects: ['mathematics'],
  defaults: { itemCount: 40, lengthMinutes: 20, players: '3-4', subject: 'mathematics' },
  itemRange: [20, 90],
  itemLabel: 'Calls',
  usesPlayers: true,
  orientations: ['portrait', 'landscape'],

  generate: (ctx) => buildPayload(ctx, 'math'),
  validate: (payload) => validateBingo(payload),
  generateAnswerKey: (payload): AnswerKey => ({
    entries: payload.calls.map((c) => ({ label: `${c.order}.`, answer: `${c.call} = ${c.value}` })),
    notes: ['Every call and its answer, in the order printed on the caller sheet.'],
  }),
  meta: (payload, ctx) => bingoMeta(payload, ctx, 'Math Bingo'),
  layout: layoutBingo,
}

export const numberBingoGenerator: GameGenerator<BingoPayload> = {
  id: 'number-bingo',
  name: 'Number Bingo',
  description: 'Traditional number bingo cards with lettered columns and a caller sheet.',
  category: 'math',
  glyph: 'NB',
  subjects: ['mathematics'],
  defaults: { itemCount: 50, lengthMinutes: 15, players: 'classroom', subject: 'mathematics' },
  itemRange: [20, 90],
  itemLabel: 'Calls',
  usesPlayers: true,
  orientations: ['portrait', 'landscape'],

  generate: (ctx) => buildPayload(ctx, 'number'),
  validate: (payload) => validateBingo(payload),
  generateAnswerKey: (payload): AnswerKey => ({
    entries: payload.calls.slice(0, 60).map((c) => ({ label: `${c.order}.`, answer: c.call })),
    notes: ['Calls are listed in draw order; cross each one off as you call it.'],
  }),
  meta: (payload, ctx) => bingoMeta(payload, ctx, 'Number Bingo'),
  layout: layoutBingo,
}
