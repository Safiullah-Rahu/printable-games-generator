import { drawInstructions, startGamePage } from '../engines/layout/components'
import { drawGrid } from '../engines/layout/grid'
import { check, combine } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import type { Rng } from '../utils/rng'
import { clamp, range } from '../utils/misc'
import { baseMeta, finishDoc, setupDoc } from './shared'

/**
 * Sudoku.
 *
 * Two guarantees matter and both are enforced by construction:
 *
 *  1. THE PUZZLE IS SOLVABLE - the solution is generated first, by randomised
 *     backtracking, then cells are removed from it.
 *  2. THE SOLUTION IS UNIQUE - a cell is only removed if the resulting grid
 *     still has exactly one solution. `countSolutions` stops as soon as it finds
 *     a second, so the check stays cheap even on a nearly empty 9x9.
 *
 * Supports 4x4, 6x6 and 9x9 so the same generator serves Kindergarten and adult.
 */

export interface SudokuPuzzle {
  /** 0 = blank. */
  givens: number[][]
  solution: number[][]
  clueCount: number
}

export interface SudokuPayload {
  size: number
  boxW: number
  boxH: number
  puzzles: SudokuPuzzle[]
  variant: string
}

function makeEmpty(size: number): number[][] {
  return Array.from({ length: size }, () => Array(size).fill(0))
}

function isLegal(grid: number[][], row: number, col: number, value: number, boxW: number, boxH: number): boolean {
  const size = grid.length
  for (let i = 0; i < size; i++) {
    if (grid[row][i] === value && i !== col) return false
    if (grid[i][col] === value && i !== row) return false
  }
  const r0 = Math.floor(row / boxH) * boxH
  const c0 = Math.floor(col / boxW) * boxW
  for (let r = r0; r < r0 + boxH; r++) {
    for (let c = c0; c < c0 + boxW; c++) {
      if (grid[r][c] === value && !(r === row && c === col)) return false
    }
  }
  return true
}

function fillGrid(grid: number[][], boxW: number, boxH: number, rng: Rng): boolean {
  const size = grid.length
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== 0) continue
      for (const value of rng.shuffle(range(size, 1))) {
        if (!isLegal(grid, r, c, value, boxW, boxH)) continue
        grid[r][c] = value
        if (fillGrid(grid, boxW, boxH, rng)) return true
        grid[r][c] = 0
      }
      return false
    }
  }
  return true
}

/** Counts solutions, abandoning the search once `cap` have been found. */
function countSolutions(grid: number[][], boxW: number, boxH: number, cap = 2): number {
  const size = grid.length
  let found = 0

  const recurse = (): void => {
    if (found >= cap) return
    // Constraint propagation lite: always branch on the most constrained cell,
    // which turns an intractable search into an instant one on sparse grids.
    let bestR = -1
    let bestC = -1
    let bestOptions: number[] = []
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] !== 0) continue
        const options: number[] = []
        for (let v = 1; v <= size; v++) if (isLegal(grid, r, c, v, boxW, boxH)) options.push(v)
        if (options.length === 0) return
        if (bestR === -1 || options.length < bestOptions.length) {
          bestR = r
          bestC = c
          bestOptions = options
          if (options.length === 1) break
        }
      }
      if (bestOptions.length === 1 && bestR !== -1) break
    }

    if (bestR === -1) {
      found++
      return
    }
    for (const value of bestOptions) {
      grid[bestR][bestC] = value
      recurse()
      grid[bestR][bestC] = 0
      if (found >= cap) return
    }
  }

  recurse()
  return found
}

function makePuzzle(size: number, boxW: number, boxH: number, holesRatio: number, rng: Rng): SudokuPuzzle {
  const solution = makeEmpty(size)
  fillGrid(solution, boxW, boxH, rng)

  const givens = solution.map((row) => row.slice())
  const total = size * size
  const targetHoles = Math.round(total * holesRatio)
  let holes = 0

  for (const index of rng.shuffle(range(total))) {
    if (holes >= targetHoles) break
    const r = Math.floor(index / size)
    const c = index % size
    if (givens[r][c] === 0) continue
    const backup = givens[r][c]
    givens[r][c] = 0
    if (countSolutions(givens, boxW, boxH, 2) !== 1) {
      givens[r][c] = backup // removing it would allow a second solution
    } else {
      holes++
    }
  }

  return { givens, solution, clueCount: total - holes }
}

export const sudokuGenerator: GameGenerator<SudokuPayload> = {
  id: 'sudoku',
  name: 'Sudoku',
  description: 'Number placement puzzles at 4x4, 6x6 or 9x9 with a guaranteed unique solution.',
  category: 'puzzle',
  glyph: 'SU',
  subjects: ['mathematics', 'logic'],
  defaults: { itemCount: 2, lengthMinutes: 20, subject: 'logic', orientation: 'portrait' },
  itemRange: [1, 6],
  itemLabel: 'Puzzles',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): SudokuPayload {
    const { rng, profile, config } = ctx

    // Grid size follows the difficulty score; 6x6 bridges the gap that would
    // otherwise jump straight from a trivial 4x4 to a full 9x9.
    let size: number
    let boxW: number
    let boxH: number
    if (profile.score < 24) {
      size = 4; boxW = 2; boxH = 2
    } else if (profile.score < 40) {
      size = 6; boxW = 3; boxH = 2
    } else {
      size = 9; boxW = 3; boxH = 3
    }

    const count = clamp(config.itemCount, 1, size === 9 ? 4 : 6)
    const puzzles = range(count).map(() =>
      makePuzzle(size, boxW, boxH, profile.sudokuHolesRatio, rng),
    )

    return {
      size,
      boxW,
      boxH,
      puzzles,
      variant: `${size}x${size}, ${count} puzzle${count === 1 ? '' : 's'}`,
    }
  },

  validate(payload) {
    const { puzzles, size, boxW, boxH } = payload

    const results = puzzles.map((puzzle, i) => {
      const label = `Puzzle ${i + 1}`

      // The stored solution must itself be a legal, complete grid.
      let solutionValid = true
      for (let r = 0; r < size && solutionValid; r++) {
        for (let c = 0; c < size; c++) {
          const v = puzzle.solution[r][c]
          if (v < 1 || v > size || !isLegal(puzzle.solution, r, c, v, boxW, boxH)) {
            solutionValid = false
            break
          }
        }
      }

      // The givens must agree with the solution, and the puzzle must have
      // exactly one solution when solved independently.
      const givensAgree = puzzle.givens.every((row, r) =>
        row.every((v, c) => v === 0 || v === puzzle.solution[r][c]),
      )
      const working = puzzle.givens.map((row) => row.slice())
      const solutions = countSolutions(working, boxW, boxH, 2)

      return check([
        [solutionValid, 'sudoku.solution', `${label}: the completed grid breaks a Sudoku rule.`],
        [givensAgree, 'sudoku.givens', `${label}: a given does not match the solution.`],
        [solutions === 1, 'sudoku.uniqueness', `${label}: has ${solutions === 0 ? 'no' : 'more than one'} solution.`],
        [puzzle.clueCount >= Math.ceil(size * size * 0.22), 'sudoku.too-sparse', `${label}: only ${puzzle.clueCount} clues.`, 'warning'],
      ])
    })

    return combine(...results)
  },

  generateAnswerKey(payload): AnswerKey {
    // Row-by-row text so the key is usable even without the printed grid.
    const entries = payload.puzzles.flatMap((puzzle, pi) =>
      puzzle.solution.map((row, ri) => ({
        label: payload.puzzles.length > 1 ? `P${pi + 1} row ${ri + 1}` : `Row ${ri + 1}`,
        answer: row.join(' '),
      })),
    )
    return {
      entries,
      notes: ['Completed grids are printed on the solution page.'],
    }
  },

  meta(payload, ctx): GameMeta {
    const { size, boxW, boxH } = payload
    return baseMeta(
      ctx.config,
      `Sudoku ${size} x ${size}`,
      [
        `Fill every empty square with a number from 1 to ${size}.`,
        `Each row must contain every number from 1 to ${size} exactly once.`,
        `Each column must contain every number from 1 to ${size} exactly once.`,
        `Each outlined ${boxW} x ${boxH} box must also contain every number exactly once.`,
        'Every puzzle here has exactly one solution - no guessing is needed.',
      ],
      {
        Grid: `${size} x ${size}`,
        Puzzles: payload.puzzles.length,
        Clues: payload.puzzles.map((p) => p.clueCount).join(', '),
        Box: `${boxW} x ${boxH}`,
      },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)
    const { size, boxW, boxH, puzzles } = payload

    // How many puzzles share a page: big grids get the page to themselves.
    const perPage = size === 9 ? 1 : size === 6 ? 2 : 4
    const gridCols = perPage === 4 ? 2 : 1
    const gridRows = perPage === 4 ? 2 : perPage

    const renderSheet = (
      list: SudokuPuzzle[],
      solved: boolean,
      startY: number,
    ): void => {
      const areaH = b.bottom - startY
      const slotW = b.contentWidth / gridCols
      const slotH = areaH / gridRows
      const cell = Math.min((slotW - 10) / size, (slotH - 12) / size, perPage === 1 ? 19 : 15)

      list.forEach((puzzle, i) => {
        const col = i % gridCols
        const row = Math.floor(i / gridCols)
        const gw = cell * size
        const x = b.left + col * slotW + (slotW - gw) / 2
        const y = startY + row * slotH + 6

        if (puzzles.length > 1) {
          b.text(x, y - 5, `Puzzle ${puzzles.indexOf(puzzle) + 1}`, {
            size: 8.5,
            weight: 'bold',
            color: theme.colors.muted,
            font: theme.fonts.body,
            baseline: 'top',
          })
        }

        drawGrid(b, {
          x,
          y,
          cols: size,
          rows: size,
          cell,
          stroke: theme.colors.grid,
          lineWidth: 0.22,
          outerLineWidth: 0.9,
          blockEvery: { col: boxW, row: boxH, lineWidth: 0.75 },
          style: (r, c) => {
            const given = puzzle.givens[r][c]
            const value = solved ? puzzle.solution[r][c] : given
            if (value === 0) return { fill: undefined }
            const isGiven = given !== 0
            return {
              text: String(value),
              textSize: cell * 1.7,
              textWeight: isGiven ? 'bold' : 'normal',
              textFont: theme.fonts.grid,
              textColor: isGiven ? theme.colors.ink : theme.colors.accent,
              fill: solved && !isGiven ? theme.colors.highlight : undefined,
            }
          },
        })
      })
    }

    const pages = Math.ceil(puzzles.length / perPage)
    for (let p = 0; p < pages; p++) {
      let y = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: `Puzzles ${p + 1}`,
        tag: pages > 1 ? `Sheet ${p + 1} of ${pages}` : undefined,
        compact: p > 0,
      })
      if (p === 0 && ctx.config.includeInstructions) {
        y = drawInstructions(b, theme, y, ctx.meta.instructions)
      }
      renderSheet(puzzles.slice(p * perPage, (p + 1) * perPage), false, y)
    }

    if (ctx.config.includeAnswerKey) {
      for (let p = 0; p < pages; p++) {
        const y = startGamePage(b, theme, ctx.meta, ctx.config, {
          label: `Solutions ${p + 1}`,
          role: 'answerKey',
          tag: 'SOLUTIONS',
          nameLine: false,
          compact: true,
        })
        renderSheet(puzzles.slice(p * perPage, (p + 1) * perPage), true, y)
      }
    }

    // The grid solution pages already carry the answers; keep the text key short.
    return finishDoc(b, theme, ctx, {
      entries: [],
      notes: ['Completed grids are printed on the solution sheets above.'],
    })
  },
}
