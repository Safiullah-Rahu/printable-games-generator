import type { Subject } from '../types'

/**
 * One shape drives every content-based generator.
 *
 * A single fact ("PARIS" / "Capital of France") is enough to build a word-search
 * entry, a crossword clue, a matching pair, a quiz card, a flash card and a
 * trivia question. Keeping one shape means adding a new topic to the app is a
 * data edit, not a code change - and every generator immediately supports it.
 */
export interface FactItem {
  /** Answer side. Printed on cards, hidden in grids. */
  term: string
  /** Clue / question / definition side. */
  clue: string
  /** Groups related facts, e.g. "capitals". Also the distractor pool. */
  category: string
  subject: Subject
  /** 1 (youngest) to 5 (hardest); filtered against DifficultyProfile.vocabTier. */
  tier: number
  /** Optional extra shown on detailed answer keys. */
  note?: string
}

/** Letters-only uppercase form used by grid puzzles. */
export function gridWord(term: string): string {
  return term.toUpperCase().replace(/[^A-Z]/g, '')
}
