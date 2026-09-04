# Adding a new game type

The architecture is built around this being cheap. A new game is **one file plus
one line**. The picker, configuration panel, preview, print surface, PDF
exporter, history and test suite all read from the generator registry, so none of
them need to change.

---

## The contract

Your file exports one object satisfying `GameGenerator<P>`, where `P` is whatever
shape you want to carry between the phases.

```ts
export interface GameGenerator<P> {
  // --- identity, shown in the picker -----------------------------------
  id: string                    // stable, kebab-case, used in saved history
  name: string
  description: string           // one line on the picker card
  category: 'math' | 'literacy' | 'puzzle' | 'cards' | 'board' | 'trivia'
  glyph: string                 // 2 characters on the picker tile

  // --- what the UI should offer ----------------------------------------
  subjects: Subject[]           // subject dropdown is filtered to these
  defaults: Partial<GameConfig> // applied when the user selects this game
  itemRange: [number, number] | null   // null hides the item slider
  itemLabel: string             // slider label: "Words", "Questions", "Puzzles"
  usesPlayers: boolean          // false hides the player-count control
  orientations: Orientation[]

  // --- the five phases --------------------------------------------------
  generate(ctx: GenContext): P
  validate(payload: P, ctx: GenContext): ValidationResult
  generateAnswerKey(payload: P, ctx: GenContext): AnswerKey
  meta(payload: P, ctx: GenContext): GameMeta
  layout(payload: P, ctx: LayoutContext): PrintDoc
}
```

### What each phase is for

| Phase | Job | Rules |
| --- | --- | --- |
| `generate` | Produce the game's content and structure. | Draw **all** randomness from `ctx.rng`. Never touch `Math.random`. Throwing is fine — the pipeline retries. |
| `validate` | Prove the payload is a playable, correct game. | Return `error` issues for anything broken; the pipeline discards and regenerates. `warning` issues are surfaced but do not block. |
| `generateAnswerKey` | Produce the printed answers. | Return `entries: []` if the answers live on a solution page instead. |
| `meta` | Title, instructions, sidebar stats, variant label. | Instructions are numbered for you. Keep them player-facing. |
| `layout` | Draw the pages. | Return the finished `PrintDoc`. Never draw outside the page. |

`ctx` gives you `config` (the user's settings), `rng` (seeded) and `profile`
(the resolved [difficulty profile](#the-difficulty-profile)). In `layout` you
additionally get `meta` and `answerKey`.

---

## A worked example

`src/generators/oddOneOut.ts` — a sheet of "which word does not belong?" rows.

```ts
import { selectFacts } from '../engines/content'
import { drawInstructions, drawSectionTitle, startGamePage } from '../engines/layout/components'
import { check } from '../engines/validation'
import type { AnswerKey, GameGenerator, GameMeta, GenContext, LayoutContext, PrintDoc } from '../types'
import { clamp } from '../utils/misc'
import { baseMeta, finishDoc, setupDoc } from './shared'

interface Row {
  options: string[]   // already shuffled
  oddIndex: number
  reason: string
}

export interface OddOneOutPayload {
  rows: Row[]
  variant: string
}

export const oddOneOutGenerator: GameGenerator<OddOneOutPayload> = {
  id: 'odd-one-out',
  name: 'Odd One Out',
  description: 'Rows of related words with one intruder to spot.',
  category: 'literacy',
  glyph: 'OO',
  subjects: ['science', 'geography', 'history', 'general-knowledge', 'vocabulary'],
  defaults: { itemCount: 12, lengthMinutes: 10 },
  itemRange: [4, 20],
  itemLabel: 'Rows',
  usesPlayers: false,
  orientations: ['portrait', 'landscape'],

  generate(ctx: GenContext): OddOneOutPayload {
    const want = clamp(ctx.config.itemCount, 4, 20)
    // Pull more than we need: some categories will be too small to use.
    const pool = selectFacts(ctx, { count: want * 6, needsRealClue: true })

    const byCategory = new Map<string, string[]>()
    for (const fact of pool) {
      const list = byCategory.get(fact.category) ?? []
      list.push(fact.term)
      byCategory.set(fact.category, list)
    }

    const usable = [...byCategory.entries()].filter(([, terms]) => terms.length >= 3)
    const rows: Row[] = []

    for (const [category, terms] of ctx.rng.shuffle(usable)) {
      if (rows.length >= want) break
      const others = pool.filter((f) => f.category !== category)
      if (others.length === 0) continue

      const same = ctx.rng.sample(terms, 3)
      const intruder = ctx.rng.pick(others)
      const options = ctx.rng.shuffle([...same, intruder.term])

      rows.push({
        options,
        oddIndex: options.indexOf(intruder.term),
        reason: `The others are all ${category.replace('-', ' ')}.`,
      })
    }

    return { rows, variant: `${rows.length} rows, 4 options each` }
  },

  validate(payload, ctx) {
    return check([
      [payload.rows.length >= 4, 'ooo.too-few', `Only ${payload.rows.length} rows were built.`],
      [
        payload.rows.length >= clamp(ctx.config.itemCount, 4, 20),
        'ooo.short',
        'Fewer rows than requested.',
        'warning',
      ],
      [
        payload.rows.every((r) => new Set(r.options).size === r.options.length),
        'ooo.duplicate',
        'A row repeats an option.',
      ],
      [
        payload.rows.every((r) => r.oddIndex >= 0 && r.oddIndex < r.options.length),
        'ooo.no-answer',
        'A row has no marked answer.',
      ],
    ])
  },

  generateAnswerKey(payload): AnswerKey {
    return {
      entries: payload.rows.map((row, i) => ({
        label: `${i + 1}.`,
        answer: `${row.options[row.oddIndex]} — ${row.reason}`,
      })),
    }
  },

  meta(payload, ctx): GameMeta {
    return baseMeta(
      ctx.config,
      'Odd One Out',
      [
        'Read each row of four words.',
        'Three of them belong together. Circle the one that does not.',
        'Write why the other three go together.',
      ],
      { Rows: payload.rows.length },
      payload.variant,
    )
  },

  layout(payload, ctx: LayoutContext): PrintDoc {
    const { builder: b, theme } = setupDoc(ctx)

    let y = startGamePage(b, theme, ctx.meta, ctx.config)
    if (ctx.config.includeInstructions) {
      y = drawInstructions(b, theme, y, ctx.meta.instructions)
    }
    y = drawSectionTitle(b, theme, y, 'Circle the odd one out')

    const rowH = Math.min(14, (b.bottom - y) / payload.rows.length)
    const colW = (b.contentWidth - 12) / 4

    payload.rows.forEach((row, i) => {
      const ry = y + i * rowH
      if (i % 2 === 1) b.rect(b.left - 1, ry, b.contentWidth + 2, rowH, { fill: theme.colors.gridAlt })

      b.text(b.left, ry + rowH / 2, `${i + 1}.`, {
        size: 9, weight: 'bold', color: theme.colors.accent, baseline: 'middle', font: theme.fonts.body,
      })
      row.options.forEach((option, oi) => {
        b.text(b.left + 12 + oi * colW, ry + rowH / 2, option, {
          size: 9,
          color: theme.colors.ink,
          baseline: 'middle',
          font: theme.fonts.body,
          maxWidth: colW - 4,      // the validator checks this
        })
      })
    })

    return finishDoc(b, theme, ctx)
  },
}
```

Then register it:

```ts
// src/generators/index.ts
import { oddOneOutGenerator } from './oddOneOut'

export const GENERATORS: GameGenerator<any>[] = [
  // …
  oddOneOutGenerator,
]
```

That is the whole job. Run `npm test` and the cross-generator suite will already
be exercising it across every grade, difficulty, subject, paper size and theme.

---

## The toolbox

### Drawing (`engines/layout/doc.ts`)

`DocBuilder` is an immediate-mode API in millimetres.

```ts
b.page(label, role)                          // start a page; role 'answerKey' is hideable
b.text(x, y, str, { size, weight, align, color, baseline, maxWidth, rotate })
b.rect(x, y, w, h, { fill, stroke, lineWidth, radius, dash })
b.line(x1, y1, x2, y2, { stroke, lineWidth, dash, cap })
b.circle(cx, cy, r, { fill, stroke })
b.polygon(points, { fill, stroke, closed })
b.path(cmds, { fill, stroke })               // M / L / C / Z
b.paragraph(x, y, width, text, opts)         // wrapped text; returns height used
```

Geometry helpers: `b.left`, `b.right`, `b.top`, `b.bottom`, `b.contentWidth`,
`b.contentHeight`, `b.centerX`, `b.remaining`, `b.ensureSpace(mm)`.

`baseline` is `'alphabetic'` (default), `'top'` or `'middle'` — use `'middle'` to
optically centre text in a box; it uses cap-height, which both renderers agree on.

**Always pass `maxWidth`** when text sits in a fixed box. The document validator
uses it to catch overflow, which is how layout bugs get found before a user does.

### Page furniture (`engines/layout/components.ts`)

```ts
startGamePage(b, theme, meta, config, { label, role, tag, nameLine, compact })
drawInstructions(b, theme, y, lines, { heading })
drawSectionTitle(b, theme, y, 'Find these words')
cardGrid({ cols, rows, x, y, width, height, gap })     // → CardRect[]
drawCutGuides(b, theme, gridOptions)
drawCardFrame(b, theme, card, { headerHeight, headerLabel })
```

### Grids and tables (`engines/layout/grid.ts`)

```ts
fitCellSize(cols, rows, maxWidth, maxHeight, maxCell, minCell)
drawGrid(b, { x, y, cols, rows, cell, style: (r, c) => CellStyle, blockEvery, colHeaders })
drawTable(b, { x, y, width, rowHeight, columns, rows, headerFill, stripeFill })
```

`outerLineWidth: 0` suppresses the frame — useful for sparse grids.

### Content

```ts
// Maths — every problem carries a verifiable expression
generateProblemSet(count, ctx, { integerAnswersOnly, uniqueAnswers, answerRange, topics })
generateProblem(topic, rng, profile)
makeDistractors(problem, count, rng, profile)
buildSequence(rng, profile)

// Facts — any subject
selectFacts(ctx, { count, minWordLength, maxWordLength, categories, needsRealClue })
factDistractors(ctx, correctFact, count)

// Either, unified — what the card games use
buildPrompts(ctx, count, { optionCount, source, maxPromptLength })
validatePrompts(items, expectedCount, requireOptions)
```

### Card decks (`generators/shared.ts`)

```ts
layoutCardPages(b, theme, ctx, {
  items, cols, rows,
  render:     (doc, theme, card, item, index) => { … },
  renderBack: (doc, theme, card, item, index) => { … },  // optional, duplex-aligned
})
```

`renderBack` handles the left-to-right column mirroring needed for long-edge
duplex printing. Do not reimplement it.

### Validation (`engines/validation.ts`)

```ts
check([[condition, 'code', 'message'], [condition, 'code', 'message', 'warning']])
combine(resultA, resultB, …)
verifyMathProblems(problems)     // independent re-derivation
ok() / fail(code, message) / warn(code, message)
```

---

## The difficulty profile

`ctx.profile` is derived from grade + difficulty. Read from it rather than
branching on grade directly, so your game scales automatically.

| Field | Meaning |
| --- | --- |
| `score` | 0–100. Everything else is a ramp off this. |
| `numberRange`, `tableRange` | Operand bounds. |
| `operations`, `maxSteps` | Which operations are unlocked, and chain length. |
| `allowNegatives`, `allowDecimals`, `decimalPlaces`, `denominators` | Number-system reach. |
| `wordLength`, `vocabTier` | Word bank filtering. |
| `gridSize`, `mazeSize`, `bingoSize`, `sudokuBox`, `sudokuHolesRatio`, `logicSize` | Puzzle dimensions. |
| `distractorTightness` | How close wrong answers sit to the right one. |
| `clueGenerosity` | Extra scaffolding clues at easier settings (≥ 1). |
| `wordSearchDirections` | 3–8 compass directions. |
| `sequenceKinds` | Which sequence rules are in play. |

---

## House rules

1. **Randomness only from `ctx.rng`.** `Math.random` breaks reproducibility, the
   history panel and the tests.
2. **Validate what a player would notice.** "Is every word findable in the
   grid?", "does the maze have a route?", "is the answer key complete?" — read
   the finished payload back rather than trusting the variables you just set.
3. **Pass `maxWidth` on boxed text.** It is how overflow gets caught.
4. **Fit, don't truncate.** `fitTextSize` / `fitBlock` / `fitCellSize` shrink to
   fit. A sheet with tiny text is recoverable; one with clipped text is not.
5. **Mark answer pages `role: 'answerKey'`.** That is what the "hide answer key"
   toggle and the PDF exporter filter on.
6. **Let the pipeline retry.** Throwing from `generate` is a valid way to say
   "this draw was unusable"; you get up to 12 attempts with fresh RNG streams.
7. **Themes change colour, never geometry.** Read colours and fonts from `theme`;
   ink-saver then works for free.

---

## Debugging a generator

Write the sheets out and look at them:

```bash
SAMPLE_DIR=./out PDF_DIR=./out npx vitest run tests/samples.test.ts
```

If the pipeline reports a failure, the thrown `GenerationError` carries the
collected validation issues — every rejected attempt's reasons — which is
normally enough to see what went wrong:

```ts
try {
  buildGame(config)
} catch (err) {
  if (err instanceof GenerationError) console.log(err.issues)
}
```

Common causes:

| Issue code | Cause |
| --- | --- |
| `doc.text-overflow` | Text wider than the `maxWidth` it declared — usually measuring in one weight and drawing in another. |
| `doc.off-page` | An element outside the page box; check your slot arithmetic. |
| `doc.empty-page` | A page was started but nothing was drawn on it. |
| `math.mismatch` | The stored answer disagrees with its own expression — a real bug in the problem builder. |
| `prompt.too-few` | The content filter was too tight; loosen the query or raise the pool size. |
