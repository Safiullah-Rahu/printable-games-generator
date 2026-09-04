import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { drawTable } from '../engines/layout/grid'
import { check, combine } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import type { Rng } from '../utils/rng'
import { clamp, range } from '../utils/misc'
import { lineHeight, wrapText } from '../utils/text'
import { baseMeta, finishDoc, setupDoc } from './shared'

/**
 * Grid-deduction logic puzzles ("Amina owns the rabbit and travels by bus").
 *
 * The hard part is not generating a puzzle - it is generating one that has
 * exactly one answer and no redundant clues. The approach:
 *
 *   1. invent a random solution;
 *   2. derive a large pool of statements that are TRUE of that solution;
 *   3. add clues one at a time until a real solver reports a single solution;
 *   4. try to remove each clue again, keeping only those that are load-bearing;
 *   5. add a few back for easier difficulty settings.
 *
 * Step 3 and 4 both call `countSolutions`, a depth-first search over one
 * permutation per category that prunes with every clue whose categories are
 * already assigned. That pruning is what keeps a 5-entity, 3-category puzzle
 * instant instead of exponential.
 */

interface CategoryTemplate {
  name: string
  /** Third-person form: "owns the". */
  verb: string
  /** Base form for negatives: "own the". */
  base: string
  values: string[]
}

const ENTITY_SETS: string[][] = [
  ['Amina', 'Ben', 'Chloe', 'Dev', 'Elena'],
  ['Farid', 'Grace', 'Hugo', 'Iris', 'Jonah'],
  ['Kaya', 'Liam', 'Maya', 'Noor', 'Omar'],
  ['Priya', 'Quinn', 'Rosa', 'Sam', 'Tara'],
]

const CATEGORY_TEMPLATES: CategoryTemplate[] = [
  { name: 'Pet', verb: 'owns the', base: 'own the', values: ['dog', 'cat', 'rabbit', 'parrot', 'hamster'] },
  { name: 'Colour', verb: 'wears', base: 'wear', values: ['red', 'blue', 'green', 'yellow', 'purple'] },
  { name: 'Sport', verb: 'plays', base: 'play', values: ['tennis', 'football', 'hockey', 'basketball', 'badminton'] },
  { name: 'Fruit', verb: 'brought a', base: 'bring a', values: ['apple', 'banana', 'orange', 'pear', 'mango'] },
  { name: 'Subject', verb: 'likes', base: 'like', values: ['maths', 'science', 'art', 'music', 'history'] },
  { name: 'Travel', verb: 'travels by', base: 'travel by', values: ['bus', 'bike', 'train', 'car', 'tram'] },
  { name: 'Instrument', verb: 'plays the', base: 'play the', values: ['piano', 'guitar', 'violin', 'drums', 'flute'] },
  { name: 'Place', verb: 'visited the', base: 'visit the', values: ['park', 'museum', 'beach', 'zoo', 'library'] },
  { name: 'Snack', verb: 'chose', base: 'choose', values: ['crackers', 'popcorn', 'yoghurt', 'raisins', 'pretzels'] },
]

export type ClueSpec =
  | { t: 'is'; e: number; cat: number; val: number }
  | { t: 'not'; e: number; cat: number; val: number }
  | { t: 'link'; catA: number; valA: number; catB: number; valB: number }
  | { t: 'unlink'; catA: number; valA: number; catB: number; valB: number }

export interface LogicPayload {
  entities: string[]
  categories: CategoryTemplate[]
  /** solution[categoryIndex][entityIndex] = value index. */
  solution: number[][]
  clues: ClueSpec[]
  clueTexts: string[]
  variant: string
}

/* ------------------------------ solver ------------------------------ */

function permutations(n: number): number[][] {
  const out: number[][] = []
  const current: number[] = []
  const used = Array(n).fill(false)
  const recurse = (): void => {
    if (current.length === n) {
      out.push(current.slice())
      return
    }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue
      used[i] = true
      current.push(i)
      recurse()
      current.pop()
      used[i] = false
    }
  }
  recurse()
  return out
}

function clueCategories(clue: ClueSpec): number[] {
  return clue.t === 'is' || clue.t === 'not' ? [clue.cat] : [clue.catA, clue.catB]
}

/** Evaluates a clue against an assignment where `assigned` categories are set. */
function clueHolds(clue: ClueSpec, assign: number[][]): boolean {
  if (clue.t === 'is') return assign[clue.cat][clue.e] === clue.val
  if (clue.t === 'not') return assign[clue.cat][clue.e] !== clue.val
  const entity = assign[clue.catA].indexOf(clue.valA)
  if (entity < 0) return false
  const other = assign[clue.catB][entity]
  return clue.t === 'link' ? other === clue.valB : other !== clue.valB
}

/**
 * Counts consistent assignments, stopping at `cap`. Categories are assigned one
 * whole permutation at a time and every fully-determined clue is checked
 * immediately, so contradictory branches die at the first category rather than
 * at the leaves.
 */
function countSolutions(
  clues: ClueSpec[],
  categoryCount: number,
  perms: number[][],
  cap = 2,
): number {
  let count = 0
  const assign: number[][] = []

  // Group clues by the highest category they mention, so each depth only
  // re-checks the clues that just became decidable.
  const byDepth: ClueSpec[][] = range(categoryCount).map(() => [])
  for (const clue of clues) {
    byDepth[Math.max(...clueCategories(clue))].push(clue)
  }

  const dfs = (cat: number): void => {
    if (count >= cap) return
    if (cat === categoryCount) {
      count++
      return
    }
    for (const perm of perms) {
      assign[cat] = perm
      if (byDepth[cat].every((clue) => clueHolds(clue, assign))) dfs(cat + 1)
      if (count >= cap) return
    }
    assign[cat] = []
  }

  dfs(0)
  return count
}

/* ---------------------------- generation ---------------------------- */

function renderClue(payload: Omit<LogicPayload, 'clueTexts' | 'variant'>, clue: ClueSpec): string {
  const { entities, categories } = payload
  if (clue.t === 'is') {
    return `${entities[clue.e]} ${categories[clue.cat].verb} ${categories[clue.cat].values[clue.val]}.`
  }
  if (clue.t === 'not') {
    return `${entities[clue.e]} does not ${categories[clue.cat].base} ${categories[clue.cat].values[clue.val]}.`
  }
  const a = `${categories[clue.catA].verb} ${categories[clue.catA].values[clue.valA]}`
  if (clue.t === 'link') {
    return `The person who ${a} also ${categories[clue.catB].verb} ${categories[clue.catB].values[clue.valB]}.`
  }
  return `The person who ${a} does not ${categories[clue.catB].base} ${categories[clue.catB].values[clue.valB]}.`
}

function buildCluePool(solution: number[][], entityCount: number, categoryCount: number, rng: Rng): ClueSpec[] {
  const pool: ClueSpec[] = []

  for (let cat = 0; cat < categoryCount; cat++) {
    for (let e = 0; e < entityCount; e++) {
      pool.push({ t: 'is', e, cat, val: solution[cat][e] })
      for (let v = 0; v < entityCount; v++) {
        if (v !== solution[cat][e]) pool.push({ t: 'not', e, cat, val: v })
      }
    }
  }

  for (let a = 0; a < categoryCount; a++) {
    for (let b = 0; b < categoryCount; b++) {
      if (a === b) continue
      for (let e = 0; e < entityCount; e++) {
        pool.push({ t: 'link', catA: a, valA: solution[a][e], catB: b, valB: solution[b][e] })
        for (let v = 0; v < entityCount; v++) {
          if (v !== solution[b][e]) {
            pool.push({ t: 'unlink', catA: a, valA: solution[a][e], catB: b, valB: v })
          }
        }
      }
    }
  }

  return rng.shuffle(pool)
}

export const logicPuzzleGenerator: GameGenerator<LogicPayload> = {
  id: 'logic-puzzle',
  name: 'Logic Puzzle',
  description: 'Deduction grid puzzle with clues that lead to exactly one answer.',
  category: 'puzzle',
  glyph: 'LP',
  subjects: ['logic', 'general-knowledge', 'mathematics'],
  defaults: { itemCount: 8, lengthMinutes: 20, subject: 'logic' },
  itemRange: [4, 16],
  itemLabel: 'Clues',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): LogicPayload {
    const { rng, profile } = ctx
    let [entityCount, categoryCount] = profile.logicSize
    entityCount = clamp(entityCount, 3, 5)
    categoryCount = clamp(categoryCount, 2, 4)
    // Keep the search space sane: 5 entities x 4 categories is 120^4 leaves.
    if (entityCount === 5 && categoryCount > 3) categoryCount = 3

    const entities = rng.pick(ENTITY_SETS).slice(0, entityCount)
    const categories = rng.sample(CATEGORY_TEMPLATES, categoryCount).map((template) => ({
      ...template,
      values: rng.shuffle(template.values).slice(0, entityCount),
    }))

    const perms = permutations(entityCount)
    const solution = range(categoryCount).map(() => rng.pick(perms).slice())

    const base = { entities, categories, solution, clues: [] as ClueSpec[] }
    const pool = buildCluePool(solution, entityCount, categoryCount, rng)

    // 1. Add clues until the puzzle pins down a single answer.
    const chosen: ClueSpec[] = []
    for (const clue of pool) {
      chosen.push(clue)
      if (countSolutions(chosen, categoryCount, perms, 2) === 1) break
    }
    if (countSolutions(chosen, categoryCount, perms, 2) !== 1) {
      throw new Error('Clue pool did not determine a unique solution')
    }

    // 2. Drop every clue that is not load-bearing.
    let minimal = chosen.slice()
    for (const clue of rng.shuffle(chosen)) {
      const without = minimal.filter((c) => c !== clue)
      if (without.length === 0) continue
      if (countSolutions(without, categoryCount, perms, 2) === 1) {
        minimal = without
      }
    }

    // 3. Easier settings get extra (redundant but true) clues as scaffolding.
    const extras = Math.max(0, Math.round(minimal.length * (profile.clueGenerosity - 1)))
    const spare = pool.filter((c) => !minimal.includes(c)).slice(0, extras)
    const clues = rng.shuffle([...minimal, ...spare])

    const payload = { ...base, clues }
    return {
      ...payload,
      clueTexts: clues.map((clue) => renderClue(payload, clue)),
      variant: `${entityCount} people x ${categoryCount} categories, ${clues.length} clues`,
    }
  },

  validate(payload) {
    const { entities, categories, solution, clues } = payload
    const entityCount = entities.length
    const categoryCount = categories.length
    const perms = permutations(entityCount)

    const solutions = countSolutions(clues, categoryCount, perms, 3)
    const allTrue = clues.every((clue) => clueHolds(clue, solution))

    return combine(
      check([
        [solutions === 1, 'logic.uniqueness', `The clues allow ${solutions >= 3 ? '3 or more' : solutions} solutions, expected exactly 1.`],
        [allTrue, 'logic.false-clue', 'A clue is not true of the intended solution.'],
        [clues.length >= 3, 'logic.too-few', 'Fewer than three clues were produced.'],
        [clues.length <= 22, 'logic.too-many', `${clues.length} clues will not fit the page.`, 'warning'],
        [
          solution.every((row) => new Set(row).size === entityCount),
          'logic.not-permutation',
          'A category assigns the same value to two people.',
        ],
        [
          categories.every((c) => c.values.length === entityCount),
          'logic.category-size',
          'A category does not have one value per person.',
        ],
      ]),
    )
  },

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.entities.map((entity, e) => ({
        label: entity,
        answer: payload.categories.map((cat, ci) => `${cat.name}: ${cat.values[payload.solution[ci][e]]}`).join('  |  '),
      })),
      notes: ['Every clue is true of this solution, and no other arrangement fits them all.'],
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Logic Puzzle',
      [
        `Work out which ${payload.categories.map((c) => c.name.toLowerCase()).join(', ')} belongs to each person.`,
        'Use the grid to record what you know: put a cross in a box you can rule out, and a tick when you are sure.',
        'When a row or column has only one box left, that must be the answer.',
        'Every clue is true, and the clues together lead to exactly one solution.',
        'Write your final answers in the table at the bottom.',
      ],
      {
        People: payload.entities.length,
        Categories: payload.categories.length,
        Clues: payload.clues.length,
      },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)
    const { entities, categories, clueTexts } = payload

    let y = startGamePage(b, theme, ctx.meta, ctx.config)
    if (ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, ctx.meta.instructions)
    }

    /* ------------------------------ clues ------------------------------ */
    y = drawSectionTitle(b, theme, y, 'Clues')
    const clueSize = 8.6
    const clueCols = clueTexts.length > 8 ? 2 : 1
    const clueColW = (b.contentWidth - 6) / clueCols
    let maxClueY = y

    clueTexts.forEach((text, i) => {
      const col = clueCols === 1 ? 0 : i < Math.ceil(clueTexts.length / 2) ? 0 : 1
      const indexInCol = clueCols === 1 ? i : col === 0 ? i : i - Math.ceil(clueTexts.length / 2)
      const x = b.left + col * (clueColW + 6)
      const lines = wrapText(text, clueColW - 7, clueSize, theme.fonts.body)
      const cy = y + indexInCol * (lineHeight(clueSize, 1.25) * 1.55)

      b.text(x, cy, `${i + 1}.`, {
        size: clueSize, weight: 'bold', color: theme.colors.accent, font: theme.fonts.body, baseline: 'top',
      })
      lines.forEach((line, li) => {
        b.text(x + 6.5, cy + li * lineHeight(clueSize, 1.25), line, {
          size: clueSize, font: theme.fonts.body, color: theme.colors.ink, baseline: 'top', maxWidth: clueColW - 7,
        })
      })
      maxClueY = Math.max(maxClueY, cy + lines.length * lineHeight(clueSize, 1.25))
    })

    y = maxClueY + 6

    /* --------------------------- working grid --------------------------- */
    // Rows are people; columns are every value from every category, grouped.
    const allValues = categories.flatMap((cat) => cat.values.map((v) => ({ cat: cat.name, value: v })))
    const labelW = Math.min(30, b.contentWidth * 0.22)
    const cellW = Math.min(13, (b.contentWidth - labelW) / allValues.length)
    const cellH = Math.min(8.5, cellW)
    const headerH = 26

    if (b.bottom - y > headerH + entities.length * cellH + 40) {
      y = drawSectionTitle(b, theme, y, 'Working grid')
      const gx = b.left + labelW
      const gy = y + headerH

      // Rotated value headers keep the grid narrow enough to fit the page.
      allValues.forEach((entry, i) => {
        const cx = gx + i * cellW + cellW / 2
        b.text(cx + 1, gy - 1.5, entry.value, {
          size: 6.6,
          rotate: 60,
          font: theme.fonts.body,
          color: theme.colors.ink,
        })
      })

      // Category bands above the headers.
      let bandX = gx
      categories.forEach((cat, ci) => {
        const w = cat.values.length * cellW
        b.rect(bandX, y, w, 4.5, {
          fill: ci % 2 === 0 ? theme.colors.accentSoft : theme.colors.gridAlt,
        })
        b.text(bandX + w / 2, y + 2.25, cat.name, {
          size: 6.8, align: 'center', weight: 'bold', color: theme.colors.accent, baseline: 'middle', font: theme.fonts.body,
          maxWidth: w - 1,
        })
        bandX += w
      })

      entities.forEach((entity, r) => {
        const ry = gy + r * cellH
        b.text(b.left, ry + cellH / 2, entity, {
          size: 7.6, font: theme.fonts.body, color: theme.colors.ink, baseline: 'middle', maxWidth: labelW - 2,
        })
        allValues.forEach((_, c) => {
          b.rect(gx + c * cellW, ry, cellW, cellH, {
            stroke: theme.colors.grid,
            lineWidth: 0.2,
            fill: r % 2 === 1 ? theme.colors.gridAlt : undefined,
          })
        })
      })

      // Heavier separators between category blocks.
      let sepX = gx
      categories.forEach((cat) => {
        b.line(sepX, gy, sepX, gy + entities.length * cellH, { stroke: theme.colors.grid, lineWidth: 0.7 })
        sepX += cat.values.length * cellW
      })
      b.line(sepX, gy, sepX, gy + entities.length * cellH, { stroke: theme.colors.grid, lineWidth: 0.7 })
      b.rect(gx, gy, allValues.length * cellW, entities.length * cellH, { stroke: theme.colors.grid, lineWidth: 0.7 })

      y = gy + entities.length * cellH + 8
    }

    /* --------------------------- answer table --------------------------- */
    if (b.bottom - y > 24) {
      y = drawSectionTitle(b, theme, y, 'Your answers')
      const colW = b.contentWidth / (categories.length + 1)
      drawTable(b, {
        x: b.left,
        y,
        width: b.contentWidth,
        rowHeight: 7.5,
        columns: [
          { label: 'Person', width: colW },
          ...categories.map((cat) => ({ label: cat.name, width: colW, align: 'center' as const })),
        ],
        rows: entities.map((entity) => [entity, ...categories.map(() => '')]),
        headerFill: theme.colors.accentSoft,
        headerColor: theme.colors.accent,
        stroke: theme.colors.rule,
        size: 8,
        font: theme.fonts.body,
      })
    }

    return finishDoc(b, theme, ctx)
  },
}
