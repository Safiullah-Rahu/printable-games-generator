import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { drawTable } from '../engines/layout/grid'
import { check, combine } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { chunk, clamp } from '../utils/misc'
import { lineHeight, wrapText } from '../utils/text'
import { buildPrompts, validatePrompts, type PromptItem } from './promptSource'
import { baseMeta, finishDoc, playerCount, setupDoc } from './shared'

/**
 * Team trivia / quiz night.
 *
 * Produces three distinct artefacts from one generation, because a trivia game
 * that prints only the questions is unusable in a classroom:
 *
 *   - a QUIZ MASTER sheet with questions and answers side by side;
 *   - a TEAM ANSWER SHEET with numbered blanks and a score column;
 *   - a SCORE TABLE for tallying rounds.
 *
 * Points rise round by round, so a team that starts badly can still come back -
 * which is what keeps a whole class engaged to the end.
 */

export interface TriviaQuestion {
  number: number
  item: PromptItem
  points: number
}

export interface TriviaRound {
  index: number
  name: string
  questions: TriviaQuestion[]
}

export interface TriviaPayload {
  rounds: TriviaRound[]
  teams: number
  totalPoints: number
  variant: string
}

const ROUND_NAMES = [
  'Warm-Up', 'Getting Going', 'Picking Up Speed', 'Halfway There',
  'Tricky Territory', 'The Home Straight', 'Final Round', 'Sudden Death',
]

export const triviaGameGenerator: GameGenerator<TriviaPayload> = {
  id: 'trivia-game',
  name: 'Trivia Game',
  description: 'Team quiz with rounds, rising points, a quiz-master sheet and answer sheets.',
  category: 'trivia',
  glyph: 'TR',
  subjects: ['mathematics', 'english', 'science', 'geography', 'history', 'general-knowledge', 'logic', 'vocabulary'],
  defaults: { itemCount: 20, lengthMinutes: 30, players: '5+' },
  itemRange: [8, 60],
  itemLabel: 'Questions',
  usesPlayers: true,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): TriviaPayload {
    const { config } = ctx
    const total = clamp(config.itemCount, 8, 60)
    const items = buildPrompts(ctx, total, { maxPromptLength: 140 })

    // Aim for five questions a round, but never leave a round of one.
    const perRound = total <= 12 ? 4 : total <= 30 ? 5 : 6
    const groups = chunk(items, perRound)
    if (groups.length > 1 && groups[groups.length - 1].length < 2) {
      const orphan = groups.pop()
      if (orphan) groups[groups.length - 1].push(...orphan)
    }

    let counter = 0
    const rounds: TriviaRound[] = groups.map((group, ri) => ({
      index: ri + 1,
      name: ROUND_NAMES[Math.min(ri, ROUND_NAMES.length - 1)],
      questions: group.map((item) => {
        counter += 1
        return { number: counter, item, points: 10 + ri * 5 }
      }),
    }))

    return {
      rounds,
      teams: clamp(playerCount(config.players) <= 2 ? 2 : Math.ceil(playerCount(config.players) / 2), 2, 8),
      totalPoints: rounds.reduce((a, r) => a + r.questions.reduce((b2, q) => b2 + q.points, 0), 0),
      variant: `${rounds.length} rounds x ~${perRound} questions`,
    }
  },

  validate(payload, ctx) {
    const items = payload.rounds.flatMap((r) => r.questions.map((q) => q.item))
    const base = validatePrompts(items, clamp(ctx.config.itemCount, 8, 60))
    const numbers = payload.rounds.flatMap((r) => r.questions.map((q) => q.number))

    return combine(
      base,
      check([
        [payload.rounds.length >= 1, 'trivia.no-rounds', 'No rounds were produced.'],
        [payload.rounds.every((r) => r.questions.length >= 2), 'trivia.thin-round', 'A round has fewer than two questions.'],
        [
          numbers.every((n, i) => n === i + 1),
          'trivia.numbering',
          'Question numbering is not continuous across the rounds.',
        ],
        [
          payload.totalPoints === payload.rounds.reduce((a, r) => a + r.questions.reduce((b, q) => b + q.points, 0), 0),
          'trivia.points',
          'The stated total does not match the points on the questions.',
        ],
      ]),
    )
  },

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.rounds.flatMap((round) =>
        round.questions.map((q) => ({
          label: `R${round.index} Q${q.number}`,
          answer: q.item.answer,
        })),
      ),
      notes: [`Total available: ${payload.totalPoints} points across ${payload.rounds.length} rounds.`],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Trivia Night',
      [
        `Split into teams. ${payload.teams} teams works well for this set.`,
        'The quiz master reads each question twice, then moves on.',
        'Teams write their answer on the answer sheet - no calling out.',
        'Later rounds are worth more points, so nobody is out of it early.',
        'Swap answer sheets between teams to mark, then total the scores.',
      ],
      {
        Rounds: payload.rounds.length,
        Questions: payload.rounds.reduce((a, r) => a + r.questions.length, 0),
        'Total points': payload.totalPoints,
        Teams: payload.teams,
      },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)
    const { rounds, teams } = payload

    /* -------------------------- quiz master ---------------------------- */
    let y = startGamePage(b, theme, ctx.meta, ctx.config, {
      label: 'Quiz master sheet',
      tag: 'QUIZ MASTER - DO NOT SHOW TEAMS',
      nameLine: false,
    })
    if (ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, ctx.meta.instructions, { heading: 'Running the quiz' })
    }

    const qSize = 8.4
    const answerW = b.contentWidth * 0.3

    rounds.forEach((round) => {
      const heading = `Round ${round.index}: ${round.name}  (${round.questions[0].points} points each)`
      // Start a fresh page rather than splitting a round across the fold.
      const estimated = 8 + round.questions.length * 11
      if (b.bottom - y < estimated) {
        y = startGamePage(b, theme, ctx.meta, ctx.config, {
          label: `Quiz master - round ${round.index}`,
          tag: 'QUIZ MASTER',
          nameLine: false,
          compact: true,
        })
      }
      y = drawSectionTitle(b, theme, y, heading)

      round.questions.forEach((q) => {
        const lines = wrapText(`${q.number}. ${q.item.prompt}`, b.contentWidth - answerW - 6, qSize, theme.fonts.body)
        const blockH = Math.max(lines.length * lineHeight(qSize, 1.24), 6)

        if (b.bottom - y < blockH + 4) {
          y = startGamePage(b, theme, ctx.meta, ctx.config, {
            label: `Quiz master - round ${round.index} (cont.)`,
            tag: 'QUIZ MASTER',
            nameLine: false,
            compact: true,
          })
        }

        lines.forEach((line, li) => {
          b.text(b.left, y + li * lineHeight(qSize, 1.24), line, {
            size: qSize,
            font: theme.fonts.body,
            color: theme.colors.ink,
            baseline: 'top',
            maxWidth: b.contentWidth - answerW - 6,
          })
        })

        // The answer sits in a tinted box on the right so it is easy to find
        // while reading aloud, and easy to cover with a hand.
        b.rect(b.right - answerW, y - 0.8, answerW, blockH + 1, {
          fill: theme.colors.accentSoft,
          radius: 1,
        })
        b.text(b.right - answerW + 2, y + blockH / 2 - 0.4, q.item.answer, {
          size: qSize,
          weight: 'bold',
          font: theme.fonts.body,
          color: theme.colors.accent,
          baseline: 'middle',
          maxWidth: answerW - 4,
        })

        y += blockH + 2.6
      })

      y += 3
    })

    /* ------------------------- team answer sheet ------------------------ */
    let ay = startGamePage(b, theme, ctx.meta, ctx.config, {
      label: 'Team answer sheet',
      tag: 'TEAM ANSWER SHEET',
      nameLine: false,
      compact: true,
    })

    b.text(b.left, ay, 'Team name', {
      size: 9, weight: 'bold', color: theme.colors.accent, baseline: 'top', font: theme.fonts.heading,
    })
    b.line(b.left + 24, ay + 4.6, b.left + b.contentWidth * 0.62, ay + 4.6, {
      stroke: theme.colors.rule, lineWidth: 0.4,
    })
    b.text(b.left + b.contentWidth * 0.68, ay, 'Total', {
      size: 9, weight: 'bold', color: theme.colors.accent, baseline: 'top', font: theme.fonts.heading,
    })
    b.rect(b.left + b.contentWidth * 0.78, ay - 1.5, b.contentWidth * 0.22, 9, {
      stroke: theme.colors.rule, lineWidth: 0.5, radius: 1.5,
    })
    ay += 12

    rounds.forEach((round) => {
      const needed = 7 + round.questions.length * 9
      if (b.bottom - ay < needed) {
        ay = startGamePage(b, theme, ctx.meta, ctx.config, {
          label: 'Team answer sheet (cont.)',
          tag: 'TEAM ANSWER SHEET',
          nameLine: false,
          compact: true,
        })
      }
      ay = drawSectionTitle(b, theme, ay, `Round ${round.index}: ${round.name}`)
      round.questions.forEach((q) => {
        b.text(b.left, ay + 4, `${q.number}.`, {
          size: 8.6, weight: 'bold', color: theme.colors.muted, baseline: 'middle', font: theme.fonts.body,
        })
        b.line(b.left + 8, ay + 6.4, b.right - 16, ay + 6.4, {
          stroke: theme.colors.rule, lineWidth: 0.3,
        })
        b.rect(b.right - 13, ay + 0.6, 13, 7, {
          stroke: theme.colors.rule, lineWidth: 0.3, radius: 1,
        })
        ay += 9
      })
      ay += 3
    })

    /* ---------------------------- score table --------------------------- */
    const sy = startGamePage(b, theme, ctx.meta, ctx.config, {
      label: 'Score table',
      tag: 'SCORE TABLE',
      nameLine: false,
      compact: true,
    })
    const teamColW = (b.contentWidth - 34) / Math.max(1, rounds.length + 1)
    drawTable(b, {
      x: b.left,
      y: drawSectionTitle(b, theme, sy, 'Scores'),
      width: b.contentWidth,
      rowHeight: 9,
      columns: [
        { label: 'Team', width: 34 },
        ...rounds.map((r) => ({ label: `R${r.index}`, width: teamColW, align: 'center' as const })),
        { label: 'Total', width: teamColW, align: 'center' as const },
      ],
      rows: Array.from({ length: teams }, (_, i) => [`${i + 1}.`, ...rounds.map(() => ''), '']),
      headerFill: theme.colors.accentSoft,
      headerColor: theme.colors.accent,
      stripeFill: theme.colors.gridAlt,
      stroke: theme.colors.rule,
      size: 8.4,
      font: theme.fonts.body,
    })

    return finishDoc(b, theme, ctx)
  },
}
