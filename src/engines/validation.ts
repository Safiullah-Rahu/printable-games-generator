import type { PrintDoc, ValidationIssue, ValidationResult } from '../types'
import { measureText } from '../utils/text'
import type { MathProblem } from './equations'
import { tryEvalExpr } from './expression'

/**
 * Validation engine.
 *
 * Two independent layers:
 *
 *  1. CONTENT - each generator asserts its own invariants (every word is really
 *     in the grid, the maze has a path, the bingo cards can actually win).
 *  2. GEOMETRY - `validateDoc` checks the finished PrintDoc for elements outside
 *     the page and for text wider than the box it was given.
 *
 * The pipeline treats any `error` as "throw this away and generate again", and
 * surfaces `warning`s in the UI without blocking. Nothing broken reaches the
 * preview, let alone the PDF.
 */

export const ok = (): ValidationResult => ({ ok: true, issues: [] })

export function fail(code: string, message: string): ValidationResult {
  return { ok: false, issues: [{ severity: 'error', code, message }] }
}

export function warn(code: string, message: string): ValidationResult {
  return { ok: true, issues: [{ severity: 'warning', code, message }] }
}

export function combine(...results: ValidationResult[]): ValidationResult {
  const issues = results.flatMap((r) => r.issues)
  return { ok: !issues.some((i) => i.severity === 'error'), issues }
}

/** Builds a result from a list of assertions - the shape most generators use. */
export function check(assertions: Array<[boolean, string, string] | [boolean, string, string, 'warning']>): ValidationResult {
  const issues: ValidationIssue[] = []
  for (const [passed, code, message, severity] of assertions) {
    if (!passed) issues.push({ severity: severity ?? 'error', code, message })
  }
  return { ok: !issues.some((i) => i.severity === 'error'), issues }
}

/* ------------------------------------------------------------------ *
 * Mathematical verification
 * ------------------------------------------------------------------ */

/**
 * Re-derives a problem's answer from its printed expression and compares.
 * This is the second opinion described in engines/equations.ts - it catches a
 * generator that produces a question and an answer that do not match.
 */
export function verifyMathProblem(problem: MathProblem): ValidationResult {
  if (problem.expr === null || problem.value === null) return ok()

  const result = tryEvalExpr(problem.expr)
  if (!result.ok) {
    return fail('math.expr-parse', `Cannot verify "${problem.question}": ${result.error}`)
  }
  const delta = Math.abs(result.value - problem.value)
  if (delta > problem.tolerance) {
    return fail(
      'math.mismatch',
      `Answer mismatch for "${problem.question}": stored ${problem.value}, expression "${problem.expr}" gives ${result.value}`,
    )
  }
  return ok()
}

export function verifyMathProblems(problems: MathProblem[]): ValidationResult {
  return combine(...problems.map(verifyMathProblem))
}

/** Rejects duplicate questions, which look like a printing error on a sheet. */
export function verifyDistinctQuestions(problems: MathProblem[]): ValidationResult {
  const seen = new Set<string>()
  for (const p of problems) {
    if (seen.has(p.question)) {
      return fail('math.duplicate', `Duplicate question: "${p.question}"`)
    }
    seen.add(p.question)
  }
  return ok()
}

/* ------------------------------------------------------------------ *
 * Geometry verification
 * ------------------------------------------------------------------ */

/** Slack allowed before an element counts as off-page, in mm. */
const BLEED_TOLERANCE = 1.0

interface Extent { minX: number; minY: number; maxX: number; maxY: number }

function extentOf(el: PrintDoc['pages'][number]['elements'][number]): Extent | null {
  switch (el.kind) {
    case 'rect':
      return { minX: el.x, minY: el.y, maxX: el.x + el.w, maxY: el.y + el.h }
    case 'line':
      return {
        minX: Math.min(el.x1, el.x2), minY: Math.min(el.y1, el.y2),
        maxX: Math.max(el.x1, el.x2), maxY: Math.max(el.y1, el.y2),
      }
    case 'circle':
      return { minX: el.cx - el.r, minY: el.cy - el.r, maxX: el.cx + el.r, maxY: el.cy + el.r }
    case 'polygon': {
      if (el.points.length === 0) return null
      const xs = el.points.map((p) => p[0])
      const ys = el.points.map((p) => p[1])
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
    }
    case 'path': {
      const pts = el.d.flatMap((c) => (c.t === 'Z' ? [] : [[c.x, c.y] as [number, number]]))
      if (pts.length === 0) return null
      const xs = pts.map((p) => p[0])
      const ys = pts.map((p) => p[1])
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
    }
    case 'text': {
      if (el.rotate) return null // rotated text is placed deliberately; skip.
      const w = measureText(el.text, el.size, el.font ?? 'sans', el.weight ?? 'normal', el.style ?? 'normal', el.charSpace ?? 0)
      const x0 = el.align === 'center' ? el.x - w / 2 : el.align === 'right' ? el.x - w : el.x
      const ascent = (el.size * 25.4) / 72
      return { minX: x0, minY: el.y - ascent, maxX: x0 + w, maxY: el.y + ascent * 0.25 }
    }
    default:
      return null
  }
}

/**
 * Checks the finished document for anything that would print badly: elements
 * hanging off the page, text overflowing the width it declared, unreadably
 * small type, and empty pages.
 */
export function validateDoc(doc: PrintDoc): ValidationResult {
  const issues: ValidationIssue[] = []

  if (doc.pages.length === 0) {
    issues.push({ severity: 'error', code: 'doc.empty', message: 'The document has no pages.' })
  }

  doc.pages.forEach((page, pageIndex) => {
    if (page.elements.length === 0) {
      issues.push({
        severity: 'error',
        code: 'doc.empty-page',
        message: `Page ${pageIndex + 1} ("${page.label}") is empty.`,
      })
      return
    }

    let offPage = 0
    let overflow = 0
    let tiny = 0

    for (const el of page.elements) {
      const extent = extentOf(el)
      if (extent) {
        if (
          extent.minX < -BLEED_TOLERANCE ||
          extent.minY < -BLEED_TOLERANCE ||
          extent.maxX > doc.width + BLEED_TOLERANCE ||
          extent.maxY > doc.height + BLEED_TOLERANCE
        ) {
          offPage++
        }
      }

      if (el.kind === 'text') {
        if (el.maxWidth) {
          const w = measureText(el.text, el.size, el.font ?? 'sans', el.weight ?? 'normal', el.style ?? 'normal', el.charSpace ?? 0)
          // 0.5 mm of slack absorbs rounding in the font metrics.
          if (w > el.maxWidth + 0.5) overflow++
        }
        if (el.size < 4.5 && el.text.trim().length > 0) tiny++
      }
    }

    if (offPage > 0) {
      issues.push({
        severity: 'error',
        code: 'doc.off-page',
        message: `Page ${pageIndex + 1}: ${offPage} element(s) fall outside the page.`,
      })
    }
    if (overflow > 0) {
      issues.push({
        severity: 'error',
        code: 'doc.text-overflow',
        message: `Page ${pageIndex + 1}: ${overflow} text run(s) exceed their box.`,
      })
    }
    if (tiny > 0) {
      issues.push({
        severity: 'warning',
        code: 'doc.tiny-text',
        message: `Page ${pageIndex + 1}: ${tiny} text run(s) below 4.5pt may be hard to read.`,
      })
    }
  })

  return { ok: !issues.some((i) => i.severity === 'error'), issues }
}

