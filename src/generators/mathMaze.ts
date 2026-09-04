import { generateProblemSet, type MathProblem } from '../engines/equations'
import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { check, combine, verifyMathProblems } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp, sum } from '../utils/misc'
import { fitTextSize, lineHeight, wrapText } from '../utils/text'
import { baseMeta, finishDoc, setupDoc } from './shared'

/**
 * Math maze.
 *
 * The maze itself is a *perfect* maze built with an iterative recursive
 * backtracker: every cell is reachable and exactly one path connects any two
 * cells. That property is what makes the puzzle honest - there is a solution,
 * there is only one, and the solver on the answer key is the real path rather
 * than a drawing of one.
 *
 * Maths is layered on top: checkpoints are dropped at even intervals along the
 * solution path, so a solver who takes a wrong turn also misses questions, and
 * the answers sum to a "treasure code" that self-checks the whole route.
 */

interface Cell {
  /** Walls in N, E, S, W order. */
  walls: [boolean, boolean, boolean, boolean]
  visited: boolean
}

export interface Checkpoint {
  index: number
  row: number
  col: number
  problem: MathProblem
}

export interface MazePayload {
  cols: number
  rows: number
  cells: Cell[][]
  path: Array<[number, number]>
  checkpoints: Checkpoint[]
  treasureCode: number
  variant: string
}

const DR = [-1, 0, 1, 0]
const DC = [0, 1, 0, -1]
const OPPOSITE = [2, 3, 0, 1]

function carve(cols: number, rows: number, rng: GenContext['rng']): Cell[][] {
  const cells: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ walls: [true, true, true, true] as [boolean, boolean, boolean, boolean], visited: false })),
  )

  // Iterative rather than recursive: a 21x27 maze would blow a JS stack in the
  // recursive form on some engines, and the iterative version is just as short.
  const stack: Array<[number, number]> = [[0, 0]]
  cells[0][0].visited = true

  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1]
    const neighbours: number[] = []
    for (let d = 0; d < 4; d++) {
      const nr = r + DR[d]
      const nc = c + DC[d]
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !cells[nr][nc].visited) neighbours.push(d)
    }
    if (neighbours.length === 0) {
      stack.pop()
      continue
    }
    const d = rng.pick(neighbours)
    const nr = r + DR[d]
    const nc = c + DC[d]
    cells[r][c].walls[d] = false
    cells[nr][nc].walls[OPPOSITE[d]] = false
    cells[nr][nc].visited = true
    stack.push([nr, nc])
  }

  return cells
}

/** Breadth-first search through the carved passages. */
function solve(cells: Cell[][], from: [number, number], to: [number, number]): Array<[number, number]> {
  const rows = cells.length
  const cols = cells[0].length
  const prev = new Map<string, string>()
  const seen = new Set<string>([`${from[0]},${from[1]}`])
  const queue: Array<[number, number]> = [from]

  while (queue.length > 0) {
    const [r, c] = queue.shift() as [number, number]
    if (r === to[0] && c === to[1]) break
    for (let d = 0; d < 4; d++) {
      if (cells[r][c].walls[d]) continue
      const nr = r + DR[d]
      const nc = c + DC[d]
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
      const key = `${nr},${nc}`
      if (seen.has(key)) continue
      seen.add(key)
      prev.set(key, `${r},${c}`)
      queue.push([nr, nc])
    }
  }

  const path: Array<[number, number]> = []
  let cursor = `${to[0]},${to[1]}`
  if (!seen.has(cursor)) return []
  for (;;) {
    const [r, c] = cursor.split(',').map(Number) as [number, number]
    path.unshift([r, c])
    const parent = prev.get(cursor)
    if (!parent) break
    cursor = parent
  }
  return path
}

export const mathMazeGenerator: GameGenerator<MazePayload> = {
  id: 'math-maze',
  name: 'Math Maze',
  description: 'A true single-solution maze with maths checkpoints along the route.',
  category: 'math',
  glyph: 'MZ',
  subjects: ['mathematics'],
  defaults: { itemCount: 8, lengthMinutes: 15, subject: 'mathematics', orientation: 'portrait' },
  itemRange: [3, 14],
  itemLabel: 'Checkpoints',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): MazePayload {
    const { rng, profile, config } = ctx
    let [cols, rows] = profile.mazeSize
    if (config.orientation === 'landscape') [cols, rows] = [rows, cols]
    cols = clamp(cols, 6, 24)
    rows = clamp(rows, 6, 26)

    const cells = carve(cols, rows, rng)
    const path = solve(cells, [0, 0], [rows - 1, cols - 1])
    if (path.length === 0) throw new Error('Maze solver found no route')

    // Checkpoints spread evenly along the route, never on the first or last cell.
    const wanted = clamp(config.itemCount, 3, Math.min(14, path.length - 2))
    const problems = generateProblemSet(wanted, ctx, {
      integerAnswersOnly: true,
      uniqueAnswers: true,
      answerRange: [0, 500],
      maxQuestionLength: 30,
    })

    const checkpoints: Checkpoint[] = problems.map((problem, i) => {
      const t = (i + 1) / (wanted + 1)
      const idx = clamp(Math.round(t * (path.length - 1)), 1, path.length - 2)
      const [row, col] = path[idx]
      return { index: i + 1, row, col, problem }
    })

    return {
      cols,
      rows,
      cells,
      path,
      checkpoints,
      treasureCode: sum(checkpoints.map((c) => c.problem.value ?? 0)),
      variant: `${cols} x ${rows} maze, ${checkpoints.length} checkpoints`,
    }
  },

  validate(payload) {
    const { cells, cols, rows, path, checkpoints, treasureCode } = payload

    // Re-solve from scratch: proves the stored path really is a route, and that
    // the maze is still connected after the checkpoints were dropped in.
    const resolved = solve(cells, [0, 0], [rows - 1, cols - 1])

    const structural = check([
      [path.length > 0, 'maze.no-path', 'The maze has no solution.'],
      [resolved.length === path.length, 'maze.path-mismatch', 'The stored solution does not match a fresh solve.'],
      [path[0][0] === 0 && path[0][1] === 0, 'maze.start', 'The path does not begin at the start.'],
      [
        path[path.length - 1][0] === rows - 1 && path[path.length - 1][1] === cols - 1,
        'maze.end',
        'The path does not reach the finish.',
      ],
      [checkpoints.length >= 3, 'maze.few-checkpoints', 'Fewer than three checkpoints were placed.'],
      [
        new Set(checkpoints.map((c) => `${c.row},${c.col}`)).size === checkpoints.length,
        'maze.checkpoint-collision',
        'Two checkpoints landed on the same cell.',
      ],
      [
        checkpoints.every((c) => path.some(([r, cc]) => r === c.row && cc === c.col)),
        'maze.checkpoint-off-path',
        'A checkpoint is not on the solution path.',
      ],
      [
        treasureCode === sum(checkpoints.map((c) => c.problem.value ?? 0)),
        'maze.code',
        'The treasure code does not equal the sum of the answers.',
      ],
    ])

    // Every step in the path must pass through an actual opening.
    const steps = path.slice(1).map((cell, i) => {
      const [pr, pc] = path[i]
      const [r, c] = cell
      const d = DR.findIndex((dr, di) => pr + dr === r && pc + DC[di] === c)
      if (d < 0 || cells[pr][pc].walls[d]) {
        return { ok: false, issues: [{ severity: 'error' as const, code: 'maze.wall', message: `The path crosses a wall at ${r},${c}.` }] }
      }
      return { ok: true, issues: [] }
    })

    return combine(structural, ...steps, verifyMathProblems(checkpoints.map((c) => c.problem)))
  },

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.checkpoints.map((c) => ({
        label: `Checkpoint ${c.index}.`,
        answer: c.problem.answer,
        note: c.problem.question,
      })),
      notes: [
        `Treasure code (all answers added together): ${payload.treasureCode}.`,
        'The solution route is drawn on the solved-maze page.',
      ],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Math Maze',
      [
        'Start at the arrow marked START and find your way to FINISH.',
        'You may only move through gaps in the walls - never across a line.',
        'Your route passes numbered checkpoints. Solve the matching question for each one.',
        `Add all your answers together to get the treasure code, then check it against the key.`,
      ],
      {
        Maze: `${payload.cols} x ${payload.rows}`,
        Checkpoints: payload.checkpoints.length,
        'Path length': payload.path.length,
        'Treasure code': payload.treasureCode,
      },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)
    const { cols, rows, cells, checkpoints, path } = payload

    const drawMaze = (x: number, y: number, cell: number, showPath: boolean): void => {
      const w = cols * cell
      const h = rows * cell
      const wallStyle = { stroke: theme.colors.grid, lineWidth: Math.max(0.35, cell * 0.055), cap: 'round' as const }

      if (showPath) {
        // Draw the route first so the walls print on top of it.
        const points: Array<[number, number]> = path.map(([r, c]) => [
          x + c * cell + cell / 2,
          y + r * cell + cell / 2,
        ])
        for (let i = 1; i < points.length; i++) {
          b.line(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1], {
            stroke: theme.colors.accent,
            lineWidth: Math.max(0.8, cell * 0.3),
            opacity: 0.35,
            cap: 'round',
          })
        }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = x + c * cell
          const cy = y + r * cell
          // Only north and west per cell, plus the far edges: every wall once.
          if (cells[r][c].walls[0]) b.line(cx, cy, cx + cell, cy, wallStyle)
          if (cells[r][c].walls[3]) b.line(cx, cy, cx, cy + cell, wallStyle)
        }
      }
      b.line(x, y + h, x + w, y + h, wallStyle)
      b.line(x + w, y, x + w, y + h, wallStyle)

      // Openings at the two corners, drawn as white gaps over the border.
      b.line(x + 0.4, y, x + cell - 0.4, y, { stroke: '#ffffff', lineWidth: wallStyle.lineWidth * 1.6 })
      b.line(x + w - cell + 0.4, y + h, x + w - 0.4, y + h, { stroke: '#ffffff', lineWidth: wallStyle.lineWidth * 1.6 })

      // Checkpoint badges.
      checkpoints.forEach((cp) => {
        const bx = x + cp.col * cell + cell / 2
        const by = y + cp.row * cell + cell / 2
        const r = Math.min(cell * 0.36, 3.4)
        b.circle(bx, by, r, { fill: theme.colors.accent })
        b.text(bx, by, String(cp.index), {
          size: Math.max(4.6, r * 2.6),
          align: 'center',
          weight: 'bold',
          color: '#ffffff',
          font: theme.fonts.body,
          baseline: 'middle',
        })
      })

      // START / FINISH labels outside the maze.
      b.text(x + cell / 2, y - 2.2, 'START', {
        size: Math.min(8, cell * 1.1),
        align: 'center',
        weight: 'bold',
        color: theme.colors.accent,
        font: theme.fonts.heading,
      })
      b.text(x + w - cell / 2, y + h + 5.2, 'FINISH', {
        size: Math.min(8, cell * 1.1),
        align: 'center',
        weight: 'bold',
        color: theme.colors.accent,
        font: theme.fonts.heading,
      })
    }

    /* ----------------------------- puzzle ------------------------------ */
    let y = startGamePage(b, theme, ctx.meta, ctx.config)
    if (ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, ctx.meta.instructions)
    }

    // Question list height first, so the maze takes exactly what is left.
    const qCols = 2
    const qColW = (b.contentWidth - 6) / qCols
    const qSize = 8.2
    const qLines = checkpoints.map((cp) =>
      wrapText(cp.problem.question, qColW - 8, qSize, theme.fonts.body).length,
    )
    const rowsNeeded = Math.ceil(checkpoints.length / qCols)
    const maxLinesPerRow = Math.max(...qLines, 1)
    // Each entry needs room for its wrapped text PLUS the answer rule beneath it
    // and a gap before the next one, or the rows run into each other.
    const ANSWER_RULE_SPACE = 4.5
    const qRowH = maxLinesPerRow * lineHeight(qSize, 1.25) + ANSWER_RULE_SPACE
    const questionsH = rowsNeeded * qRowH + 20

    const mazeBudgetH = b.bottom - y - questionsH - 12
    const cell = Math.max(
      3,
      Math.min(b.contentWidth / cols, mazeBudgetH / rows, 12),
    )
    const mazeX = b.left + (b.contentWidth - cell * cols) / 2

    drawMaze(mazeX, y + 4, cell, false)
    y += 4 + rows * cell + 10

    y = drawSectionTitle(b, theme, y, 'Checkpoint questions')
    checkpoints.forEach((cp, i) => {
      const col = i % qCols
      const row = Math.floor(i / qCols)
      const x = b.left + col * (qColW + 6)
      const cy = y + row * qRowH
      b.circle(x + 2, cy + 2, 2, { fill: theme.colors.accent })
      b.text(x + 2, cy + 2, String(cp.index), {
        size: 5.4, align: 'center', weight: 'bold', color: '#ffffff', baseline: 'middle', font: theme.fonts.body,
      })
      const lines = wrapText(cp.problem.question, qColW - 8, qSize, theme.fonts.body)
      lines.forEach((line, li) => {
        b.text(x + 6, cy + li * lineHeight(qSize, 1.25), line, {
          size: qSize, font: theme.fonts.body, color: theme.colors.ink, baseline: 'top', maxWidth: qColW - 8,
        })
      })
      b.line(x + 6, cy + lines.length * lineHeight(qSize, 1.25) + 0.6, x + qColW - 4, cy + lines.length * lineHeight(qSize, 1.25) + 0.6, {
        stroke: theme.colors.rule, lineWidth: 0.25, dash: [1, 1],
      })
    })

    y += rowsNeeded * qRowH + 4
    if (b.bottom - y > 8) {
      const codeText = 'Treasure code (add every answer):'
      const size = fitTextSize(codeText, b.contentWidth * 0.6, 9.5, 6, theme.fonts.heading, 'bold')
      b.text(b.left, y, codeText, {
        size, weight: 'bold', color: theme.colors.accent, baseline: 'top', font: theme.fonts.heading,
      })
      b.rect(b.left + b.contentWidth * 0.62, y - 1.5, b.contentWidth * 0.38, 8, {
        stroke: theme.colors.rule, lineWidth: 0.4, radius: 1.5,
      })
    }

    /* --------------------------- solved maze --------------------------- */
    if (ctx.config.includeAnswerKey) {
      const sy = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: 'Solved maze',
        role: 'answerKey',
        tag: 'SOLUTION',
        nameLine: false,
      })
      const solCell = Math.max(3, Math.min(b.contentWidth / cols, (b.bottom - sy - 20) / rows, 12))
      drawMaze(b.left + (b.contentWidth - solCell * cols) / 2, sy + 4, solCell, true)
      b.text(b.left, sy + 8 + rows * solCell + 6, `Treasure code: ${payload.treasureCode}`, {
        size: 11,
        weight: 'bold',
        color: theme.colors.accent,
        font: theme.fonts.heading,
        baseline: 'top',
      })
    }

    return finishDoc(b, theme, ctx)
  },
}
