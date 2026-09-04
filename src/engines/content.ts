import { ALL_FACTS, FACTS_BY_SUBJECT, gridWord, themeFacts, type FactItem } from '../data'
import type { GenContext, Subject } from '../types'
import { uniqueBy } from '../utils/misc'

/**
 * Content engine: turns a config into a pool of facts, then selects from it.
 *
 * Selection widens in controlled stages rather than failing: exact tier and
 * subject first, then neighbouring tiers, then related subjects, then anything.
 * A generator asking for 20 items always receives 20 - which is what stops
 * sheets from silently coming out half-empty when a niche filter is too tight.
 */

export interface FactQuery {
  count: number
  /** Cap the letters-only length, e.g. so words fit a 12x12 grid. */
  maxWordLength?: number
  minWordLength?: number
  /** Only draw from these categories (e.g. 'capitals'). */
  categories?: string[]
  /** Skip categories - used to keep filler words out of clue-based games. */
  excludeCategories?: string[]
  /** Mix in words from the selected visual theme. */
  includeThemeWords?: boolean
  /** Require every word to be a single unbroken run of letters. */
  singleWordOnly?: boolean
  /** Require clues meaningful enough to stand alone as a question. */
  needsRealClue?: boolean
}

const RELATED: Record<Subject, Subject[]> = {
  mathematics: ['logic', 'general-knowledge'],
  english: ['vocabulary', 'general-knowledge'],
  science: ['general-knowledge', 'geography'],
  geography: ['science', 'general-knowledge'],
  history: ['general-knowledge', 'geography'],
  'general-knowledge': ['science', 'geography', 'history'],
  logic: ['mathematics', 'general-knowledge'],
  vocabulary: ['english', 'general-knowledge'],
}

/**
 * Adapts a content pack's facts into the shape the selector already speaks.
 * Their tier is set to the learner's own tier so they always clear the window.
 */
function packFacts(ctx: GenContext): FactItem[] {
  const pack = ctx.pack
  if (!pack) return []
  return pack.facts.map((fact) => ({
    term: fact.term,
    clue: fact.clue,
    category: `ai-${fact.category}`,
    subject: ctx.config.subject,
    tier: ctx.profile.vocabTier,
  }))
}

/** Pack words become theme-style filler for grid puzzles. */
function packWords(ctx: GenContext): FactItem[] {
  const pack = ctx.pack
  if (!pack) return []
  return pack.words.map((word) => ({
    term: word,
    clue: `Themed word (${pack.topic}), ${word.length} letters`,
    category: 'theme',
    subject: ctx.config.subject,
    tier: ctx.profile.vocabTier,
  }))
}

function passesShape(fact: FactItem, q: FactQuery): boolean {
  const word = gridWord(fact.term)
  if (q.minWordLength && word.length < q.minWordLength) return false
  if (q.maxWordLength && word.length > q.maxWordLength) return false
  if (q.singleWordOnly && /\s/.test(fact.term.trim())) return false
  if (q.excludeCategories?.includes(fact.category)) return false
  if (q.categories && !q.categories.includes(fact.category)) return false
  if (q.needsRealClue && fact.category === 'theme') return false
  return true
}

/**
 * Selects facts for a game. Returns exactly `count` items whenever the library
 * can supply them, ordered randomly by the context's seeded RNG.
 */
export function selectFacts(ctx: GenContext, query: FactQuery): FactItem[] {
  const { config, profile, rng } = ctx
  const tier = profile.vocabTier

  // Model-written content, when present, is already pitched at this exact
  // grade and topic - so it leads the pool and the built-in libraries top up
  // behind it rather than competing with it.
  const ai = packFacts(ctx)
  const primary = [...ai, ...(FACTS_BY_SUBJECT[config.subject] ?? [])]
  const related = RELATED[config.subject].flatMap((s) => FACTS_BY_SUBJECT[s] ?? [])
  const themed = query.includeThemeWords ? [...packWords(ctx), ...themeFacts(config.theme)] : []

  // Progressive widening: each stage adds a larger pool and a looser tier window.
  const stages: Array<{ pool: FactItem[]; window: number }> = [
    { pool: [...primary, ...themed], window: 1 },
    { pool: [...primary, ...themed], window: 2 },
    { pool: [...primary, ...themed, ...related], window: 2 },
    { pool: [...primary, ...themed, ...related], window: 5 },
    { pool: [...ai, ...ALL_FACTS, ...themed], window: 5 },
  ]

  for (const { pool, window } of stages) {
    const matches = pool.filter(
      (f) => passesShape(f, query) && Math.abs(f.tier - tier) <= window,
    )
    const deduped = uniqueBy(matches, (f) => gridWord(f.term))
    if (deduped.length >= query.count) {
      return rng.shuffle(deduped).slice(0, query.count)
    }
  }

  // Last resort: ignore the tier entirely, keep only the shape constraints,
  // which are the ones that would break the layout if violated.
  const fallback = uniqueBy(
    [...ALL_FACTS, ...themeFacts(config.theme)].filter((f) => passesShape(f, query)),
    (f) => gridWord(f.term),
  )
  return rng.shuffle(fallback).slice(0, query.count)
}

/**
 * Distractors for a multiple-choice item: other terms from the same category
 * where possible, because "another capital city" is a far better wrong answer
 * than "another random noun".
 */
export function factDistractors(
  ctx: GenContext,
  correct: FactItem,
  count: number,
  pool?: FactItem[],
): string[] {
  const source = pool ?? FACTS_BY_SUBJECT[correct.subject] ?? ALL_FACTS
  const sameCategory = source.filter(
    (f) => f.category === correct.category && f.term !== correct.term,
  )
  const others = source.filter((f) => f.term !== correct.term)

  const picks = ctx.rng.shuffle(sameCategory).slice(0, count)
  if (picks.length < count) {
    const extra = ctx.rng
      .shuffle(others)
      .filter((f) => !picks.some((p) => p.term === f.term))
      .slice(0, count - picks.length)
    picks.push(...extra)
  }
  return picks.map((f) => f.term)
}

