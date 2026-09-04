import { drawCardFrame, drawCutGuides, drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { cardGrid } from '../engines/layout/components'
import { drawMotif } from '../engines/layout/motifs'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp } from '../utils/misc'
import { fitTextSize, lineHeight, wrapText } from '../utils/text'
import { buildPrompts, validatePrompts, type PromptItem } from './promptSource'
import { baseMeta, finishDoc, fitBlock, playerCount, setupDoc } from './shared'

/**
 * Roll-and-move educational board game.
 *
 * The track is a ring around the edge of the page, which is the only layout
 * that reliably gives a printable board a long path AND a clear middle for the
 * rules. Ring geometry is computed from a (cols x rows) frame so the number of
 * spaces can be tuned to the requested game length without the board ever
 * spilling off the sheet.
 */

export type SpaceKind = 'start' | 'finish' | 'question' | 'bonus' | 'penalty' | 'plain'

export interface BoardSpace {
  index: number
  kind: SpaceKind
  label: string
  /** Grid position on the ring frame. */
  row: number
  col: number
}

export interface BoardPayload {
  cols: number
  rows: number
  spaces: BoardSpace[]
  cards: PromptItem[]
  players: number
  variant: string
}

const BONUSES = [
  'Move forward 2',
  'Roll again',
  'Move forward 1',
  'Swap places with any player',
  'Take an extra card for double points',
]

const PENALTIES = [
  'Miss a turn',
  'Move back 2',
  'Move back 1',
  'Answer two cards to move on',
  'Go back to the last question space',
]

/** Chooses a ring frame whose perimeter is closest to `target` spaces. */
function chooseFrame(target: number, aspect: number): { cols: number; rows: number } {
  let best = { cols: 7, rows: 7 }
  let bestScore = Infinity
  for (let cols = 5; cols <= 13; cols++) {
    for (let rows = 5; rows <= 15; rows++) {
      const perimeter = 2 * cols + 2 * rows - 4
      // Prefer the right length first, then a frame that suits the page shape.
      const score = Math.abs(perimeter - target) * 3 + Math.abs(rows / cols - aspect) * 8
      if (score < bestScore) {
        bestScore = score
        best = { cols, rows }
      }
    }
  }
  return best
}

/** Walks the ring clockwise from the bottom-left corner. */
function ringPositions(cols: number, rows: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let c = 0; c < cols; c++) out.push([rows - 1, c])
  for (let r = rows - 2; r >= 0; r--) out.push([r, cols - 1])
  for (let c = cols - 2; c >= 0; c--) out.push([0, c])
  for (let r = 1; r <= rows - 2; r++) out.push([r, 0])
  return out
}

export const boardGameGenerator: GameGenerator<BoardPayload> = {
  id: 'board-game',
  name: 'Educational Board Game',
  description: 'Roll-and-move board with question cards, bonuses and a rules panel.',
  category: 'board',
  glyph: 'BG',
  subjects: ['mathematics', 'english', 'science', 'geography', 'history', 'general-knowledge', 'vocabulary'],
  defaults: { itemCount: 24, lengthMinutes: 30, players: '3-4' },
  itemRange: [8, 48],
  itemLabel: 'Question cards',
  usesPlayers: true,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): BoardPayload {
    const { rng, config } = ctx

    // Longer sessions get a longer track; roughly one space per 25 seconds of
    // play once turn-taking is accounted for.
    const targetSpaces = clamp(Math.round(config.lengthMinutes * 1.4) + 12, 20, 48)
    const aspect = config.orientation === 'portrait' ? 1.35 : 0.75
    const { cols, rows } = chooseFrame(targetSpaces, aspect)
    const positions = ringPositions(cols, rows)

    const spaces: BoardSpace[] = positions.map(([row, col], i) => {
      if (i === 0) return { index: i, kind: 'start', label: 'START', row, col }
      if (i === positions.length - 1) return { index: i, kind: 'finish', label: 'FINISH', row, col }

      const roll = rng.next()
      if (roll < 0.5) return { index: i, kind: 'question', label: '?', row, col }
      if (roll < 0.64) return { index: i, kind: 'bonus', label: rng.pick(BONUSES), row, col }
      if (roll < 0.76) return { index: i, kind: 'penalty', label: rng.pick(PENALTIES), row, col }
      return { index: i, kind: 'plain', label: '', row, col }
    })

    const cardCount = clamp(config.itemCount, 8, 48)
    const cards = buildPrompts(ctx, cardCount, { maxPromptLength: 110 })

    return {
      cols,
      rows,
      spaces,
      cards,
      players: clamp(playerCount(config.players), 2, 6),
      variant: `${spaces.length}-space ring, ${cards.length} cards`,
    }
  },

  validate(payload, ctx) {
    const base = validatePrompts(payload.cards, clamp(ctx.config.itemCount, 8, 48))
    const questionSpaces = payload.spaces.filter((s) => s.kind === 'question').length
    const positions = new Set(payload.spaces.map((s) => `${s.row},${s.col}`))

    const structural = {
      ok: true,
      issues: [] as Array<{ severity: 'error' | 'warning'; code: string; message: string }>,
    }
    if (payload.spaces.length < 16) {
      structural.ok = false
      structural.issues.push({ severity: 'error', code: 'board.short', message: 'The track has fewer than 16 spaces.' })
    }
    if (positions.size !== payload.spaces.length) {
      structural.ok = false
      structural.issues.push({ severity: 'error', code: 'board.overlap', message: 'Two spaces share a position on the board.' })
    }
    if (payload.spaces[0]?.kind !== 'start' || payload.spaces[payload.spaces.length - 1]?.kind !== 'finish') {
      structural.ok = false
      structural.issues.push({ severity: 'error', code: 'board.ends', message: 'The track does not start at START and end at FINISH.' })
    }
    if (questionSpaces < 6) {
      structural.ok = false
      structural.issues.push({ severity: 'error', code: 'board.few-questions', message: `Only ${questionSpaces} question spaces on the track.` })
    }
    if (payload.cards.length < questionSpaces / 2) {
      structural.issues.push({
        severity: 'warning',
        code: 'board.card-supply',
        message: `${payload.cards.length} cards for ${questionSpaces} question spaces - the deck will be reshuffled.`,
      })
    }

    return { ok: base.ok && structural.ok, issues: [...base.issues, ...structural.issues] }
  },

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.cards.map((card, i) => ({ label: `Card ${i + 1}.`, answer: card.answer })),
      notes: ['Keep this page with the person checking answers, not with the players.'],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Race to the Finish',
      [
        `Print the board, cut out the question cards and shuffle them face down. ${payload.players} players is ideal.`,
        'Put a counter for each player on START. Youngest player goes first.',
        'Roll a die and move that many spaces clockwise around the track.',
        'Land on a "?" space: another player draws the top card and reads it to you. Answer correctly to stay; get it wrong and move back one space.',
        'Land on a shaded space: do exactly what it says.',
        'First player to reach FINISH wins. You do not need an exact roll.',
      ],
      {
        Spaces: payload.spaces.length,
        'Question spaces': payload.spaces.filter((s) => s.kind === 'question').length,
        Cards: payload.cards.length,
        Players: payload.players,
      },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx, undefined, 'board')
    const { cols, rows, spaces, cards } = payload

    /* ------------------------------ board ------------------------------ */
    const y = startGamePage(b, theme, ctx.meta, ctx.config, {
      label: 'Game board',
      role: 'board',
      tag: 'GAME BOARD',
      nameLine: false,
    })

    const boardH = b.bottom - y
    const cellW = Math.min(b.contentWidth / cols, boardH / rows)
    const boardW = cellW * cols
    const bx = b.left + (b.contentWidth - boardW) / 2
    const by = y + (boardH - cellW * rows) / 2

    const kindStyle: Record<SpaceKind, { fill: string; text: string }> = {
      start: { fill: theme.colors.accent, text: '#ffffff' },
      finish: { fill: theme.colors.accent, text: '#ffffff' },
      question: { fill: theme.colors.accentSoft, text: theme.colors.accent },
      bonus: { fill: theme.colors.highlight, text: theme.colors.ink },
      penalty: { fill: theme.colors.gridAlt, text: theme.colors.ink },
      plain: { fill: '#ffffff', text: theme.colors.ink },
    }

    spaces.forEach((space) => {
      const sx = bx + space.col * cellW
      const sy = by + space.row * cellW
      const style = kindStyle[space.kind]

      b.rect(sx + 0.4, sy + 0.4, cellW - 0.8, cellW - 0.8, {
        fill: style.fill,
        stroke: theme.colors.grid,
        lineWidth: 0.4,
        radius: 1.4,
      })

      // Space number, small and out of the way. Displayed 1-based: a player
      // counting squares starts at one, not at zero.
      b.text(sx + 1.6, sy + 1.4, String(space.index + 1), {
        size: Math.max(4.6, cellW * 0.17),
        color: space.kind === 'start' || space.kind === 'finish' ? '#ffffff' : theme.colors.muted,
        baseline: 'top',
        font: theme.fonts.body,
      })

      if (space.kind === 'question') {
        b.text(sx + cellW / 2, sy + cellW / 2, '?', {
          size: cellW * 1.9,
          align: 'center',
          weight: 'bold',
          color: style.text,
          baseline: 'middle',
          font: theme.fonts.heading,
        })
      } else if (space.kind === 'start' || space.kind === 'finish') {
        b.text(sx + cellW / 2, sy + cellW / 2, space.label, {
          size: fitTextSize(space.label, cellW - 2.5, cellW * 0.8, 4, theme.fonts.heading, 'bold'),
          align: 'center',
          weight: 'bold',
          color: style.text,
          baseline: 'middle',
          font: theme.fonts.heading,
        })
      } else if (space.label) {
        const { size, lines } = fitBlock(space.label, cellW - 2.4, cellW - 4, cellW * 0.42, theme, 3.6)
        const blockH = lines.length * lineHeight(size, 1.1)
        lines.forEach((line, li) => {
          b.text(sx + cellW / 2, sy + (cellW - blockH) / 2 + li * lineHeight(size, 1.1), line, {
            size,
            align: 'center',
            color: style.text,
            baseline: 'top',
            font: theme.fonts.body,
            maxWidth: cellW - 2.4,
          })
        })
      }
    })

    // Direction arrows around the ring, so play order is unambiguous.
    const arrowAt = (x: number, yy: number, angle: number): void => {
      const s = cellW * 0.22
      const pts: Array<[number, number]> = [
        [Math.cos(angle) * s, Math.sin(angle) * s],
        [Math.cos(angle + 2.5) * s, Math.sin(angle + 2.5) * s],
        [Math.cos(angle - 2.5) * s, Math.sin(angle - 2.5) * s],
      ].map(([dx, dy]) => [x + dx, yy + dy])
      b.polygon(pts, { fill: theme.colors.rule })
    }
    const innerX = bx + cellW * 1.5
    const innerY = by + cellW * 1.5
    const innerW = boardW - cellW * 3
    const innerH = cellW * rows - cellW * 3
    arrowAt(innerX + innerW / 2, innerY + innerH + cellW * 0.1, 0)
    arrowAt(innerX + innerW + cellW * 0.1, innerY + innerH / 2, -Math.PI / 2)
    arrowAt(innerX + innerW / 2, innerY - cellW * 0.1, Math.PI)
    arrowAt(innerX - cellW * 0.1, innerY + innerH / 2, Math.PI / 2)

    /* --------------------------- rules panel --------------------------- */
    const panelX = bx + cellW * 1.4
    const panelY = by + cellW * 1.4
    const panelW = boardW - cellW * 2.8
    const panelH = cellW * rows - cellW * 2.8

    b.rect(panelX, panelY, panelW, panelH, {
      fill: '#ffffff',
      stroke: theme.colors.panelBorder,
      lineWidth: 0.5,
      radius: 3,
    })
    // Measure the whole block first so the title, motif and rules sit as one
    // optically centred unit rather than clinging to the top of the panel.
    const ruleSize = 7.4
    const rulesText = ctx.config.includeInstructions ? ctx.meta.instructions.slice(1) : []
    const wrappedRules = rulesText.map((rule) => wrapText(rule, panelW - 19, ruleSize, theme.fonts.body))
    const rulesHeight = wrappedRules.reduce((a, l) => a + l.length * lineHeight(ruleSize, 1.22) + 1.2, 0)

    const titleSize = fitTextSize(ctx.meta.title, panelW - 12, 17, 9, theme.fonts.heading, 'bold')
    const motifSize = theme.decorative ? Math.min(panelW, panelH) * 0.13 : 0
    const blockH = motifSize * 1.5 + lineHeight(titleSize, 1.5) + rulesHeight
    let py = panelY + Math.max(6, (panelH - blockH) / 2)

    if (theme.decorative) {
      drawMotif(b, theme.motif, panelX + panelW / 2, py + motifSize * 0.6, motifSize, theme.colors.accent, 0.35)
      py += motifSize * 1.5
    }

    b.text(panelX + panelW / 2, py, ctx.meta.title, {
      size: titleSize,
      align: 'center',
      weight: 'bold',
      color: theme.colors.accent,
      font: theme.fonts.heading,
      baseline: 'top',
      maxWidth: panelW - 12,
    })
    py += lineHeight(titleSize, 1.5)

    if (ctx.config.includeInstructions) {
      const available = panelY + panelH - py - 4
      const fitted = wrappedRules
      if (rulesHeight <= available) {
        fitted.forEach((lines, i) => {
          b.text(panelX + 7, py, `${i + 1}.`, {
            size: ruleSize, weight: 'bold', color: theme.colors.accent, baseline: 'top', font: theme.fonts.body,
          })
          lines.forEach((line, li) => {
            b.text(panelX + 12, py + li * lineHeight(ruleSize, 1.22), line, {
              size: ruleSize, color: theme.colors.ink, baseline: 'top', font: theme.fonts.body, maxWidth: panelW - 18,
            })
          })
          py += lines.length * lineHeight(ruleSize, 1.22) + 1.2
        })
      } else {
        b.text(panelX + panelW / 2, py, 'Full rules are printed on the card sheet.', {
          size: 7.6, align: 'center', style: 'italic', color: theme.colors.muted, baseline: 'top', font: theme.fonts.body,
          maxWidth: panelW - 12,
        })
      }
    }

    /* --------------------------- question cards -------------------------- */
    const cols2 = 3
    const rows2 = 5
    const perPage = cols2 * rows2
    for (let p = 0; p * perPage < cards.length; p++) {
      const pageCards = cards.slice(p * perPage, (p + 1) * perPage)
      let cy = startGamePage(b, theme, ctx.meta, ctx.config, {
        label: `Question cards ${p + 1}`,
        role: 'cards',
        tag: `QUESTION CARDS ${p + 1}`,
        nameLine: false,
        compact: true,
      })

      if (p === 0) {
        cy = drawInstructions(b, theme, cy, [
          'Cut out the cards and shuffle them into a face-down pile.',
          'When a player lands on "?", the player to their left draws the top card and reads the question.',
          'Answers are on the answer key - keep it away from the players, or let the reader check it.',
          'Return used cards to the bottom of the pile.',
        ], { heading: 'Using the cards' })
      }

      const gridOpts = {
        cols: cols2,
        rows: rows2,
        x: b.left,
        y: cy,
        width: b.contentWidth,
        height: b.bottom - cy - 2,
        gap: 2.5,
      }
      if (ctx.config.cutLines) drawCutGuides(b, theme, gridOpts)
      const rects = cardGrid(gridOpts)

      pageCards.forEach((card, i) => {
        const rect = rects[i]
        const bodyTop = drawCardFrame(b, theme, rect, {
          headerHeight: 5.5,
          headerLabel: `Card ${p * perPage + i + 1}`,
        })
        const pad = 2.6
        const { size, lines } = fitBlock(card.prompt, rect.w - pad * 2, rect.y + rect.h - bodyTop - pad * 2, 9, theme, 5)
        const blockH = lines.length * lineHeight(size, 1.2)
        const top = bodyTop + (rect.y + rect.h - bodyTop - blockH) / 2
        lines.forEach((line, li) => {
          b.text(rect.x + rect.w / 2, top + li * lineHeight(size, 1.2), line, {
            size,
            align: 'center',
            font: theme.fonts.body,
            color: theme.colors.ink,
            baseline: 'top',
            maxWidth: rect.w - pad * 2,
          })
        })
      })
    }

    /* ------------------------------ scores ------------------------------ */
    let sy = startGamePage(b, theme, ctx.meta, ctx.config, {
      label: 'Score sheet',
      role: 'game',
      tag: 'SCORE SHEET',
      nameLine: false,
      compact: true,
    })
    sy = drawSectionTitle(b, theme, sy, 'Score sheet')
    const nameW = b.contentWidth * 0.28
    const roundW = (b.contentWidth - nameW) / 10
    for (let r = 0; r <= payload.players; r++) {
      const ry = sy + r * 9
      b.rect(b.left, ry, nameW, 9, {
        stroke: theme.colors.grid,
        lineWidth: 0.3,
        fill: r === 0 ? theme.colors.accentSoft : undefined,
      })
      b.text(b.left + 2, ry + 4.5, r === 0 ? 'Player' : `${r}.`, {
        size: 8.4,
        weight: r === 0 ? 'bold' : 'normal',
        color: r === 0 ? theme.colors.accent : theme.colors.muted,
        baseline: 'middle',
        font: theme.fonts.body,
      })
      for (let c = 0; c < 10; c++) {
        b.rect(b.left + nameW + c * roundW, ry, roundW, 9, {
          stroke: theme.colors.grid,
          lineWidth: 0.3,
          fill: r === 0 ? theme.colors.accentSoft : undefined,
        })
        if (r === 0) {
          b.text(b.left + nameW + c * roundW + roundW / 2, ry + 4.5, String(c + 1), {
            size: 7.6, align: 'center', weight: 'bold', color: theme.colors.accent, baseline: 'middle', font: theme.fonts.body,
          })
        }
      }
    }

    return finishDoc(b, theme, ctx)
  },
}
