import { buildSequence, type SequenceSpec } from '../engines/equations'
import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { check, combine } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp, uniqueBy } from '../utils/misc'
import { measureText } from '../utils/text'
import { baseMeta, finishDoc, setupDoc } from './shared'

/**
 * Sequence puzzles: spot the rule, fill the gap.
 *
 * The interesting design choice is WHICH term to hide. Hiding the last term
 * only ever tests "continue the pattern"; hiding an interior term forces the
 * solver to reason from both sides, which is a genuinely different skill. The
 * mix shifts towards interior gaps as difficulty rises, and harder sheets also
 * ask the solver to state the rule in words.
 */

export interface SequenceRow {
  index: number
  spec: SequenceSpec
  /** Indices of every hidden term. */
  hidden: number[]
  askRule: boolean
}

export interface SequencePayload {
  rows: SequenceRow[]
  askRules: boolean
  variant: string
}

export const sequencePuzzleGenerator: GameGenerator<SequencePayload> = {
  id: 'sequence-puzzle',
  name: 'Sequence Puzzle',
  description: 'Number patterns with missing terms, from skip-counting to quadratics.',
  category: 'math',
  glyph: 'SQ',
  subjects: ['mathematics', 'logic'],
  defaults: { itemCount: 12, lengthMinutes: 15, subject: 'mathematics' },
  itemRange: [4, 24],
  itemLabel: 'Sequences',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): SequencePayload {
    const { rng, profile, config } = ctx
    const want = clamp(config.itemCount, 4, 24)
    const askRules = profile.score >= 40

    const specs: SequenceSpec[] = []
    let guard = 0
    while (specs.length < want && guard < want * 30 + 200) {
      guard++
      const spec = buildSequence(rng, profile)
      // Reject runaway magnitudes - they stop being a pattern and start being
      // an arithmetic slog that will not fit the row either.
      if (spec.terms.some((t) => Math.abs(t) > 100000)) continue
      specs.push(spec)
    }

    const deduped = uniqueBy(specs, (s) => s.terms.join(','))

    const rows: SequenceRow[] = deduped.slice(0, want).map((spec, i) => {
      const hidden = new Set<number>([spec.hiddenIndex])
      // Harder sheets hide a second term, never two adjacent ones.
      if (profile.score >= 55 && rng.chance(0.4)) {
        const candidates = spec.terms
          .map((_, k) => k)
          .filter((k) => k !== spec.hiddenIndex && Math.abs(k - spec.hiddenIndex) > 1 && k > 0)
        if (candidates.length > 0) hidden.add(rng.pick(candidates))
      }
      return {
        index: i + 1,
        spec,
        hidden: Array.from(hidden).sort((a, b) => a - b),
        askRule: askRules && rng.chance(0.5),
      }
    })

    return {
      rows,
      askRules,
      variant: `${rows.length} sequences${askRules ? ', some ask for the rule' : ''}`,
    }
  },

  validate(payload, ctx) {
    const want = clamp(ctx.config.itemCount, 4, 24)

    const structural = check([
      [payload.rows.length >= Math.min(4, want), 'seq.too-few', `Only ${payload.rows.length} sequences were produced.`],
      [payload.rows.length >= want, 'seq.short', `Produced ${payload.rows.length} of ${want}.`, 'warning'],
      [
        new Set(payload.rows.map((r) => r.spec.terms.join(','))).size === payload.rows.length,
        'seq.duplicate',
        'Two sequences on the sheet are identical.',
      ],
    ])

    const perRow = payload.rows.map((row) => {
      const visible = row.spec.terms.filter((_, k) => !row.hidden.includes(k))
      return check([
        [row.hidden.length >= 1, 'seq.no-blank', `Sequence ${row.index} has no hidden term.`],
        [visible.length >= 3, 'seq.too-many-blanks', `Sequence ${row.index} leaves fewer than three terms visible.`],
        [
          row.hidden.every((k) => k >= 0 && k < row.spec.terms.length),
          'seq.bad-index',
          `Sequence ${row.index} hides a term that does not exist.`,
        ],
        [
          row.spec.terms.every((t) => Number.isFinite(t)),
          'seq.non-finite',
          `Sequence ${row.index} contains a value that is not a number.`,
        ],
        // Two identical visible terms in an arithmetic run would make the rule
        // ambiguous; a constant sequence is not a puzzle.
        [
          new Set(row.spec.terms).size > 1,
          'seq.constant',
          `Sequence ${row.index} does not change.`,
        ],
      ])
    })

    return combine(structural, ...perRow)
  },

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.rows.map((row) => ({
        label: `${row.index}.`,
        answer:
          `${row.hidden.map((k) => row.spec.terms[k]).join(', ')}` +
          (row.askRule ? `   [rule: ${row.spec.rule}]` : ''),
      })),
      notes: ['Where a rule was requested, an equivalent wording is also acceptable.'],
    }
  },

  meta(payload, ctx): GameMeta {
    const instructions = [
      'Look at each row and work out the rule that connects the numbers.',
      'Write the missing number (or numbers) in the empty boxes.',
    ]
    if (payload.askRules) {
      instructions.push('Where you see "Rule:", also write the pattern in your own words.')
    }
    instructions.push('Check your answer by applying your rule to every term in the row.')

    return baseMeta(
      ctx.config,
      'Sequence Puzzles',
      instructions,
      {
        Sequences: payload.rows.length,
        Blanks: payload.rows.reduce((a, r) => a + r.hidden.length, 0),
        'Rule questions': payload.rows.filter((r) => r.askRule).length,
      },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)
    const { rows } = payload

    let y = startGamePage(b, theme, ctx.meta, ctx.config)
    if (ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, ctx.meta.instructions)
    }
    y = drawSectionTitle(b, theme, y, 'Find the missing numbers')

    const available = b.bottom - y - 2
    const rowH = clamp(available / rows.length, 9, 20)
    const textSize = clamp(rowH * 0.52, 7, 12)
    const boxW = textSize * 2.6
    const boxH = Math.min(rowH * 0.72, textSize * 1.7)

    rows.forEach((row, i) => {
      const ry = y + i * rowH
      const cy = ry + rowH / 2

      if (i % 2 === 1) {
        b.rect(b.left - 1, ry, b.contentWidth + 2, rowH, { fill: theme.colors.gridAlt })
      }

      b.text(b.left, cy, `${row.index}.`, {
        size: textSize * 0.92,
        weight: 'bold',
        color: theme.colors.accent,
        font: theme.fonts.body,
        baseline: 'middle',
      })

      let x = b.left + textSize * 2.2
      const ruleWidth = row.askRule ? b.contentWidth * 0.3 : 0
      const termsLimit = b.right - ruleWidth - 4

      row.spec.terms.forEach((term, k) => {
        const isHidden = row.hidden.includes(k)
        if (x > termsLimit) return

        if (isHidden) {
          b.rect(x, cy - boxH / 2, boxW, boxH, {
            stroke: theme.colors.accent,
            lineWidth: 0.5,
            radius: 1,
            fill: '#ffffff',
          })
          x += boxW
        } else {
          const label = String(term)
          b.text(x, cy, label, {
            size: textSize,
            weight: 'bold',
            font: theme.fonts.grid,
            color: theme.colors.ink,
            baseline: 'middle',
          })
          x += measureText(label, textSize, theme.fonts.grid, 'bold')
        }

        if (k < row.spec.terms.length - 1) {
          b.text(x + 1, cy, ',', {
            size: textSize, font: theme.fonts.grid, color: theme.colors.muted, baseline: 'middle',
          })
          x += textSize * 0.62
        }
      })

      if (row.askRule) {
        const rx = b.right - ruleWidth
        b.text(rx, cy, 'Rule:', {
          size: textSize * 0.82,
          style: 'italic',
          color: theme.colors.muted,
          font: theme.fonts.body,
          baseline: 'middle',
        })
        const labelW = measureText('Rule:', textSize * 0.82, theme.fonts.body, 'normal', 'italic') + 2
        b.line(rx + labelW, cy + boxH / 3, b.right, cy + boxH / 3, {
          stroke: theme.colors.rule,
          lineWidth: 0.3,
        })
      }
    })

    return finishDoc(b, theme, ctx)
  },
}
