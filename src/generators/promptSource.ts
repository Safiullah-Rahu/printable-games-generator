import { LOGIC_RIDDLES, type FactItem } from '../data'
import { factDistractors, selectFacts } from '../engines/content'
import { generateProblemSet, makeDistractors, type MathProblem } from '../engines/equations'
import { check, combine, verifyMathProblems } from '../engines/validation'
import type { GenContext, ValidationResult } from '../types'
import { uniqueBy } from '../utils/misc'

/**
 * Prompt source: one call that yields question/answer pairs for ANY subject.
 *
 * Card games (quiz, flash, memory, matching, trivia, challenge) do not care
 * whether an item came from the equation engine or the fact library - they need
 * a prompt, an answer and some plausible wrong answers. Centralising that here
 * means a maths flash card and a geography flash card travel the exact same
 * code path, and adding a subject benefits every card game at once.
 */

export interface PromptItem {
  id: string
  /** Full question text. */
  prompt: string
  /** Short form for tight cells - falls back to `prompt`. */
  compact: string
  answer: string
  /** Multiple-choice options including the answer, already shuffled. */
  options: string[]
  correctIndex: number
  category: string
  problem?: MathProblem
  fact?: FactItem
}

export interface PromptOptions {
  /** How many wrong answers to build. 0 skips option generation. */
  optionCount?: number
  /** Force a source rather than following config.subject. */
  source?: 'math' | 'facts' | 'auto'
  /** Cap the printed prompt length so it fits a card. */
  maxPromptLength?: number
  /** Require short answers, e.g. for memory tiles. */
  maxAnswerLength?: number
}

function fromMath(ctx: GenContext, count: number, opts: PromptOptions): PromptItem[] {
  const problems = generateProblemSet(count, ctx, {
    maxQuestionLength: opts.maxPromptLength ?? 90,
    uniqueAnswers: (opts.optionCount ?? 0) > 0,
  })

  return problems.map((problem, i) => {
    const optionCount = opts.optionCount ?? 0
    const distractors = optionCount > 0 ? makeDistractors(problem, optionCount - 1, ctx.rng, ctx.profile) : []
    const options = optionCount > 0 ? ctx.rng.shuffle([problem.answer, ...distractors]) : []
    return {
      id: `m${i}`,
      prompt: problem.question,
      compact: problem.prompt,
      answer: problem.answer,
      options,
      correctIndex: options.indexOf(problem.answer),
      category: problem.topic,
      problem,
    }
  })
}

function fromFacts(ctx: GenContext, count: number, opts: PromptOptions): PromptItem[] {
  const facts = selectFacts(ctx, {
    count,
    needsRealClue: true,
    excludeCategories: ['theme'],
    maxWordLength: opts.maxAnswerLength,
  })

  return facts.map((fact, i) => {
    const optionCount = opts.optionCount ?? 0
    const distractors = optionCount > 0 ? factDistractors(ctx, fact, optionCount - 1) : []
    const options = optionCount > 0 ? ctx.rng.shuffle([fact.term, ...distractors]) : []
    return {
      id: `f${i}`,
      prompt: fact.clue,
      compact: fact.clue,
      answer: fact.term,
      options,
      correctIndex: options.indexOf(fact.term),
      category: fact.category,
      fact,
    }
  })
}

/**
 * Lateral-thinking riddles, offered only to the Logic subject. A logic quiz made
 * purely of vocabulary definitions misses the point of the subject, so roughly a
 * third of a logic deck is drawn from the riddle bank instead.
 */
function fromRiddles(ctx: GenContext, count: number): PromptItem[] {
  const tier = ctx.profile.vocabTier
  const eligible = LOGIC_RIDDLES.filter((r) => r.tier <= tier + 1)
  const pool = eligible.length >= count ? eligible : LOGIC_RIDDLES
  return ctx.rng.sample(pool, count).map((riddle, i) => ({
    id: `r${i}`,
    prompt: riddle.question,
    compact: riddle.question,
    answer: riddle.answer,
    options: [],
    correctIndex: -1,
    category: 'riddles',
  }))
}

/**
 * Model-written questions as PromptItems.
 *
 * Skipped when the caller needs multiple-choice options: a pack question has no
 * category to draw sibling wrong answers from, and distractors invented from
 * unrelated answers make a worse card than a locally-built one.
 */
function fromPack(ctx: GenContext, count: number, opts: PromptOptions): PromptItem[] {
  const pack = ctx.pack
  if (!pack || (opts.optionCount ?? 0) > 0) return []

  const usable = pack.questions.filter(
    (q) => !opts.maxPromptLength || q.question.length <= opts.maxPromptLength,
  )

  return ctx.rng.sample(usable, count).map((q, i) => ({
    id: `ai${i}`,
    prompt: q.question,
    compact: q.question,
    answer: q.answer,
    options: [],
    correctIndex: -1,
    category: 'ai',
  }))
}

export function buildPrompts(ctx: GenContext, count: number, opts: PromptOptions = {}): PromptItem[] {
  const source = opts.source ?? 'auto'
  const useMath = source === 'math' || (source === 'auto' && ctx.config.subject === 'mathematics')

  // Pack questions lead; the local engines fill whatever is left.
  const packItems = fromPack(ctx, count, opts)
  const remaining = Math.max(0, count - packItems.length)
  let items = remaining > 0
    ? [...packItems, ...(useMath ? fromMath(ctx, remaining, opts) : fromFacts(ctx, remaining, opts))]
    : packItems

  // Logic sheets get a share of riddles - but only where free-text answers work,
  // i.e. not when the caller needs multiple-choice options built.
  if (!useMath && ctx.config.subject === 'logic' && !opts.optionCount) {
    const riddleCount = Math.min(Math.round(count / 3), LOGIC_RIDDLES.length)
    if (riddleCount > 0) {
      items = ctx.rng.shuffle([...fromRiddles(ctx, riddleCount), ...items.slice(0, count - riddleCount)])
    }
  }

  const deduped = uniqueBy(items, (item) => item.prompt)

  // Facts can run dry on a narrow subject; top up from maths rather than
  // handing the layout a short deck it will render with empty cards.
  if (deduped.length < count && !useMath) {
    const extra = fromMath(ctx, count - deduped.length, opts)
    return uniqueBy([...deduped, ...extra], (item) => item.prompt).slice(0, count)
  }

  return deduped.slice(0, count)
}

/** Shared validation for any generator built on PromptItems. */
export function validatePrompts(items: PromptItem[], expected: number, requireOptions = false): ValidationResult {
  const mathProblems = items.map((i) => i.problem).filter((p): p is MathProblem => Boolean(p))

  const structural = check([
    [items.length >= Math.min(expected, 4), 'prompt.too-few', `Only ${items.length} of ${expected} items were produced.`],
    [items.length >= expected, 'prompt.short', `Produced ${items.length} of ${expected} requested items.`, 'warning'],
    [items.every((i) => i.prompt.trim().length > 0), 'prompt.empty', 'An item has an empty question.'],
    [items.every((i) => i.answer.trim().length > 0), 'prompt.no-answer', 'An item has an empty answer.'],
    [new Set(items.map((i) => i.prompt)).size === items.length, 'prompt.duplicate', 'Two items share the same question.'],
  ])

  const optionChecks = requireOptions
    ? check([
      [items.every((i) => i.options.length >= 2), 'prompt.options', 'An item has fewer than two choices.'],
      [items.every((i) => i.correctIndex >= 0), 'prompt.no-correct', 'An item has no correct choice marked.'],
      [
        items.every((i) => i.options[i.correctIndex] === i.answer),
        'prompt.wrong-index',
        'A marked correct choice does not match the answer.',
      ],
      [
        items.every((i) => new Set(i.options).size === i.options.length),
        'prompt.dup-option',
        'An item repeats one of its choices.',
      ],
    ])
    : { ok: true, issues: [] }

  return combine(structural, optionChecks, verifyMathProblems(mathProblems))
}

/** Letter labels for multiple choice. */
export const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
