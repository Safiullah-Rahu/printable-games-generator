import { gridWord } from '../data'
import { selectFacts } from '../engines/content'
import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { drawGrid, fitCellSize } from '../engines/layout/grid'
import { check, combine } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp } from '../utils/misc'
import { lineHeight, wrapText } from '../utils/text'
import { baseMeta, finishDoc, setupDoc } from './shared'

/**
 * Crossword.
 *
 * Classic constructive placement: seed the longest word across the middle, then
 * repeatedly place the word that produces the best-scoring legal intersection.
 * "Legal" is the fiddly part - a placement must not run a new word alongside an
 * existing one, or the grid reads as gibberish even though every cell matched.
 * `canPlace` enforces the three standard adjacency rules that prevent that.
 *
 * The finished grid is cropped to its bounding box and numbered by the usual
 * scan order, so the printed puzzle behaves exactly like a newspaper one.
 */

export interface CrosswordEntry {
  number: number
  word: string
  clue: string
  row: number
  col: number
  direction: 'across' | 'down'
}

export interface CrosswordPayload {
  width: number
  height: number
  /** null = blocked cell. */
  cells: Array<Array<string | null>>
  /** Clue number shown in a cell, keyed "row,col". */
  numbers: Record<string, number>
  entries: CrosswordEntry[]
  variant: string
}

interface Placed {
  word: string
  clue: string
  row: number
  col: number
  direction: 'across' | 'down'
}

const WORK = 34 // working grid edge; cropped before it reaches the payload

type Work = Array<Array<string | null>>

function emptyWork(): Work {
  return Array.from({ length: WORK }, () => Array<string | null>(WORK).fill(null))
}

function cellAt(grid: Work, r: number, c: number): string | null {
  if (r < 0 || r >= WORK || c < 0 || c >= WORK) return null
  return grid[r][c]
}

/**
 * Can `word` be written at (row, col) running in `direction`?
 *
 * Three rules, all of them necessary:
 *  1. every overlapping cell must already hold the same letter;
 *  2. the cells immediately before and after the word must be empty, otherwise
 *     the entry silently extends an existing one;
 *  3. a NEW letter may not have neighbours to its sides, otherwise it forms an
 *     unintended two-letter word running the other way.
 */
function canPlace(grid: Work, word: string, row: number, col: number, direction: 'across' | 'down'): number | null {
  const dr = direction === 'down' ? 1 : 0
  const dc = direction === 'across' ? 1 : 0

  if (row < 1 || col < 1) return null
  const endR = row + dr * (word.length - 1)
  const endC = col + dc * (word.length - 1)
  if (endR >= WORK - 1 || endC >= WORK - 1) return null

  // Rule 2: caps at both ends.
  if (cellAt(grid, row - dr, col - dc) !== null) return null
  if (cellAt(grid, endR + dr, endC + dc) !== null) return null

  let intersections = 0
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i
    const c = col + dc * i
    const existing = cellAt(grid, r, c)

    if (existing !== null) {
      if (existing !== word[i]) return null // Rule 1
      intersections++
      continue
    }

    // Rule 3: a fresh letter must have clear flanks.
    if (direction === 'across') {
      if (cellAt(grid, r - 1, c) !== null || cellAt(grid, r + 1, c) !== null) return null
    } else {
      if (cellAt(grid, r, c - 1) !== null || cellAt(grid, r, c + 1) !== null) return null
    }
  }

  return intersections
}

function write(grid: Work, word: string, row: number, col: number, direction: 'across' | 'down'): void {
  const dr = direction === 'down' ? 1 : 0
  const dc = direction === 'across' ? 1 : 0
  for (let i = 0; i < word.length; i++) grid[row + dr * i][col + dc * i] = word[i]
}

export const crosswordGenerator: GameGenerator<CrosswordPayload> = {
  id: 'crossword',
  name: 'Crossword',
  description: 'Interlocking word grid with numbered Across and Down clues.',
  category: 'literacy',
  glyph: 'CW',
  subjects: ['english', 'science', 'geography', 'history', 'general-knowledge', 'vocabulary', 'mathematics', 'logic'],
  defaults: { itemCount: 14, lengthMinutes: 20, orientation: 'portrait' },
  itemRange: [6, 24],
  itemLabel: 'Clues',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): CrosswordPayload {
    const { rng, profile, config } = ctx
    const want = clamp(config.itemCount, 6, 24)

    const facts = selectFacts(ctx, {
      count: want * 3 + 10,
      minWordLength: 3,
      maxWordLength: clamp(profile.wordLength[1] + 2, 6, 14),
      needsRealClue: true,
      excludeCategories: ['theme'],
    })

    const pool = facts
      .map((f) => ({ word: gridWord(f.term), clue: f.clue }))
      .filter((c) => c.word.length >= 3 && c.word.length <= 14)
      .filter((c, i, arr) => arr.findIndex((o) => o.word === c.word) === i)
      .sort((a, b) => b.word.length - a.word.length)

    if (pool.length === 0) throw new Error('No suitable words for a crossword')

    const grid = emptyWork()
    const placed: Placed[] = []

    // Hard cap on the finished grid. Without it, twenty-plus words sprawl into a
    // 30x30 lattice that is unreadable at print size - so a placement that would
    // push the bounding box past this limit is rejected however well it scores.
    const maxDimension = clamp(Math.max(13, Math.round(Math.sqrt(want) * 4.2)), 13, 21)

    // Seed with the longest word, roughly centred.
    const seed = pool[0]
    const seedRow = Math.floor(WORK / 2)
    const seedCol = Math.floor((WORK - seed.word.length) / 2)
    write(grid, seed.word, seedRow, seedCol, 'across')
    placed.push({ ...seed, row: seedRow, col: seedCol, direction: 'across' })

    const bounds = {
      minR: seedRow,
      maxR: seedRow,
      minC: seedCol,
      maxC: seedCol + seed.word.length - 1,
    }

    /** Would this placement keep the grid inside `maxDimension` on both axes? */
    const fitsBounds = (row: number, col: number, length: number, direction: 'across' | 'down'): boolean => {
      const endR = direction === 'down' ? row + length - 1 : row
      const endC = direction === 'across' ? col + length - 1 : col
      const height = Math.max(bounds.maxR, endR) - Math.min(bounds.minR, row) + 1
      const width = Math.max(bounds.maxC, endC) - Math.min(bounds.minC, col) + 1
      return height <= maxDimension && width <= maxDimension
    }

    const remaining = pool.slice(1)

    // Repeated sweeps: each pass tries every unplaced word against the grid as
    // it now stands, so words that had no home early on often fit later.
    for (let pass = 0; pass < 4 && placed.length < want; pass++) {
      for (let i = 0; i < remaining.length && placed.length < want; i++) {
        const candidate = remaining[i]
        if (!candidate) continue

        let best: { row: number; col: number; direction: 'across' | 'down'; score: number } | null = null

        for (const anchor of placed) {
          const aDr = anchor.direction === 'down' ? 1 : 0
          const aDc = anchor.direction === 'across' ? 1 : 0
          const newDirection: 'across' | 'down' = anchor.direction === 'across' ? 'down' : 'across'

          for (let ai = 0; ai < anchor.word.length; ai++) {
            const ar = anchor.row + aDr * ai
            const ac = anchor.col + aDc * ai

            for (let wi = 0; wi < candidate.word.length; wi++) {
              if (candidate.word[wi] !== anchor.word[ai]) continue
              const row = newDirection === 'down' ? ar - wi : ar
              const col = newDirection === 'across' ? ac - wi : ac
              const intersections = canPlace(grid, candidate.word, row, col, newDirection)
              if (intersections === null || intersections === 0) continue
              if (!fitsBounds(row, col, candidate.word.length, newDirection)) continue

              // Favour more crossings, then compactness near the seed.
              const distance = Math.abs(row - seedRow) + Math.abs(col - seedCol)
              const score = intersections * 10 - distance * 0.12 + rng.next() * 0.8
              if (!best || score > best.score) best = { row, col, direction: newDirection, score }
            }
          }
        }

        if (best) {
          write(grid, candidate.word, best.row, best.col, best.direction)
          placed.push({ ...candidate, row: best.row, col: best.col, direction: best.direction })
          const endR = best.direction === 'down' ? best.row + candidate.word.length - 1 : best.row
          const endC = best.direction === 'across' ? best.col + candidate.word.length - 1 : best.col
          bounds.minR = Math.min(bounds.minR, best.row)
          bounds.maxR = Math.max(bounds.maxR, endR)
          bounds.minC = Math.min(bounds.minC, best.col)
          bounds.maxC = Math.max(bounds.maxC, endC)
          remaining[i] = undefined as unknown as (typeof remaining)[number]
        }
      }
    }

    /* ------------------------- crop and number ------------------------- */
    let minR = WORK
    let maxR = -1
    let minC = WORK
    let maxC = -1
    for (let r = 0; r < WORK; r++) {
      for (let c = 0; c < WORK; c++) {
        if (grid[r][c] !== null) {
          minR = Math.min(minR, r)
          maxR = Math.max(maxR, r)
          minC = Math.min(minC, c)
          maxC = Math.max(maxC, c)
        }
      }
    }

    const height = maxR - minR + 1
    const width = maxC - minC + 1
    const cells: Array<Array<string | null>> = Array.from({ length: height }, (_, r) =>
      Array.from({ length: width }, (_, c) => grid[minR + r][minC + c]),
    )

    const numbers: Record<string, number> = {}
    const entries: CrosswordEntry[] = []
    let counter = 0

    for (let r = 0; r < height; r++) {
      for (let c = 0; c < width; c++) {
        if (cells[r][c] === null) continue
        const startsAcross = (c === 0 || cells[r][c - 1] === null) && c + 1 < width && cells[r][c + 1] !== null
        const startsDown = (r === 0 || cells[r - 1][c] === null) && r + 1 < height && cells[r + 1][c] !== null
        if (!startsAcross && !startsDown) continue

        counter++
        numbers[`${r},${c}`] = counter

        if (startsAcross) {
          let word = ''
          let cc = c
          while (cc < width && cells[r][cc] !== null) word += cells[r][cc++]
          const source = placed.find((p) => p.word === word && p.direction === 'across')
          entries.push({
            number: counter,
            word,
            clue: source?.clue ?? `${word.length} letters`,
            row: r,
            col: c,
            direction: 'across',
          })
        }
        if (startsDown) {
          let word = ''
          let rr = r
          while (rr < height && cells[rr][c] !== null) word += cells[rr++][c]
          const source = placed.find((p) => p.word === word && p.direction === 'down')
          entries.push({
            number: counter,
            word,
            clue: source?.clue ?? `${word.length} letters`,
            row: r,
            col: c,
            direction: 'down',
          })
        }
      }
    }

    return {
      width,
      height,
      cells,
      numbers,
      entries,
      variant: `${width} x ${height}, ${entries.length} entries`,
    }
  },

  validate(payload, ctx) {
    const want = clamp(ctx.config.itemCount, 6, 24)
    const { cells, width, height, entries } = payload

    const structural = check([
      [width > 0 && height > 0, 'cw.empty', 'Crossword grid is empty.'],
      [width <= 22 && height <= 22, 'cw.too-big', `Grid ${width} x ${height} will not print legibly.`],
      [entries.length >= Math.min(6, want), 'cw.too-few', `Only ${entries.length} entries were placed.`],
      [entries.length >= Math.min(want, 8), 'cw.thin', `Only ${entries.length} entries fit inside a printable grid.`],
      [entries.length >= want * 0.6, 'cw.short', `Placed ${entries.length} of ${want} requested clues.`, 'warning'],
      [entries.every((e) => e.word.length >= 3), 'cw.short-word', 'An entry shorter than three letters was created.'],
      [entries.every((e) => e.clue.trim().length > 0), 'cw.no-clue', 'An entry has no clue.'],
    ])

    // Read every entry straight out of the grid rather than trusting the record.
    const readback = entries.map((e) => {
      let text = ''
      for (let i = 0; i < e.word.length; i++) {
        const r = e.direction === 'down' ? e.row + i : e.row
        const c = e.direction === 'across' ? e.col + i : e.col
        const value = cells[r]?.[c]
        if (!value) {
          return { ok: false, issues: [{ severity: 'error' as const, code: 'cw.gap', message: `Entry ${e.number} has a gap.` }] }
        }
        text += value
      }
      return text === e.word
        ? { ok: true, issues: [] }
        : { ok: false, issues: [{ severity: 'error' as const, code: 'cw.mismatch', message: `Entry ${e.number} does not read as ${e.word}.` }] }
    })

    return combine(structural, ...readback)
  },

  generateAnswerKey(payload): AnswerKey {
    const sorted = [...payload.entries].sort(
      (a, b) => (a.direction === b.direction ? a.number - b.number : a.direction === 'across' ? -1 : 1),
    )
    return {
      entries: sorted.map((e) => ({
        label: `${e.number} ${e.direction === 'across' ? 'Across' : 'Down'}`,
        answer: e.word,
      })),
      notes: ['The completed grid is printed on the solution page.'],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Crossword Puzzle',
      [
        'Read each clue and write the answer into the numbered squares.',
        'Across clues run left to right; Down clues run top to bottom.',
        'Letters shared between two answers must agree - use them to check your work.',
        'Write in pencil so you can change an answer that does not fit.',
      ],
      {
        Clues: payload.entries.length,
        Grid: `${payload.width} x ${payload.height}`,
        Across: payload.entries.filter((e) => e.direction === 'across').length,
        Down: payload.entries.filter((e) => e.direction === 'down').length,
      },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)
    const { cells, width, height, numbers, entries } = payload

    const across = entries.filter((e) => e.direction === 'across').sort((a, b2) => a.number - b2.number)
    const down = entries.filter((e) => e.direction === 'down').sort((a, b2) => a.number - b2.number)

    let y = startGamePage(b, theme, ctx.meta, ctx.config)
    if (ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, ctx.meta.instructions.slice(0, 3))
    }

    /* --------------------- measure the clues first ---------------------- */
    // Sizing the grid against a fixed percentage wastes a third of the sheet on
    // a short clue list. Measure what the clues actually need, then hand the
    // grid everything that is left.
    const clueSize = 8
    const colGap = 6
    const colW = (b.contentWidth - colGap) / 2

    const clueBlockHeight = (list: CrosswordEntry[]): number =>
      list.reduce(
        (acc, e) =>
          acc + wrapText(`${e.clue} (${e.word.length})`, colW - 7, clueSize, theme.fonts.body).length
            * lineHeight(clueSize, 1.22) + 0.6,
        lineHeight(9.5, 1.55),
      )

    const cluesHeight = Math.max(clueBlockHeight(across), clueBlockHeight(down))
    const gridBudget = Math.max((b.bottom - y) * 0.35, b.bottom - y - cluesHeight - 10)
    const cell = fitCellSize(width, height, b.contentWidth * 0.98, gridBudget, 14, 5)
    const gridX = b.left + (b.contentWidth - cell * width) / 2

    drawGrid(b, {
      x: gridX,
      y,
      cols: width,
      rows: height,
      cell,
      stroke: theme.colors.grid,
      lineWidth: 0.35,
      // Criss-cross style: blank cells are simply absent, so the puzzle reads as
      // interlocking words rather than as a mostly-black newspaper grid - and it
      // uses a fraction of the toner.
      outerLineWidth: 0,
      style: (r, c) => {
        if (cells[r][c] === null) return { noBorder: true }
        const n = numbers[`${r},${c}`]
        return {
          fill: '#ffffff',
          corner: n ? String(n) : undefined,
          cornerSize: Math.max(3.4, cell * 0.72),
          cornerColor: theme.colors.muted,
        }
      },
    })

    y += height * cell + 6

    /* ------------------------------ clues ------------------------------ */
    const renderClues = (
      title: string,
      list: CrosswordEntry[],
      x: number,
      startY: number,
      maxY: number,
    ): { y: number; overflow: CrosswordEntry[] } => {
      let cy = drawSectionTitle(b, theme, startY, title, { x, width: colW, size: 9.5 })
      for (let i = 0; i < list.length; i++) {
        const e = list[i]
        const label = `${e.number}.`
        const text = `${e.clue} (${e.word.length})`
        const lines = wrapText(text, colW - 7, clueSize, theme.fonts.body)
        const blockH = lines.length * lineHeight(clueSize, 1.22)
        if (cy + blockH > maxY) return { y: cy, overflow: list.slice(i) }
        b.text(x, cy, label, {
          size: clueSize,
          weight: 'bold',
          font: theme.fonts.body,
          color: theme.colors.accent,
          baseline: 'top',
        })
        lines.forEach((line, li) => {
          b.text(x + 6.5, cy + li * lineHeight(clueSize, 1.22), line, {
            size: clueSize,
            font: theme.fonts.body,
            color: theme.colors.ink,
            baseline: 'top',
            maxWidth: colW - 7,
          })
        })
        cy += blockH + 0.6
      }
      return { y: cy, overflow: [] }
    }

    const leftResult = renderClues('Across', across, b.left, y, b.bottom)
    const rightResult = renderClues('Down', down, b.left + colW + colGap, y, b.bottom)

    // Anything that did not fit continues on its own page rather than being cut.
    if (leftResult.overflow.length || rightResult.overflow.length) {
      const cy = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: 'Clues (continued)',
        tag: 'CLUES CONTINUED',
        nameLine: false,
        compact: true,
      })
      if (leftResult.overflow.length) renderClues('Across (continued)', leftResult.overflow, b.left, cy, b.bottom)
      if (rightResult.overflow.length) {
        renderClues('Down (continued)', rightResult.overflow, b.left + colW + colGap, cy, b.bottom)
      }
    }

    /* --------------------------- solution grid -------------------------- */
    if (ctx.config.includeAnswerKey) {
      const sy = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: 'Solution grid',
        role: 'answerKey',
        tag: 'SOLUTION',
        nameLine: false,
      })
      const solCell = fitCellSize(width, height, b.contentWidth, b.bottom - sy - 6, 13, 5)
      drawGrid(b, {
        x: b.left + (b.contentWidth - solCell * width) / 2,
        y: sy,
        cols: width,
        rows: height,
        cell: solCell,
        stroke: theme.colors.grid,
        lineWidth: 0.35,
        outerLineWidth: 0,
        style: (r, c) => {
          const value = cells[r][c]
          if (value === null) return { noBorder: true }
          const n = numbers[`${r},${c}`]
          return {
            fill: theme.colors.highlight,
            text: value,
            textSize: solCell * 1.7,
            textWeight: 'bold',
            textFont: theme.fonts.grid,
            textColor: theme.colors.ink,
            corner: n ? String(n) : undefined,
            cornerSize: Math.max(3.2, solCell * 0.62),
            cornerColor: theme.colors.muted,
          }
        },
      })
    }

    return finishDoc(b, theme, ctx)
  },
}
