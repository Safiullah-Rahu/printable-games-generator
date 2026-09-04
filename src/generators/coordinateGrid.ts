import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { check, combine } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp } from '../utils/misc'
import { baseMeta, finishDoc, setupDoc } from './shared'

/**
 * Coordinate grid mystery picture.
 *
 * Plot the listed points in order, join them up, and a shape appears. Shapes
 * are authored as integer polylines on a 0-12 box so every point lands exactly
 * on a grid intersection - a picture that needs half-squares is unplottable and
 * immediately destroys a learner's trust in the sheet.
 *
 * Harder settings translate the same shapes into all four quadrants, which
 * turns the identical drawing task into a negative-number exercise.
 */

interface ShapeDef {
  name: string
  /** Closed polyline on a 0-12 integer grid. */
  points: Array<[number, number]>
}

const SHAPES: ShapeDef[] = [
  { name: 'a house', points: [[2, 2], [2, 7], [6, 11], [10, 7], [10, 2]] },
  { name: 'a rocket', points: [[6, 12], [8, 8], [8, 4], [9, 4], [9, 1], [7, 3], [5, 3], [3, 1], [3, 4], [4, 4], [4, 8]] },
  { name: 'a fish', points: [[1, 6], [5, 9], [9, 7], [11, 9], [11, 3], [9, 5], [5, 3]] },
  { name: 'a tree', points: [[6, 12], [3, 8], [5, 8], [2, 4], [5, 4], [5, 1], [7, 1], [7, 4], [10, 4], [7, 8], [9, 8]] },
  { name: 'a hexagon', points: [[3, 2], [9, 2], [12, 6], [9, 10], [3, 10], [0, 6]] },
  { name: 'a crown', points: [[1, 2], [1, 9], [4, 6], [6, 9], [8, 6], [11, 9], [11, 2]] },
  { name: 'a flag', points: [[2, 1], [2, 11], [9, 11], [9, 7], [2, 7]] },
  { name: 'an arrow', points: [[1, 4], [7, 4], [7, 2], [11, 6], [7, 10], [7, 8], [1, 8]] },
  { name: 'a star', points: [[6, 12], [7, 7], [12, 6], [7, 5], [6, 0], [5, 5], [0, 6], [5, 7]] },
  { name: 'a boat', points: [[1, 4], [11, 4], [9, 7], [7, 7], [7, 11], [3, 7]] },
]

export interface CoordinateQuestion {
  question: string
  answer: string
}

export interface CoordinatePayload {
  shapeName: string
  points: Array<[number, number]>
  /** Inclusive axis bounds. */
  min: number
  max: number
  fourQuadrant: boolean
  questions: CoordinateQuestion[]
  variant: string
}

export const coordinateGridGenerator: GameGenerator<CoordinatePayload> = {
  id: 'coordinate-grid',
  name: 'Coordinate Grid',
  description: 'Plot and join coordinates to reveal a mystery picture.',
  category: 'math',
  glyph: 'CG',
  subjects: ['mathematics'],
  defaults: { itemCount: 8, lengthMinutes: 15, subject: 'mathematics' },
  itemRange: [4, 12],
  itemLabel: 'Bonus questions',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): CoordinatePayload {
    const { rng, profile } = ctx
    const shape = rng.pick(SHAPES)
    const fourQuadrant = profile.score >= 52

    // Four-quadrant mode recentres the same drawing about the origin.
    const shift = fourQuadrant ? -6 : 0
    const points = shape.points.map(([x, y]) => [x + shift, y + shift] as [number, number])
    const min = fourQuadrant ? -6 : 0
    const max = fourQuadrant ? 6 : 12

    // Bonus questions read straight off the plotted shape, so they are always
    // answerable from the finished drawing.
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    const highest = points[ys.indexOf(Math.max(...ys))]
    const lowest = points[ys.indexOf(Math.min(...ys))]
    const leftmost = points[xs.indexOf(Math.min(...xs))]
    const rightmost = points[xs.indexOf(Math.max(...xs))]

    const pool: CoordinateQuestion[] = [
      { question: 'Which plotted point is the highest?', answer: `(${highest[0]}, ${highest[1]})` },
      { question: 'Which plotted point is the lowest?', answer: `(${lowest[0]}, ${lowest[1]})` },
      { question: 'Which plotted point is furthest left?', answer: `(${leftmost[0]}, ${leftmost[1]})` },
      { question: 'Which plotted point is furthest right?', answer: `(${rightmost[0]}, ${rightmost[1]})` },
      { question: 'How many points did you plot in total?', answer: String(points.length) },
      {
        question: 'How wide is the picture, from its leftmost to its rightmost point?',
        answer: `${Math.max(...xs) - Math.min(...xs)} units`,
      },
      {
        question: 'How tall is the picture, from its lowest to its highest point?',
        answer: `${Math.max(...ys) - Math.min(...ys)} units`,
      },
      { question: 'What picture did the points make?', answer: shape.name },
    ]
    if (fourQuadrant) {
      const q1 = points.filter(([x, y]) => x > 0 && y > 0).length
      pool.push({ question: 'How many of the points lie in the first quadrant?', answer: String(q1) })
      pool.push({
        question: 'How many points sit on an axis (x = 0 or y = 0)?',
        answer: String(points.filter(([x, y]) => x === 0 || y === 0).length),
      })
    }

    const questions = rng.sample(pool, clamp(ctx.config.itemCount, 4, Math.min(12, pool.length)))

    return {
      shapeName: shape.name,
      points,
      min,
      max,
      fourQuadrant,
      questions,
      variant: `${shape.name}, ${fourQuadrant ? 'four quadrants' : 'first quadrant'}`,
    }
  },

  validate(payload) {
    const { points, min, max, questions } = payload
    return combine(
      check([
        [points.length >= 4, 'coord.too-few', 'The picture needs at least four points.'],
        [
          points.every(([x, y]) => Number.isInteger(x) && Number.isInteger(y)),
          'coord.non-integer',
          'A point does not sit on a grid intersection.',
        ],
        [
          points.every(([x, y]) => x >= min && x <= max && y >= min && y <= max),
          'coord.out-of-range',
          'A point falls outside the printed grid.',
        ],
        [
          new Set(points.map((p) => p.join(','))).size === points.length,
          'coord.duplicate',
          'The same point is listed twice in a row.',
        ],
        [questions.length > 0, 'coord.no-questions', 'No bonus questions were produced.'],
        [
          questions.every((q) => q.answer.trim().length > 0),
          'coord.no-answer',
          'A bonus question has no answer.',
        ],
      ]),
    )
  },

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: [
        { label: 'Picture', answer: payload.shapeName },
        ...payload.questions.map((q, i) => ({ label: `${i + 1}.`, answer: q.answer, note: q.question })),
      ],
      notes: ['The completed drawing is printed on the solution page.'],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Coordinate Mystery Picture',
      [
        'Plot each point in the order listed. The first number is across, the second is up.',
        payload.fourQuadrant
          ? 'The grid has four quadrants, so watch for negative numbers.'
          : 'All the points are in the first quadrant, so every number is zero or more.',
        'Join each point to the next one with a straight line.',
        'Join the last point back to the first to close the picture.',
        'Then answer the bonus questions underneath.',
      ],
      {
        Points: payload.points.length,
        Grid: `${payload.min} to ${payload.max}`,
        Quadrants: payload.fourQuadrant ? 4 : 1,
        Questions: payload.questions.length,
      },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)
    const { points, min, max, questions } = payload
    const span = max - min

    const drawAxes = (x0: number, y0: number, unit: number, showShape: boolean): void => {
      const size = span * unit
      const toX = (v: number): number => x0 + (v - min) * unit
      const toY = (v: number): number => y0 + (max - v) * unit

      // Minor gridlines.
      for (let v = min; v <= max; v++) {
        b.line(toX(v), y0, toX(v), y0 + size, { stroke: theme.colors.grid, lineWidth: 0.12, opacity: 0.6 })
        b.line(x0, toY(v), x0 + size, toY(v), { stroke: theme.colors.grid, lineWidth: 0.12, opacity: 0.6 })
      }

      // Axes: heavier, and drawn through the origin in four-quadrant mode.
      b.line(toX(0), y0, toX(0), y0 + size, { stroke: theme.colors.ink, lineWidth: 0.6 })
      b.line(x0, toY(0), x0 + size, toY(0), { stroke: theme.colors.ink, lineWidth: 0.6 })

      // Tick labels, thinned out on dense grids.
      const stepLabel = span > 16 ? 2 : 1
      for (let v = min; v <= max; v += stepLabel) {
        if (v === 0) continue
        b.text(toX(v), toY(0) + 3.4, String(v), {
          size: Math.min(6.5, unit * 0.8), align: 'center', color: theme.colors.muted, baseline: 'top', font: theme.fonts.body,
        })
        b.text(toX(0) - 1.6, toY(v), String(v), {
          size: Math.min(6.5, unit * 0.8), align: 'right', color: theme.colors.muted, baseline: 'middle', font: theme.fonts.body,
        })
      }
      b.text(toX(0) - 1.6, toY(0) + 3.4, '0', {
        size: Math.min(6.5, unit * 0.8), align: 'right', color: theme.colors.muted, baseline: 'top', font: theme.fonts.body,
      })
      b.text(x0 + size + 2, toY(0), 'x', {
        size: 8, weight: 'bold', color: theme.colors.accent, baseline: 'middle', font: theme.fonts.heading,
      })
      b.text(toX(0), y0 - 3, 'y', {
        size: 8, weight: 'bold', align: 'center', color: theme.colors.accent, font: theme.fonts.heading,
      })

      b.rect(x0, y0, size, size, { stroke: theme.colors.grid, lineWidth: 0.5 })

      if (showShape) {
        const screen = points.map(([px, py]) => [toX(px), toY(py)] as [number, number])
        b.polygon(screen, {
          stroke: theme.colors.accent,
          lineWidth: 0.9,
          fill: theme.colors.highlight,
          closed: true,
          opacity: 0.9,
        })
        screen.forEach(([sx, sy]) => b.circle(sx, sy, 0.9, { fill: theme.colors.accent }))
      }
    }

    /* ----------------------------- puzzle ------------------------------ */
    let y = startGamePage(b, theme, ctx.meta, ctx.config)
    if (ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, ctx.meta.instructions)
    }

    const listRows = Math.ceil(points.length / 4)
    const questionH = questions.length * 8 + 14
    const budget = b.bottom - y - listRows * 6 - questionH - 12
    const unit = clamp(Math.min(b.contentWidth * 0.82, budget) / span, 3.5, 12)
    const gridSize = span * unit
    const gx = b.left + (b.contentWidth - gridSize) / 2
    drawAxes(gx, y + 4, unit, false)
    y += gridSize + 12

    /* --------------------------- point list ---------------------------- */
    y = drawSectionTitle(b, theme, y, 'Plot these points in order')
    const perRow = 4
    const colW = b.contentWidth / perRow
    points.forEach(([px, py], i) => {
      const col = i % perRow
      const row = Math.floor(i / perRow)
      b.text(b.left + col * colW, y + row * 6, `${i + 1}. (${px}, ${py})`, {
        size: 9,
        weight: 'bold',
        font: theme.fonts.grid,
        color: theme.colors.ink,
        baseline: 'top',
        maxWidth: colW - 3,
      })
    })
    y += listRows * 6 + 4

    /* ------------------------- bonus questions -------------------------- */
    if (b.bottom - y > 16) {
      y = drawSectionTitle(b, theme, y, 'Bonus questions')
      questions.forEach((q, i) => {
        const qy = y + i * 8
        if (qy + 7 > b.bottom) return
        b.text(b.left, qy, `${i + 1}. ${q.question}`, {
          size: 8.4,
          font: theme.fonts.body,
          color: theme.colors.ink,
          baseline: 'top',
          maxWidth: b.contentWidth * 0.68,
        })
        b.line(b.left + b.contentWidth * 0.7, qy + 4.4, b.right, qy + 4.4, {
          stroke: theme.colors.rule,
          lineWidth: 0.3,
        })
      })
    }

    /* ---------------------------- solution ----------------------------- */
    if (ctx.config.includeAnswerKey) {
      const sy = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: 'Completed picture',
        role: 'answerKey',
        tag: 'SOLUTION',
        nameLine: false,
      })
      const solUnit = clamp(Math.min(b.contentWidth * 0.8, b.bottom - sy - 20) / span, 3.5, 14)
      drawAxes(b.left + (b.contentWidth - span * solUnit) / 2, sy + 4, solUnit, true)
      b.text(b.left, sy + span * solUnit + 12, `The picture is ${payload.shapeName}.`, {
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

/** Exposed for tests: the shape catalogue used by the generator. */
export const COORDINATE_SHAPES: ReadonlyArray<ShapeDef> = SHAPES
