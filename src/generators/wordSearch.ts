import { gridWord } from '../data'
import { selectFacts } from '../engines/content'
import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { drawGrid, fitCellSize } from '../engines/layout/grid'
import { check, combine, ok } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp } from '../utils/misc'
import { fitTextSize } from '../utils/text'
import { baseMeta, finishDoc, setupDoc } from './shared'

/**
 * Word search.
 *
 * Placement is a randomised best-of-N search rather than pure trial and error:
 * every candidate position is scored on how many letters it shares with words
 * already on the grid, and the highest-scoring placement wins. Interlocking
 * words make a denser, better-looking puzzle and leave less room for the filler
 * letters that would otherwise give answers away by their sparseness.
 */

const DIRECTIONS: Array<{ dr: number; dc: number; name: string }> = [
  { dr: 0, dc: 1, name: 'right' },
  { dr: 1, dc: 0, name: 'down' },
  { dr: 1, dc: 1, name: 'down-right' },
  { dr: -1, dc: 1, name: 'up-right' },
  { dr: 0, dc: -1, name: 'left' },
  { dr: -1, dc: 0, name: 'up' },
  { dr: 1, dc: -1, name: 'down-left' },
  { dr: -1, dc: -1, name: 'up-left' },
]

export interface WordPlacement {
  word: string
  clue: string
  row: number
  col: number
  dr: number
  dc: number
  direction: string
}

export interface WordSearchPayload {
  size: number
  grid: string[][]
  placements: WordPlacement[]
  /** Bonus counting challenge, in the spirit of classic printed word searches. */
  bonus: { word: string; count: number } | null
  variant: string
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Counts every occurrence of `word` in the grid, across all eight directions. */
function countOccurrences(grid: string[][], word: string): number {
  const size = grid.length
  let total = 0
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const { dr, dc } of DIRECTIONS) {
        const endR = r + dr * (word.length - 1)
        const endC = c + dc * (word.length - 1)
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue
        let match = true
        for (let i = 0; i < word.length; i++) {
          if (grid[r + dr * i][c + dc * i] !== word[i]) {
            match = false
            break
          }
        }
        if (match) total++
      }
    }
  }
  return total
}

function findWord(grid: string[][], word: string): { row: number; col: number; dr: number; dc: number } | null {
  const size = grid.length
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const { dr, dc } of DIRECTIONS) {
        const endR = r + dr * (word.length - 1)
        const endC = c + dc * (word.length - 1)
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue
        let match = true
        for (let i = 0; i < word.length; i++) {
          if (grid[r + dr * i][c + dc * i] !== word[i]) {
            match = false
            break
          }
        }
        if (match) return { row: r, col: c, dr, dc }
      }
    }
  }
  return null
}

export const wordSearchGenerator: GameGenerator<WordSearchPayload> = {
  id: 'word-search',
  name: 'Word Search',
  description: 'Hidden words in a letter grid, with a clue list and solution key.',
  category: 'literacy',
  glyph: 'WS',
  subjects: ['english', 'science', 'geography', 'history', 'general-knowledge', 'vocabulary', 'mathematics', 'logic'],
  defaults: { itemCount: 14, lengthMinutes: 15, orientation: 'portrait' },
  itemRange: [6, 30],
  itemLabel: 'Words',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): WordSearchPayload {
    const { rng, profile, config } = ctx
    const wantWords = clamp(config.itemCount, 6, 30)

    // Grid must comfortably hold the longest word plus filler around it.
    const maxWordLen = clamp(profile.wordLength[1], 4, 13)
    const requested = Math.max(profile.gridSize, Math.ceil(Math.sqrt(wantWords * 9)))
    const size = clamp(Math.max(requested, maxWordLen + 2), 8, 22)

    const facts = selectFacts(ctx, {
      count: wantWords + 12,
      minWordLength: clamp(profile.wordLength[0], 3, 5),
      maxWordLength: Math.min(maxWordLen, size - 1),
      includeThemeWords: true,
      singleWordOnly: false,
    })

    const directions = DIRECTIONS.slice(0, profile.wordSearchDirections)
    const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''))
    const placements: WordPlacement[] = []

    // Longest first: the hardest words to place go down while the grid is empty.
    const candidates = facts
      .map((f) => ({ fact: f, word: gridWord(f.term) }))
      .filter((c) => c.word.length >= 3 && c.word.length <= size)
      .sort((a, b) => b.word.length - a.word.length)

    const seen = new Set<string>()

    for (const candidate of candidates) {
      if (placements.length >= wantWords) break
      if (seen.has(candidate.word)) continue

      // Score every legal placement; prefer the one that shares most letters.
      let best: { row: number; col: number; dr: number; dc: number; name: string; score: number } | null = null
      const tries = 220
      for (let t = 0; t < tries; t++) {
        const dir = rng.pick(directions)
        const row = rng.int(0, size - 1)
        const col = rng.int(0, size - 1)
        const endR = row + dir.dr * (candidate.word.length - 1)
        const endC = col + dir.dc * (candidate.word.length - 1)
        if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue

        let score = 0
        let fits = true
        for (let i = 0; i < candidate.word.length; i++) {
          const cell = grid[row + dir.dr * i][col + dir.dc * i]
          if (cell === '') continue
          if (cell === candidate.word[i]) score += 3
          else {
            fits = false
            break
          }
        }
        if (!fits) continue
        // A small random nudge keeps two runs with the same seed-free config
        // from always producing the identical arrangement.
        const total = score + rng.next()
        if (!best || total > best.score) {
          best = { row, col, dr: dir.dr, dc: dir.dc, name: dir.name, score: total }
        }
      }

      if (!best) continue
      for (let i = 0; i < candidate.word.length; i++) {
        grid[best.row + best.dr * i][best.col + best.dc * i] = candidate.word[i]
      }
      seen.add(candidate.word)
      placements.push({
        word: candidate.word,
        clue: candidate.fact.clue,
        row: best.row,
        col: best.col,
        dr: best.dr,
        dc: best.dc,
        direction: best.name,
      })
    }

    // Fill: draw from the letters actually used, so filler blends in instead of
    // standing out as a wall of Q, X and Z.
    const pool = placements.flatMap((p) => p.word.split('')).join('') + LETTERS
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === '') grid[r][c] = pool[rng.int(0, pool.length - 1)]
      }
    }

    // Bonus counting challenge on a short common word.
    let bonus: WordSearchPayload['bonus'] = null
    const bonusCandidates = ['CAT', 'SUN', 'RUN', 'TOP', 'EAR', 'ONE', 'RED', 'TEN']
    for (const word of ctx.rng.shuffle(bonusCandidates)) {
      const count = countOccurrences(grid, word)
      if (count >= 2 && count <= 12) {
        bonus = { word, count }
        break
      }
    }

    return {
      size,
      grid,
      placements,
      bonus,
      variant: `${size}x${size}, ${directions.length} directions`,
    }
  },

  validate(payload, ctx) {
    const { size, grid, placements } = payload
    const requested = clamp(ctx.config.itemCount, 6, 30)

    const structural = check([
      [grid.length === size && grid.every((r) => r.length === size), 'ws.shape', 'Grid is not square.'],
      [grid.every((r) => r.every((c) => /^[A-Z]$/.test(c))), 'ws.letters', 'Grid contains a non-letter cell.'],
      [placements.length >= Math.min(requested, 6), 'ws.too-few', `Only placed ${placements.length} of ${requested} words.`],
      [new Set(placements.map((p) => p.word)).size === placements.length, 'ws.duplicate', 'A word was placed twice.'],
      [placements.length >= requested * 0.8, 'ws.short', `Placed ${placements.length} of ${requested} requested words.`, 'warning'],
    ])

    // Independent check: read every word back out of the finished grid rather
    // than trusting the placement records.
    const readback = placements.map((p) => {
      let text = ''
      for (let i = 0; i < p.word.length; i++) {
        const r = p.row + p.dr * i
        const c = p.col + p.dc * i
        if (r < 0 || r >= size || c < 0 || c >= size) return { ok: false, issues: [{ severity: 'error' as const, code: 'ws.oob', message: `${p.word} runs off the grid.` }] }
        text += grid[r][c]
      }
      if (text !== p.word) {
        return { ok: false, issues: [{ severity: 'error' as const, code: 'ws.mismatch', message: `${p.word} is not readable at its recorded position.` }] }
      }
      return findWord(grid, p.word)
        ? ok()
        : { ok: false, issues: [{ severity: 'error' as const, code: 'ws.unfindable', message: `${p.word} cannot be found in the grid.` }] }
    })

    return combine(structural, ...readback)
  },

  generateAnswerKey(payload): AnswerKey {
    const entries = payload.placements
      .slice()
      .sort((a, b) => a.word.localeCompare(b.word))
      .map((p) => ({
        label: p.word,
        answer: `row ${p.row + 1}, col ${p.col + 1} (${p.direction})`,
      }))
    const notes = ['Letters forming answers are shaded on the solution grid.']
    if (payload.bonus) {
      notes.push(`Bonus: "${payload.bonus.word}" appears ${payload.bonus.count} times in the grid.`)
    }
    return { entries, notes }
  },

  meta(payload, ctx): GameMeta {
    const instructions = [
      'Find and circle every word from the list inside the letter grid.',
      `Words run in ${ctx.profile.wordSearchDirections >= 6 ? 'any direction, including backwards and diagonally' : ctx.profile.wordSearchDirections >= 4 ? 'straight lines and diagonals' : 'straight lines across and down'}.`,
      'Tick each word off the list as you find it.',
    ]
    if (payload.bonus) {
      instructions.push(`Bonus challenge: how many times does "${payload.bonus.word}" appear anywhere in the grid?`)
    }
    return baseMeta(
      ctx.config,
      `${titleForSubject(ctx)} Word Search`,
      instructions,
      { Words: payload.placements.length, Grid: `${payload.size} x ${payload.size}`, Directions: ctx.profile.wordSearchDirections },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)
    const { size, grid, placements } = payload

    /* ---------------------------- puzzle page --------------------------- */
    let y = startGamePage(b, theme, ctx.meta, ctx.config)
    if (ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, ctx.meta.instructions)
    }

    // Reserve room for the word list, then give the grid everything else.
    const listCols = ctx.config.orientation === 'landscape' ? 4 : 3
    const listRows = Math.ceil(placements.length / listCols)
    const listHeight = listRows * 5 + 10
    const gridBudgetH = b.bottom - y - listHeight - 6
    const cell = fitCellSize(size, size, b.contentWidth, gridBudgetH, 15, 4)
    const gridW = cell * size
    const gridX = b.left + (b.contentWidth - gridW) / 2

    drawGrid(b, {
      x: gridX,
      y,
      cols: size,
      rows: size,
      cell,
      stroke: theme.colors.grid,
      lineWidth: 0.18,
      outerLineWidth: 0.8,
      style: (r, c) => ({
        text: grid[r][c],
        textSize: cell * 1.75,
        textFont: theme.fonts.grid,
        textColor: theme.colors.ink,
        fill: (r + c) % 2 === 0 ? undefined : theme.colors.gridAlt,
      }),
    })

    y += size * cell + 6

    /* ----------------------------- word list ---------------------------- */
    y = drawSectionTitle(b, theme, y, 'Find these words')
    const colW = b.contentWidth / listCols
    placements.forEach((p, i) => {
      const col = i % listCols
      const row = Math.floor(i / listCols)
      const x = b.left + col * colW
      const wy = y + row * 5
      b.rect(x, wy + 0.9, 2.6, 2.6, { stroke: theme.colors.rule, lineWidth: 0.3 })
      const textSize = fitTextSize(p.word, colW - 8, 8.6, 5.5, theme.fonts.body, 'bold')
      b.text(x + 4.2, wy, p.word, {
        size: textSize,
        weight: 'bold',
        font: theme.fonts.body,
        color: theme.colors.ink,
        baseline: 'top',
        maxWidth: colW - 6,
      })
    })
    y += listRows * 5 + 3

    if (payload.bonus && b.bottom - y > 8) {
      b.text(b.left, y, `Bonus: how many times does "${payload.bonus.word}" appear in the grid?  ______`, {
        size: 8.4,
        style: 'italic',
        font: theme.fonts.body,
        color: theme.colors.muted,
        baseline: 'top',
        maxWidth: b.contentWidth,
      })
    }

    /* --------------------------- solution page -------------------------- */
    if (ctx.config.includeAnswerKey) {
      const solution = new Set<string>()
      for (const p of placements) {
        for (let i = 0; i < p.word.length; i++) {
          solution.add(`${p.row + p.dr * i},${p.col + p.dc * i}`)
        }
      }

      const sy = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: 'Solution grid',
        role: 'answerKey',
        tag: 'SOLUTION',
        nameLine: false,
      })
      const solCell = fitCellSize(size, size, b.contentWidth, b.bottom - sy - 8, 15, 4)
      drawGrid(b, {
        x: b.left + (b.contentWidth - solCell * size) / 2,
        y: sy,
        cols: size,
        rows: size,
        cell: solCell,
        stroke: theme.colors.grid,
        lineWidth: 0.15,
        outerLineWidth: 0.8,
        style: (r, c) => {
          const hit = solution.has(`${r},${c}`)
          return {
            text: grid[r][c],
            textSize: solCell * 1.75,
            textFont: theme.fonts.grid,
            textWeight: hit ? 'bold' : 'normal',
            textColor: hit ? theme.colors.ink : theme.colors.muted,
            fill: hit ? theme.colors.highlight : undefined,
          }
        },
      })
    }

    return finishDoc(b, theme, ctx)
  },
}

function titleForSubject(ctx: GenContext): string {
  const map: Record<string, string> = {
    mathematics: 'Maths',
    english: 'English',
    science: 'Science',
    geography: 'Geography',
    history: 'History',
    'general-knowledge': 'General Knowledge',
    logic: 'Logic',
    vocabulary: 'Vocabulary',
  }
  return map[ctx.config.subject] ?? 'Word'
}
