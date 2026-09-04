import { describe, expect, it } from 'vitest'
import { buildProfile } from '../src/engines/difficulty'
import {
  buildSequence, fractionToString, generateProblem, generateProblemSet,
  makeDistractors, simplify, SYM,
} from '../src/engines/equations'
import { evalExpr, ExpressionError, tryEvalExpr } from '../src/engines/expression'
import { verifyMathProblem } from '../src/engines/validation'
import { defaultConfigFor } from '../src/engines/config'
import { createRng } from '../src/utils/rng'
import type { Difficulty, Grade, MathTopic } from '../src/types'

/**
 * Mathematical correctness.
 *
 * The headline test is "every generated answer is verified": tens of thousands
 * of problems across every topic, grade and difficulty are re-derived through
 * the independent expression evaluator and compared with the stored answer.
 */

const TOPICS: MathTopic[] = [
  'addition', 'subtraction', 'multiplication', 'division', 'mixed-operations',
  'place-value', 'rounding', 'fractions', 'decimals', 'percentages', 'integers',
  'exponents', 'averages', 'measurement', 'geometry', 'algebra', 'sequences',
  'word-problems',
]

const GRADES: Grade[] = ['K', '2', '4', '6', '8', '10', 'adult']
const DIFFICULTIES: Difficulty[] = ['very-easy', 'easy', 'medium', 'hard', 'very-hard']

describe('expression evaluator', () => {
  it('respects operator precedence and associativity', () => {
    expect(evalExpr('2 + 3 * 4')).toBe(14)
    expect(evalExpr('(2 + 3) * 4')).toBe(20)
    expect(evalExpr('20 - 4 - 6')).toBe(10)
    expect(evalExpr('2 ^ 3 ^ 2')).toBe(512) // right-associative
    expect(evalExpr('-5 + 12')).toBe(7)
    expect(evalExpr('100 / 5 / 2')).toBe(10)
    expect(evalExpr('sqrt(81)')).toBe(9)
    expect(evalExpr('round(47.38) * 100')).toBe(4700)
    expect(evalExpr('1 / 2 + 1 / 3')).toBeCloseTo(0.8333333, 6)
  })

  it('understands the printed multiplication and division glyphs', () => {
    expect(evalExpr(`7 ${SYM.times} 8`)).toBe(56)
    expect(evalExpr(`72 ${SYM.divide} 9`)).toBe(8)
    expect(evalExpr('5²')).toBe(25)
  })

  it('rejects malformed input rather than guessing', () => {
    expect(() => evalExpr('2 +')).toThrow(ExpressionError)
    expect(() => evalExpr('(2 + 3')).toThrow(ExpressionError)
    expect(() => evalExpr('2 / 0')).toThrow(ExpressionError)
    expect(() => evalExpr('bogus(4)')).toThrow(ExpressionError)
    expect(() => evalExpr('4 4')).toThrow(ExpressionError)
    expect(tryEvalExpr('nonsense').ok).toBe(false)
  })
})

describe('fractions', () => {
  it('simplifies to lowest terms', () => {
    expect(simplify({ n: 8, d: 12 })).toEqual({ n: 2, d: 3 })
    expect(simplify({ n: 10, d: 5 })).toEqual({ n: 2, d: 1 })
    expect(simplify({ n: -6, d: 9 })).toEqual({ n: -2, d: 3 })
  })

  it('formats mixed numbers the way a worksheet prints them', () => {
    expect(fractionToString({ n: 3, d: 4 })).toBe('3/4')
    expect(fractionToString({ n: 7, d: 4 })).toBe('1 3/4')
    expect(fractionToString({ n: 8, d: 4 })).toBe('2')
    expect(fractionToString({ n: 7, d: 4 }, false)).toBe('7/4')
  })
})

describe('every generated problem verifies', () => {
  it.each(TOPICS)('topic "%s" is correct at every grade and difficulty', (topic) => {
    let checked = 0
    for (const grade of GRADES) {
      for (const difficulty of DIFFICULTIES) {
        const profile = buildProfile(grade, difficulty)
        const rng = createRng(`${topic}-${grade}-${difficulty}`)
        for (let i = 0; i < 60; i++) {
          const problem = generateProblem(topic, rng, profile)
          const result = verifyMathProblem(problem)
          expect(
            result.ok,
            `${topic} @ ${grade}/${difficulty}: ${JSON.stringify(result.issues)} for "${problem.question}" -> "${problem.answer}"`,
          ).toBe(true)
          expect(problem.question.trim().length).toBeGreaterThan(0)
          expect(problem.answer.trim().length).toBeGreaterThan(0)
          checked++
        }
      }
    }
    expect(checked).toBe(GRADES.length * DIFFICULTIES.length * 60)
  })

  it('never produces a negative answer when negatives are disallowed', () => {
    for (const grade of ['K', '1', '2', '3', '4'] as Grade[]) {
      const profile = buildProfile(grade, 'medium')
      expect(profile.allowNegatives).toBe(false)
      const rng = createRng(`no-neg-${grade}`)
      for (const topic of ['subtraction', 'fractions', 'algebra', 'word-problems'] as MathTopic[]) {
        for (let i = 0; i < 200; i++) {
          const problem = generateProblem(topic, rng, profile)
          if (problem.value !== null) {
            expect(problem.value, `${topic} @ ${grade} produced ${problem.value}`).toBeGreaterThanOrEqual(0)
          }
        }
      }
    }
  })

  it('keeps division exact - no remainders on a division sheet', () => {
    for (const grade of GRADES) {
      const profile = buildProfile(grade, 'medium')
      const rng = createRng(`division-${grade}`)
      for (let i = 0; i < 200; i++) {
        const problem = generateProblem('division', rng, profile)
        expect(Number.isInteger(problem.value)).toBe(true)
      }
    }
  })
})

describe('problem sets', () => {
  it('returns the requested count with no duplicate questions', () => {
    const config = defaultConfigFor('quiz-cards', 'set-seed')
    for (const count of [5, 20, 45]) {
      const ctx = {
        config: { ...config, subject: 'mathematics' as const },
        rng: createRng(`set-${count}`),
        profile: buildProfile('5', 'medium'),
      }
      const problems = generateProblemSet(count, ctx)
      expect(problems).toHaveLength(count)
      expect(new Set(problems.map((p) => p.question)).size).toBe(count)
      for (const problem of problems) expect(verifyMathProblem(problem).ok).toBe(true)
    }
  })

  it('honours integer-only and range constraints (bingo needs both)', () => {
    const config = defaultConfigFor('math-bingo', 'bingo-seed')
    const ctx = { config, rng: createRng('bingo'), profile: buildProfile('5', 'medium') }
    const problems = generateProblemSet(40, ctx, {
      integerAnswersOnly: true,
      uniqueAnswers: true,
      answerRange: [0, 999],
    })
    expect(problems).toHaveLength(40)
    const values = problems.map((p) => p.value as number)
    expect(new Set(values).size).toBe(40)
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(999)
    }
  })
})

describe('distractors', () => {
  it('are plausible, distinct, and never equal to the answer', () => {
    const profile = buildProfile('5', 'medium')
    const rng = createRng('distractors')
    for (let i = 0; i < 300; i++) {
      const problem = generateProblem('multiplication', rng, profile)
      const distractors = makeDistractors(problem, 3, rng, profile)
      expect(distractors.length).toBe(3)
      expect(new Set(distractors).size).toBe(3)
      expect(distractors).not.toContain(problem.answer)
    }
  })
})

describe('sequences', () => {
  it('follows a stated rule and hides a recoverable term', () => {
    for (const grade of GRADES) {
      const profile = buildProfile(grade, 'medium')
      const rng = createRng(`seq-${grade}`)
      for (let i = 0; i < 200; i++) {
        const spec = buildSequence(rng, profile)
        expect(spec.terms.length).toBeGreaterThanOrEqual(4)
        expect(spec.terms.every(Number.isFinite)).toBe(true)
        expect(spec.hiddenIndex).toBeGreaterThanOrEqual(0)
        expect(spec.hiddenIndex).toBeLessThan(spec.terms.length)
        expect(spec.rule.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('difficulty engine', () => {
  it('increases the number range monotonically with grade', () => {
    let previous = 0
    for (const grade of ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'adult'] as Grade[]) {
      const max = buildProfile(grade, 'medium').numberRange[1]
      expect(max, `grade ${grade}`).toBeGreaterThanOrEqual(previous)
      previous = max
    }
  })

  it('increases the number range monotonically with difficulty', () => {
    let previous = 0
    for (const difficulty of DIFFICULTIES) {
      const max = buildProfile('6', difficulty).numberRange[1]
      expect(max, difficulty).toBeGreaterThanOrEqual(previous)
      previous = max
    }
  })

  it('unlocks operations in curriculum order', () => {
    expect(buildProfile('K', 'very-easy').operations).toEqual(['addition'])
    expect(buildProfile('4', 'medium').operations).toContain('multiplication')
    expect(buildProfile('4', 'medium').operations).not.toContain('algebra')
    expect(buildProfile('9', 'medium').operations).toContain('algebra')
  })
})
