import type { Difficulty, DifficultyProfile, Grade, MathTopic, Operation } from '../types'
import { clamp } from '../utils/misc'

/**
 * Difficulty engine.
 *
 * Grade and difficulty are two independent dials that teachers think about
 * separately ("Grade 4, but make it hard"). We collapse them into a single
 * 0-100 `score`, then derive every downstream knob from that score with
 * piecewise-linear ramps. One number to reason about, and adding a new knob
 * means adding one ramp rather than a 12 x 5 lookup table.
 *
 *   score = gradeScore(grade) + difficultyOffset(difficulty), clamped to 0-100
 */

const GRADE_SCORE: Record<Grade, number> = {
  K: 2, '1': 10, '2': 18, '3': 26, '4': 34, '5': 42,
  '6': 50, '7': 58, '8': 66, '9': 74, '10': 82, adult: 90,
}

const DIFFICULTY_OFFSET: Record<Difficulty, number> = {
  'very-easy': -16,
  easy: -8,
  medium: 0,
  hard: 9,
  'very-hard': 18,
}

/** Linear ramp between two anchor points, clamped outside the interval. */
function ramp(score: number, x0: number, y0: number, x1: number, y1: number): number {
  if (score <= x0) return y0
  if (score >= x1) return y1
  return y0 + ((score - x0) / (x1 - x0)) * (y1 - y0)
}

/** Picks the value whose threshold the score has passed. Steps must ascend. */
function step<T>(score: number, steps: Array<[number, T]>): T {
  let out = steps[0][1]
  for (const [threshold, value] of steps) {
    if (score >= threshold) out = value
  }
  return out
}

export function difficultyScore(grade: Grade, difficulty: Difficulty): number {
  return clamp(GRADE_SCORE[grade] + DIFFICULTY_OFFSET[difficulty], 0, 100)
}

/**
 * Operations that are age-appropriate at a given score. The ladder mirrors the
 * order most curricula introduce them, so a Grade 2 sheet never shows algebra
 * and a Grade 9 sheet is not stuck on single-digit addition.
 */
function operationsFor(score: number): Operation[] {
  const ops: Operation[] = ['addition']
  if (score >= 8) ops.push('subtraction')
  if (score >= 22) ops.push('multiplication')
  if (score >= 30) ops.push('division')
  if (score >= 38) ops.push('fractions')
  if (score >= 44) ops.push('decimals')
  if (score >= 50) ops.push('percentages')
  if (score >= 52) ops.push('geometry')
  if (score >= 56) ops.push('integers')
  if (score >= 60) ops.push('algebra')
  if (score >= 64) ops.push('exponents')
  if (score >= 34) ops.push('sequences')
  return ops
}

function sequenceKindsFor(score: number): string[] {
  const kinds = ['arithmetic']
  if (score >= 16) kinds.push('skip-count')
  if (score >= 26) kinds.push('geometric', 'alternating')
  if (score >= 36) kinds.push('squares', 'triangular')
  if (score >= 46) kinds.push('fibonacci', 'double-step')
  if (score >= 56) kinds.push('quadratic', 'cubes')
  if (score >= 68) kinds.push('primes', 'recursive')
  return kinds
}

export function buildProfile(grade: Grade, difficulty: Difficulty): DifficultyProfile {
  const score = difficultyScore(grade, difficulty)

  const numMax = Math.round(
    step(score, [
      [0, 5], [6, 10], [14, 20], [22, 50], [30, 100], [38, 144],
      [46, 250], [54, 500], [62, 750], [72, 1000], [84, 2000],
    ]),
  )
  const numMin = score >= 56 ? -Math.round(numMax / 4) : 1

  const tableMax = Math.round(ramp(score, 20, 5, 60, 12))

  return {
    score,

    numberRange: [numMin, numMax],
    tableRange: [2, clamp(tableMax, 2, 12)],
    operations: operationsFor(score),
    maxSteps: clamp(Math.round(ramp(score, 5, 1, 85, 4)), 1, 4),

    allowNegatives: score >= 56,
    allowDecimals: score >= 44,
    decimalPlaces: score >= 62 ? 3 : score >= 44 ? 2 : 1,
    denominators: step(score, [
      [0, [2, 4]],
      [34, [2, 3, 4, 5]],
      [42, [2, 3, 4, 5, 6, 8, 10]],
      [52, [2, 3, 4, 5, 6, 8, 9, 10, 12]],
      [64, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 20]],
    ]) as number[],

    wordLength: [
      Math.round(ramp(score, 0, 3, 70, 5)),
      Math.round(ramp(score, 0, 5, 70, 12)),
    ] as [number, number],
    vocabTier: clamp(Math.round(ramp(score, 0, 1, 90, 5)), 1, 5),

    gridSize: Math.round(clamp(ramp(score, 0, 8, 80, 18), 7, 20)),
    mazeSize: [
      Math.round(clamp(ramp(score, 0, 7, 85, 19), 6, 21)),
      Math.round(clamp(ramp(score, 0, 9, 85, 25), 8, 27)),
    ] as [number, number],

    sudokuBox: score >= 30 ? 3 : 2,
    sudokuHolesRatio: clamp(ramp(score, 10, 0.35, 90, 0.68), 0.3, 0.7),

    bingoSize: score >= 30 ? 5 : score >= 14 ? 4 : 3,

    distractorTightness: clamp(ramp(score, 0, 0.2, 90, 0.95), 0.15, 0.95),
    clueGenerosity: clamp(ramp(score, 0, 1.6, 90, 1.0), 1, 1.6),
    wordSearchDirections: score >= 55 ? 8 : score >= 34 ? 6 : score >= 16 ? 4 : 3,

    logicSize: [
      Math.round(clamp(ramp(score, 10, 3, 80, 5), 3, 5)),
      Math.round(clamp(ramp(score, 10, 2, 80, 4), 2, 4)),
    ] as [number, number],

    sequenceKinds: sequenceKindsFor(score),
  }
}

/**
 * Resolves `mathTopic: 'auto'` into a concrete strand appropriate for the score.
 * Weighted so the dominant strand for that age band shows up most often but the
 * sheet still mixes in neighbouring strands - which is what keeps regenerating
 * the same config interesting.
 */
export function resolveMathTopics(topic: MathTopic, profile: DifficultyProfile): MathTopic[] {
  if (topic !== 'auto') return [topic]
  const s = profile.score
  const pool: MathTopic[] = ['addition']
  if (s >= 8) pool.push('subtraction')
  if (s >= 14) pool.push('place-value')
  if (s >= 22) pool.push('multiplication')
  if (s >= 30) pool.push('division', 'rounding')
  if (s >= 34) pool.push('sequences')
  if (s >= 38) pool.push('fractions')
  if (s >= 44) pool.push('decimals', 'measurement')
  if (s >= 50) pool.push('percentages', 'averages')
  if (s >= 52) pool.push('geometry')
  if (s >= 56) pool.push('integers')
  if (s >= 60) pool.push('algebra')
  if (s >= 64) pool.push('exponents')
  if (s >= 40) pool.push('word-problems')
  // Bias towards the newest three strands the learner has unlocked.
  return pool.slice(-Math.min(pool.length, 5))
}

/** Human summary shown in the UI so the difficulty dial feels transparent. */
export function describeProfile(p: DifficultyProfile): string[] {
  const [lo, hi] = p.numberRange
  return [
    `Numbers ${lo} to ${hi}`,
    `Up to ${p.maxSteps} step${p.maxSteps === 1 ? '' : 's'} per question`,
    `Operations: ${p.operations.slice(0, 5).join(', ')}${p.operations.length > 5 ? '…' : ''}`,
    `Words ${p.wordLength[0]}–${p.wordLength[1]} letters (tier ${p.vocabTier})`,
  ]
}

/**
 * Suggested item count for a target play time. Rough classroom rule of thumb:
 * one item per 20-40 seconds depending on how much work each item takes.
 */
export function itemsForDuration(minutes: number, secondsPerItem: number): number {
  return clamp(Math.round((minutes * 60) / secondsPerItem), 4, 120)
}
