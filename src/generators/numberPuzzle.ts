import { SYM } from '../engines/equations'
import { evalExpr, tryEvalExpr } from '../engines/expression'
import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { check, combine } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import type { Rng } from '../utils/rng'
import { clamp, range, sum } from '../utils/misc'
import { fitTextSize } from '../utils/text'
import { baseMeta, finishDoc, setupDoc } from './shared'

/**
 * Number puzzles, in three shapes chosen per sheet:
 *
 *   pyramid  - each brick is the sum of the two below it
 *   magic    - place the given numbers so every line sums to the same total
 *   operator - drop the missing + - x / signs into an equation
 *
 * Every variant is generated complete and then has cells removed, and every
 * variant is checked for a UNIQUE solution before it is accepted. The checks
 * differ (constraint propagation, permutation search, operator enumeration) but
 * the contract is the same: if a learner reasons correctly they reach exactly
 * one answer.
 */

export type PuzzleVariant = 'pyramid' | 'magic' | 'operator'

export interface PyramidPuzzle {
  kind: 'pyramid'
  rows: number
  /** values[r][c]; r=0 is the apex. */
  values: number[][]
  /** true = printed, false = blank. */
  shown: boolean[][]
}

export interface MagicPuzzle {
  kind: 'magic'
  size: number
  values: number[][]
  shown: boolean[][]
  magicConstant: number
  /** Numbers removed from the grid, offered as a bank. */
  bank: number[]
}

export interface OperatorPuzzle {
  kind: 'operator'
  numbers: number[]
  operators: string[]
  target: number
}

export type NumberPuzzle = PyramidPuzzle | MagicPuzzle | OperatorPuzzle

export interface NumberPuzzlePayload {
  variantKind: PuzzleVariant
  puzzles: NumberPuzzle[]
  variant: string
}

/* ------------------------------------------------------------------ *
 * Pyramid
 * ------------------------------------------------------------------ */

/**
 * Constraint propagation over the pyramid relation `above = left + right`.
 * Returns true when every cell can be deduced from the shown ones alone.
 */
function pyramidIsDetermined(values: number[][], shown: boolean[][]): boolean {
  const rows = values.length
  const known: Array<Array<number | null>> = values.map((row, r) =>
    row.map((v, c) => (shown[r][c] ? v : null)),
  )

  let changed = true
  while (changed) {
    changed = false
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < known[r].length; c++) {
        const top = known[r][c]
        const left = known[r + 1][c]
        const right = known[r + 1][c + 1]
        const unknowns = [top, left, right].filter((v) => v === null).length
        if (unknowns !== 1) continue
        if (top === null) known[r][c] = (left as number) + (right as number)
        else if (left === null) known[r + 1][c] = top - (right as number)
        else known[r + 1][c + 1] = top - (left as number)
        changed = true
      }
    }
  }

  return known.every((row) => row.every((v) => v !== null))
}

function makePyramid(rng: Rng, score: number): PyramidPuzzle {
  const rows = clamp(Math.round(3 + score / 30), 3, 5)
  const baseMax = clamp(Math.round(4 + score / 4), 5, 40)

  const values: number[][] = Array.from({ length: rows }, () => [])
  values[rows - 1] = range(rows).map(() => rng.int(1, baseMax))
  for (let r = rows - 2; r >= 0; r--) {
    values[r] = range(r + 1).map((c) => values[r + 1][c] + values[r + 1][c + 1])
  }

  const total = (rows * (rows + 1)) / 2
  // More blanks as difficulty rises, but never so many that it stops resolving.
  const targetBlanks = clamp(Math.round(total * (0.25 + score / 260)), 1, total - 2)

  const shown = values.map((row) => row.map(() => true))
  const order = rng.shuffle(
    values.flatMap((row, r) => row.map((_, c) => [r, c] as [number, number])),
  )

  let blanks = 0
  for (const [r, c] of order) {
    if (blanks >= targetBlanks) break
    shown[r][c] = false
    if (pyramidIsDetermined(values, shown)) blanks++
    else shown[r][c] = true
  }

  return { kind: 'pyramid', rows, values, shown }
}

/* ------------------------------------------------------------------ *
 * Magic square
 * ------------------------------------------------------------------ */

/** Base 3x3 magic square (Lo Shu), transformed into a fresh one each time. */
function makeMagic(rng: Rng, score: number): MagicPuzzle {
  const base = [
    [8, 1, 6],
    [3, 5, 7],
    [4, 9, 2],
  ]

  let grid = base.map((row) => row.slice())
  // Rotations and reflections give eight distinct arrangements.
  const rotations = rng.int(0, 3)
  for (let i = 0; i < rotations; i++) {
    grid = grid[0].map((_, c) => grid.map((row) => row[c]).reverse())
  }
  if (rng.chance(0.5)) grid = grid.map((row) => row.slice().reverse())

  // Scale and shift so the numbers suit the age group.
  const multiplier = score >= 45 ? rng.pick([1, 2, 2, 3, 5]) : 1
  const offset = score >= 30 ? rng.int(0, 12) * multiplier : 0
  const values = grid.map((row) => row.map((v) => v * multiplier + offset))
  const magicConstant = sum(values[0])

  const blanks = clamp(Math.round(2 + score / 22), 2, 6)
  const shown = values.map((row) => row.map(() => true))
  const positions = rng.sample(
    range(9).map((i) => [Math.floor(i / 3), i % 3] as [number, number]),
    blanks,
  )
  for (const [r, c] of positions) shown[r][c] = false

  const bank = positions.map(([r, c]) => values[r][c]).sort((a, b) => a - b)
  return { kind: 'magic', size: 3, values, shown, magicConstant, bank }
}

/** Counts arrangements of `bank` into the blanks that satisfy every line. */
function magicSolutionCount(puzzle: MagicPuzzle): number {
  const blanks: Array<[number, number]> = []
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) if (!puzzle.shown[r][c]) blanks.push([r, c])
  }

  const grid = puzzle.values.map((row, r) => row.map((v, c) => (puzzle.shown[r][c] ? v : 0)))
  const target = puzzle.magicConstant
  let count = 0

  const linesOk = (): boolean => {
    const lines: number[][] = [
      [grid[0][0], grid[0][1], grid[0][2]],
      [grid[1][0], grid[1][1], grid[1][2]],
      [grid[2][0], grid[2][1], grid[2][2]],
      [grid[0][0], grid[1][0], grid[2][0]],
      [grid[0][1], grid[1][1], grid[2][1]],
      [grid[0][2], grid[1][2], grid[2][2]],
      [grid[0][0], grid[1][1], grid[2][2]],
      [grid[0][2], grid[1][1], grid[2][0]],
    ]
    return lines.every((line) => sum(line) === target)
  }

  const used = puzzle.bank.map(() => false)
  const place = (i: number): void => {
    if (count > 1) return
    if (i === blanks.length) {
      if (linesOk()) count++
      return
    }
    const [r, c] = blanks[i]
    for (let k = 0; k < puzzle.bank.length; k++) {
      if (used[k]) continue
      // Skip duplicate values at the same slot - they are the same arrangement.
      if (k > 0 && puzzle.bank[k] === puzzle.bank[k - 1] && !used[k - 1]) continue
      used[k] = true
      grid[r][c] = puzzle.bank[k]
      place(i + 1)
      grid[r][c] = 0
      used[k] = false
      if (count > 1) return
    }
  }

  place(0)
  return count
}

/* ------------------------------------------------------------------ *
 * Operator hunt
 * ------------------------------------------------------------------ */

const OPS = ['+', '-', '*', '/'] as const

function exprOf(numbers: number[], operators: string[]): string {
  return numbers.map((n, i) => (i === 0 ? String(n) : `${operators[i - 1]} ${n}`)).join(' ')
}

/** Enumerates every operator assignment and counts those hitting the target. */
function operatorSolutionCount(numbers: number[], target: number): number {
  const gaps = numbers.length - 1
  let count = 0
  const combos = OPS.length ** gaps
  for (let mask = 0; mask < combos; mask++) {
    const operators: string[] = []
    let m = mask
    for (let i = 0; i < gaps; i++) {
      operators.push(OPS[m % OPS.length])
      m = Math.floor(m / OPS.length)
    }
    const result = tryEvalExpr(exprOf(numbers, operators))
    if (result.ok && Math.abs(result.value - target) < 1e-9) count++
  }
  return count
}

function makeOperator(rng: Rng, score: number, allowNegative: boolean): OperatorPuzzle | null {
  const gaps = clamp(Math.round(2 + score / 45), 2, 3)
  const cap = clamp(Math.round(6 + score / 3), 8, 60)
  const numbers = range(gaps + 1).map(() => rng.int(2, cap))
  const operators = range(gaps).map(() => rng.pick([...OPS]))

  const expr = exprOf(numbers, operators)
  let target: number
  try {
    target = evalExpr(expr)
  } catch {
    return null
  }

  // Keep the target friendly: a whole number the learner can aim at.
  if (!Number.isInteger(target)) return null
  if (!allowNegative && target < 0) return null
  if (Math.abs(target) > cap * 12) return null

  // Only accept puzzles where exactly one operator set produces the target.
  if (operatorSolutionCount(numbers, target) !== 1) return null

  return { kind: 'operator', numbers, operators, target }
}

/* ------------------------------------------------------------------ *
 * Generator
 * ------------------------------------------------------------------ */

const PRINT_OP: Record<string, string> = { '+': '+', '-': SYM.minus, '*': SYM.times, '/': SYM.divide }

export const numberPuzzleGenerator: GameGenerator<NumberPuzzlePayload> = {
  id: 'number-puzzle',
  name: 'Number Puzzle',
  description: 'Number pyramids, magic squares or missing-operator hunts, each with one answer.',
  category: 'math',
  glyph: 'NP',
  subjects: ['mathematics', 'logic'],
  defaults: { itemCount: 4, lengthMinutes: 15, subject: 'mathematics' },
  itemRange: [1, 8],
  itemLabel: 'Puzzles',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): NumberPuzzlePayload {
    const { rng, profile, config } = ctx
    const count = clamp(config.itemCount, 1, 8)

    // One shape per sheet keeps the instructions short and the page coherent;
    // the shape changes when the user regenerates.
    const pool: PuzzleVariant[] = ['pyramid', 'magic']
    if (profile.score >= 26) pool.push('operator')
    const variantKind = rng.pick(pool)

    const puzzles: NumberPuzzle[] = []
    let guard = 0
    while (puzzles.length < count && guard < count * 60 + 200) {
      guard++
      if (variantKind === 'pyramid') {
        puzzles.push(makePyramid(rng, profile.score))
      } else if (variantKind === 'magic') {
        const puzzle = makeMagic(rng, profile.score)
        if (magicSolutionCount(puzzle) === 1) puzzles.push(puzzle)
      } else {
        const puzzle = makeOperator(rng, profile.score, profile.allowNegatives)
        if (puzzle) puzzles.push(puzzle)
      }
    }

    if (puzzles.length === 0) throw new Error('Could not build any number puzzles')

    return {
      variantKind,
      puzzles,
      variant: `${variantKind}, ${puzzles.length} puzzle${puzzles.length === 1 ? '' : 's'}`,
    }
  },

  validate(payload, ctx) {
    const want = clamp(ctx.config.itemCount, 1, 8)
    const structural = check([
      [payload.puzzles.length > 0, 'np.empty', 'No puzzles were produced.'],
      [payload.puzzles.length >= want, 'np.short', `Produced ${payload.puzzles.length} of ${want} puzzles.`, 'warning'],
    ])

    const perPuzzle = payload.puzzles.map((puzzle, i) => {
      const label = `Puzzle ${i + 1}`
      if (puzzle.kind === 'pyramid') {
        // Arithmetic must hold, and the blanks must be recoverable.
        let arithmetic = true
        for (let r = 0; r < puzzle.rows - 1; r++) {
          for (let c = 0; c < puzzle.values[r].length; c++) {
            if (puzzle.values[r][c] !== puzzle.values[r + 1][c] + puzzle.values[r + 1][c + 1]) arithmetic = false
          }
        }
        return check([
          [arithmetic, 'np.pyramid-sum', `${label}: a brick is not the sum of the two below it.`],
          [pyramidIsDetermined(puzzle.values, puzzle.shown), 'np.pyramid-unsolvable', `${label}: the blanks cannot all be deduced.`],
          [puzzle.shown.flat().some((s) => !s), 'np.pyramid-nothing-blank', `${label}: nothing was left blank.`],
        ])
      }
      if (puzzle.kind === 'magic') {
        const lineSums = [
          ...puzzle.values.map((row) => sum(row)),
          ...range(3).map((c) => sum(puzzle.values.map((row) => row[c]))),
          puzzle.values[0][0] + puzzle.values[1][1] + puzzle.values[2][2],
          puzzle.values[0][2] + puzzle.values[1][1] + puzzle.values[2][0],
        ]
        const solutions = magicSolutionCount(puzzle)
        return check([
          [lineSums.every((s) => s === puzzle.magicConstant), 'np.magic-lines', `${label}: a line does not reach the magic constant.`],
          [solutions === 1, 'np.magic-uniqueness', `${label}: has ${solutions} solutions, expected exactly 1.`],
          [puzzle.bank.length >= 2, 'np.magic-bank', `${label}: too few numbers were removed.`],
        ])
      }
      const evaluated = tryEvalExpr(exprOf(puzzle.numbers, puzzle.operators))
      return check([
        [evaluated.ok && Math.abs(evaluated.value - puzzle.target) < 1e-9, 'np.operator-target', `${label}: the operators do not reach the target.`],
        [operatorSolutionCount(puzzle.numbers, puzzle.target) === 1, 'np.operator-uniqueness', `${label}: more than one operator set works.`],
      ])
    })

    return combine(structural, ...perPuzzle)
  },

  generateAnswerKey(payload): AnswerKey {
    const entries = payload.puzzles.flatMap((puzzle, i) => {
      const label = `Puzzle ${i + 1}`
      if (puzzle.kind === 'pyramid') {
        return puzzle.values.map((row, r) => ({
          label: `${label} row ${r + 1}`,
          answer: row.join('  '),
        }))
      }
      if (puzzle.kind === 'magic') {
        return puzzle.values.map((row, r) => ({
          label: `${label} row ${r + 1}`,
          answer: `${row.join('  ')}   (sum ${puzzle.magicConstant})`,
        }))
      }
      const shown = puzzle.numbers
        .map((n, k) => (k === 0 ? String(n) : `${PRINT_OP[puzzle.operators[k - 1]]} ${n}`))
        .join(' ')
      return [{ label, answer: `${shown} = ${puzzle.target}` }]
    })
    return { entries, notes: ['Every puzzle on this sheet has exactly one solution.'] }
  },

  meta(payload, ctx): GameMeta {
    const instructionsByKind: Record<PuzzleVariant, string[]> = {
      pyramid: [
        'Each brick holds the sum of the two bricks directly below it.',
        'Fill in every empty brick.',
        'Work in whichever direction is easiest - upwards to add, downwards to subtract.',
        'Every blank can be worked out; no guessing is required.',
      ],
      magic: [
        'Write each number from the bank into the empty squares.',
        'Every row, every column and both diagonals must add to the magic number.',
        'Each number from the bank is used exactly once.',
        'Start with the line that has only one square missing.',
      ],
      operator: [
        `Write the missing signs (+, ${SYM.minus}, ${SYM.times}, ${SYM.divide}) into the boxes.`,
        'Work out multiplication and division before addition and subtraction.',
        'Only one set of signs makes each line true.',
        'Check your answer by working the whole line through again.',
      ],
    }

    return baseMeta(
      ctx.config,
      payload.variantKind === 'pyramid'
        ? 'Number Pyramids'
        : payload.variantKind === 'magic'
          ? 'Magic Squares'
          : 'Missing Operators',
      instructionsByKind[payload.variantKind],
      { Puzzles: payload.puzzles.length, Type: payload.variantKind },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)
    const { puzzles, variantKind } = payload

    let y = startGamePage(b, theme, ctx.meta, ctx.config)
    if (ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, ctx.meta.instructions)
    }

    const perRow = variantKind === 'operator' ? 1 : puzzles.length > 2 ? 2 : 1
    const slotW = b.contentWidth / perRow
    const gridRows = Math.ceil(puzzles.length / perRow)
    // Cap the slot so a two-puzzle sheet does not stretch two small pyramids
    // over a full page; the leftover space becomes working room at the bottom.
    const naturalH = variantKind === 'operator' ? 20 : variantKind === 'magic' ? 78 : 74
    const slotH = Math.min((b.bottom - y) / gridRows, naturalH)

    puzzles.forEach((puzzle, i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      const x = b.left + col * slotW
      const top = y + row * slotH

      b.text(x, top, `${i + 1}`, {
        size: 9,
        weight: 'bold',
        color: theme.colors.accent,
        font: theme.fonts.heading,
        baseline: 'top',
      })

      if (puzzle.kind === 'pyramid') {
        const cellW = Math.min(19, (slotW - 12) / puzzle.rows)
        const cellH = Math.min(11, (slotH - 12) / puzzle.rows)
        const baseW = puzzle.rows * cellW
        const originX = x + (slotW - baseW) / 2
        for (let r = 0; r < puzzle.rows; r++) {
          const rowCount = r + 1
          const rowX = originX + ((puzzle.rows - rowCount) * cellW) / 2
          for (let c = 0; c < rowCount; c++) {
            const cx = rowX + c * cellW
            const cy = top + 6 + r * cellH
            const filled = puzzle.shown[r][c]
            b.rect(cx, cy, cellW - 1, cellH - 1, {
              fill: filled ? theme.colors.accentSoft : '#ffffff',
              stroke: theme.colors.grid,
              lineWidth: 0.4,
              radius: 1,
            })
            if (filled) {
              const label = String(puzzle.values[r][c])
              b.text(cx + (cellW - 1) / 2, cy + (cellH - 1) / 2, label, {
                size: fitTextSize(label, cellW - 4, cellH * 1.5, 5, theme.fonts.grid, 'bold'),
                align: 'center',
                weight: 'bold',
                font: theme.fonts.grid,
                color: theme.colors.ink,
                baseline: 'middle',
              })
            }
          }
        }
      } else if (puzzle.kind === 'magic') {
        const cell = Math.min(17, (slotW - 20) / 3, (slotH - 24) / 3)
        const gx = x + (slotW - cell * 3) / 2
        const gy = top + 6
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const filled = puzzle.shown[r][c]
            b.rect(gx + c * cell, gy + r * cell, cell, cell, {
              fill: filled ? theme.colors.accentSoft : '#ffffff',
              stroke: theme.colors.grid,
              lineWidth: 0.4,
            })
            if (filled) {
              const label = String(puzzle.values[r][c])
              b.text(gx + c * cell + cell / 2, gy + r * cell + cell / 2, label, {
                size: fitTextSize(label, cell - 3, cell * 1.4, 5, theme.fonts.grid, 'bold'),
                align: 'center',
                weight: 'bold',
                font: theme.fonts.grid,
                color: theme.colors.ink,
                baseline: 'middle',
              })
            }
          }
        }
        b.rect(gx, gy, cell * 3, cell * 3, { stroke: theme.colors.grid, lineWidth: 0.85 })
        b.text(gx + cell * 1.5, gy + cell * 3 + 4.5, `Magic number: ${puzzle.magicConstant}`, {
          size: 8, align: 'center', weight: 'bold', color: theme.colors.accent, baseline: 'top', font: theme.fonts.body,
        })
        b.text(gx + cell * 1.5, gy + cell * 3 + 10, `Bank: ${puzzle.bank.join(', ')}`, {
          size: 7.6, align: 'center', color: theme.colors.muted, baseline: 'top', font: theme.fonts.body,
          maxWidth: slotW - 8,
        })
      } else {
        // Operator hunt: numbers with empty boxes between them.
        const boxSize = 8
        const gap = 4
        const parts = puzzle.numbers.length + puzzle.operators.length + 2
        const unit = Math.min(15, (slotW - 20) / parts)
        let cx = x + 8
        const cy = top + 3
        puzzle.numbers.forEach((n, k) => {
          if (k > 0) {
            b.rect(cx, cy, boxSize, boxSize, {
              stroke: theme.colors.accent, lineWidth: 0.5, radius: 1, fill: '#ffffff',
            })
            cx += boxSize + gap
          }
          const label = String(n)
          b.text(cx, cy + boxSize / 2, label, {
            size: 12, weight: 'bold', font: theme.fonts.grid, color: theme.colors.ink, baseline: 'middle',
          })
          cx += Math.max(unit * 0.7, label.length * 3.2) + gap
        })
        b.text(cx, cy + boxSize / 2, `=  ${puzzle.target}`, {
          size: 12, weight: 'bold', font: theme.fonts.grid, color: theme.colors.accent, baseline: 'middle',
        })
      }
    })

    /* --------------------------- solutions ---------------------------- */
    if (ctx.config.includeAnswerKey && variantKind !== 'operator') {
      let sy = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: 'Solutions',
        role: 'answerKey',
        tag: 'SOLUTIONS',
        nameLine: false,
      })
      sy = drawSectionTitle(b, theme, sy, 'Completed puzzles')

      const solPerRow = puzzles.length > 2 ? 2 : 1
      const solSlotW = b.contentWidth / solPerRow
      const solSlotH = (b.bottom - sy) / Math.ceil(puzzles.length / solPerRow)

      puzzles.forEach((puzzle, i) => {
        const col = i % solPerRow
        const row = Math.floor(i / solPerRow)
        const x = b.left + col * solSlotW
        const top = sy + row * solSlotH
        b.text(x, top, `${i + 1}`, {
          size: 9, weight: 'bold', color: theme.colors.accent, font: theme.fonts.heading, baseline: 'top',
        })

        if (puzzle.kind === 'pyramid') {
          const cellW = Math.min(19, (solSlotW - 12) / puzzle.rows)
          const cellH = Math.min(11, (solSlotH - 12) / puzzle.rows)
          const originX = x + (solSlotW - puzzle.rows * cellW) / 2
          for (let r = 0; r < puzzle.rows; r++) {
            const rowX = originX + ((puzzle.rows - (r + 1)) * cellW) / 2
            for (let c = 0; c <= r; c++) {
              const cx = rowX + c * cellW
              const cy = top + 6 + r * cellH
              b.rect(cx, cy, cellW - 1, cellH - 1, {
                fill: puzzle.shown[r][c] ? '#ffffff' : theme.colors.highlight,
                stroke: theme.colors.grid,
                lineWidth: 0.4,
                radius: 1,
              })
              const label = String(puzzle.values[r][c])
              b.text(cx + (cellW - 1) / 2, cy + (cellH - 1) / 2, label, {
                size: fitTextSize(label, cellW - 4, cellH * 1.5, 5, theme.fonts.grid, 'bold'),
                align: 'center', weight: 'bold', font: theme.fonts.grid, color: theme.colors.ink, baseline: 'middle',
              })
            }
          }
        } else if (puzzle.kind === 'magic') {
          const cell = Math.min(17, (solSlotW - 20) / 3, (solSlotH - 18) / 3)
          const gx = x + (solSlotW - cell * 3) / 2
          const gy = top + 6
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
              b.rect(gx + c * cell, gy + r * cell, cell, cell, {
                fill: puzzle.shown[r][c] ? '#ffffff' : theme.colors.highlight,
                stroke: theme.colors.grid,
                lineWidth: 0.4,
              })
              const label = String(puzzle.values[r][c])
              b.text(gx + c * cell + cell / 2, gy + r * cell + cell / 2, label, {
                size: fitTextSize(label, cell - 3, cell * 1.4, 5, theme.fonts.grid, 'bold'),
                align: 'center', weight: 'bold', font: theme.fonts.grid, color: theme.colors.ink, baseline: 'middle',
              })
            }
          }
          b.rect(gx, gy, cell * 3, cell * 3, { stroke: theme.colors.grid, lineWidth: 0.85 })
        }
      })
    }

    return finishDoc(b, theme, ctx)
  },
}
