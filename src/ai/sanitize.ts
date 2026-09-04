import { tryEvalExpr } from '../engines/expression'
import { gridWord } from '../data'
import { uniqueBy } from '../utils/misc'
import type { AiFact, AiQuestion } from './types'

/**
 * Sanitisation for model-written content.
 *
 * MODEL OUTPUT IS DATA, NOT INSTRUCTIONS. Everything that arrives from a
 * provider is text of unknown provenance heading for a printed page that a
 * child will read, so it goes through here before it is trusted:
 *
 *  1. STRUCTURE  - wrong-shaped entries are dropped, not coerced.
 *  2. CHARACTERS - anything outside a printable Latin set is stripped, because
 *                  the PDF base-14 fonts cannot render it and it would come out
 *                  as garbage glyphs.
 *  3. LENGTH     - hard caps, so no single entry can break a layout.
 *  4. MEANING    - maths answers are re-derived with the expression evaluator
 *                  and dropped when they disagree. A model that confidently
 *                  states 7 x 8 = 54 produces a shorter sheet, never a wrong
 *                  answer key.
 *
 * Nothing here ever throws: bad entries are counted and discarded, and the
 * caller decides whether what survived is enough to use.
 */

/** Characters the PDF base-14 fonts render correctly. */
const PRINTABLE = /[^A-Za-z0-9 .,;:'"!?()\-+/=%&×÷°²³]/g

/** Text that looks like an instruction to the app rather than game content. */
const INJECTION_MARKERS = /\b(ignore (all |the )?(previous|above)|system prompt|assistant:|<\/?script|javascript:|data:text\/html)\b/i

const LIMITS = {
  term: { min: 2, max: 26 },
  clue: { min: 6, max: 120 },
  question: { min: 4, max: 160 },
  answer: { min: 1, max: 60 },
  category: { max: 24 },
  word: { min: 3, max: 14 },
} as const

function clean(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .normalize('NFKD')
    // Strip combining marks so accented input degrades to plain letters
    // rather than to boxes in the PDF.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(PRINTABLE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Arithmetic expressions get their own filter.
 *
 * `clean()` is tuned for text that will be PRINTED, and it strips `*` and `^`
 * because the PDF fonts never need them. An expression is not printed - it is
 * evaluated - so running it through the print filter silently turns "6 * 7"
 * into "6 7" and every verification fails. Whitelisting only arithmetic here
 * is both correct and the tighter security boundary: nothing but digits and
 * operators can reach the evaluator.
 */
function cleanExpression(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[^0-9+\-*/().^ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function withinLength(value: string, min: number, max: number): boolean {
  return value.length >= min && value.length <= max
}

function isSafe(value: string): boolean {
  return !INJECTION_MARKERS.test(value)
}

export interface SanitizeReport<T> {
  kept: T[]
  rejected: number
}

/* ------------------------------------------------------------------ *
 * Facts
 * ------------------------------------------------------------------ */

export function sanitizeFacts(raw: unknown): SanitizeReport<AiFact> {
  if (!Array.isArray(raw)) return { kept: [], rejected: 0 }

  let rejected = 0
  const kept: AiFact[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      rejected++
      continue
    }
    const record = entry as Record<string, unknown>
    const term = clean(record.term).toUpperCase()
    const clue = clean(record.clue)
    const category = clean(record.category).toLowerCase().slice(0, LIMITS.category.max) || 'ai'

    // The term must survive the grid transform, or word search and crossword
    // cannot use it at all.
    const grid = gridWord(term)

    const ok =
      withinLength(term, LIMITS.term.min, LIMITS.term.max) &&
      withinLength(clue, LIMITS.clue.min, LIMITS.clue.max) &&
      withinLength(grid, 3, 14) &&
      /^[A-Z][A-Z ]*$/.test(term) &&
      isSafe(term) &&
      isSafe(clue) &&
      // A clue that contains its own answer is not a clue.
      !clue.toUpperCase().includes(grid)

    if (!ok) {
      rejected++
      continue
    }

    kept.push({ term, clue, category })
  }

  const deduped = uniqueBy(kept, (f) => gridWord(f.term))
  return { kept: deduped, rejected: rejected + (kept.length - deduped.length) }
}

/* ------------------------------------------------------------------ *
 * Questions
 * ------------------------------------------------------------------ */

/**
 * Keeps a question only if it is well-formed AND, when it carries an
 * arithmetic expression, that expression actually evaluates to the stated
 * answer. This is the same second-opinion check the local maths engine gets,
 * pointed at content the app did not write.
 */
export function sanitizeQuestions(raw: unknown): SanitizeReport<AiQuestion> {
  if (!Array.isArray(raw)) return { kept: [], rejected: 0 }

  let rejected = 0
  const kept: AiQuestion[] = []

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      rejected++
      continue
    }
    const record = entry as Record<string, unknown>
    const question = clean(record.question)
    const answer = clean(record.answer)
    // Distinguish "no derivation offered" from "a derivation that is garbage".
    const claimedExpr = typeof record.expr === 'string' && record.expr.trim().length > 0
    const expr = cleanExpression(record.expr)

    if (
      !withinLength(question, LIMITS.question.min, LIMITS.question.max) ||
      !withinLength(answer, LIMITS.answer.min, LIMITS.answer.max) ||
      !isSafe(question) ||
      !isSafe(answer)
    ) {
      rejected++
      continue
    }

    // Verify anything that came with a derivation. A model that offered an
    // expression is held to it: if the expression is unusable or disagrees
    // with the stated answer, the question is dropped rather than kept as an
    // unverified one. Only "expr": null means "no numeric claim to check".
    let verifiedExpr: string | null = null
    if (claimedExpr) {
      const evaluated = tryEvalExpr(expr)
      const stated = Number(answer.replace(/[^0-9.-]/g, ''))
      if (!expr || !evaluated.ok || !Number.isFinite(stated) || Math.abs(evaluated.value - stated) > 1e-6) {
        rejected++
        continue
      }
      verifiedExpr = expr
    }

    kept.push({ question, answer, expr: verifiedExpr })
  }

  const deduped = uniqueBy(kept, (q) => q.question.toLowerCase())
  return { kept: deduped, rejected: rejected + (kept.length - deduped.length) }
}

/* ------------------------------------------------------------------ *
 * Theme words
 * ------------------------------------------------------------------ */

export function sanitizeWords(raw: unknown): SanitizeReport<string> {
  if (!Array.isArray(raw)) return { kept: [], rejected: 0 }

  let rejected = 0
  const kept: string[] = []

  for (const entry of raw) {
    const word = gridWord(clean(entry))
    if (!withinLength(word, LIMITS.word.min, LIMITS.word.max)) {
      rejected++
      continue
    }
    kept.push(word)
  }

  const deduped = Array.from(new Set(kept))
  return { kept: deduped, rejected: rejected + (kept.length - deduped.length) }
}

/* ------------------------------------------------------------------ *
 * Free text (titles and subtitles printed on the sheet)
 * ------------------------------------------------------------------ */

/** Title-safe text: printable, length-capped, and never an instruction. */
export function sanitizeHeading(raw: unknown, maxLength: number, fallback: string): string {
  const value = clean(raw).slice(0, maxLength).trim()
  if (!value || value.length < 3 || !isSafe(value)) return fallback
  return value
}
