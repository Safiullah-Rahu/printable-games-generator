import type { DifficultyProfile, GenContext, MathTopic } from '../types'
import type { Rng } from '../utils/rng'
import { clamp, fmtNumber, gcd, roundTo, sum } from '../utils/misc'
import { resolveMathTopics } from './difficulty'

/**
 * Mathematical content engine.
 *
 * Every problem produced here carries three things:
 *   - `question`  what gets printed on the sheet
 *   - `answer`    what gets printed on the answer key
 *   - `expr`      an arithmetic expression that RE-DERIVES the answer from the
 *                 printed facts, evaluated by engines/expression.ts
 *
 * The third one matters: it lets the validation engine confirm the answer key
 * without trusting the code that produced it. Problems whose expression does not
 * evaluate to the stored answer are rejected and regenerated.
 */

/** Print symbols. Restricted to glyphs present in the PDF base-14 WinAnsi set. */
export const SYM = {
  times: '×', // multiplication sign
  divide: '÷', // division sign
  minus: '-',
  degree: '°',
  squared: '²',
  cubed: '³',
  pi: 'pi',
} as const

const PI = Math.PI

export interface MathProblem {
  id: string
  topic: MathTopic
  /** Full question line, e.g. "17 + 25 = ?" */
  question: string
  /** Compact form for tight cells/cards, e.g. "17 + 25" */
  prompt: string
  /** Printed answer, e.g. "42" or "3 1/2" */
  answer: string
  /** Numeric value of the answer, when one exists. */
  value: number | null
  /** Independent verification expression, or null when not applicable. */
  expr: string | null
  /** Comparison tolerance for `value` vs `eval(expr)`. */
  tolerance: number
  /** Worked solution shown on a detailed answer key. */
  steps: string[]
  /** Relative weight, only used for ordering easiest-first. */
  weight: number
}

let problemCounter = 0
function makeProblem(p: Omit<MathProblem, 'id' | 'tolerance' | 'steps' | 'weight'> & Partial<MathProblem>): MathProblem {
  problemCounter += 1
  return {
    id: `p${problemCounter}`,
    tolerance: 1e-6,
    steps: [],
    weight: 0,
    ...p,
  }
}

/* ------------------------------------------------------------------ *
 * Fraction helpers
 * ------------------------------------------------------------------ */

export interface Fraction {
  n: number
  d: number
}

export function simplify(f: Fraction): Fraction {
  const g = gcd(f.n, f.d) || 1
  const sign = f.d < 0 ? -1 : 1
  return { n: (sign * f.n) / g, d: (sign * f.d) / g }
}

export function fractionToString(f: Fraction, mixed = true): string {
  const s = simplify(f)
  if (s.d === 1) return String(s.n)
  if (!mixed || Math.abs(s.n) < s.d) return `${s.n}/${s.d}`
  const whole = Math.trunc(s.n / s.d)
  const rem = Math.abs(s.n % s.d)
  if (rem === 0) return String(whole)
  return `${whole} ${rem}/${s.d}`
}

const fracValue = (f: Fraction): number => f.n / f.d

/* ------------------------------------------------------------------ *
 * Whole-number arithmetic
 * ------------------------------------------------------------------ */

function pickOperand(rng: Rng, p: DifficultyProfile, scale = 1): number {
  const max = Math.max(2, Math.round(p.numberRange[1] * scale))
  const min = Math.max(1, Math.round(Math.max(1, p.numberRange[0]) * scale))
  return rng.int(min, Math.max(min + 1, max))
}

function addition(rng: Rng, p: DifficultyProfile): MathProblem {
  const a = pickOperand(rng, p)
  const b = pickOperand(rng, p, 0.9)
  return makeProblem({
    topic: 'addition',
    question: `${a} + ${b} = ?`,
    prompt: `${a} + ${b}`,
    answer: String(a + b),
    value: a + b,
    expr: `${a} + ${b}`,
    steps: [`${a} + ${b} = ${a + b}`],
    weight: a + b,
  })
}

function subtraction(rng: Rng, p: DifficultyProfile): MathProblem {
  let a = pickOperand(rng, p)
  let b = pickOperand(rng, p, 0.8)
  if (!p.allowNegatives && b > a) [a, b] = [b, a]
  const result = a - b
  return makeProblem({
    topic: 'subtraction',
    question: `${a} ${SYM.minus} ${b} = ?`,
    prompt: `${a} ${SYM.minus} ${b}`,
    answer: String(result),
    value: result,
    expr: `${a} - ${b}`,
    steps: [`${a} ${SYM.minus} ${b} = ${result}`],
    weight: a,
  })
}

function multiplication(rng: Rng, p: DifficultyProfile): MathProblem {
  const [tMin, tMax] = p.tableRange
  const a = rng.int(tMin, tMax)
  // Above Grade 5 the second factor grows past the times tables.
  const b = p.score >= 44 && rng.chance(0.45)
    ? rng.int(11, clamp(Math.round(p.numberRange[1] / 8), 12, 99))
    : rng.int(tMin, tMax)
  return makeProblem({
    topic: 'multiplication',
    question: `${a} ${SYM.times} ${b} = ?`,
    prompt: `${a} ${SYM.times} ${b}`,
    answer: String(a * b),
    value: a * b,
    expr: `${a} * ${b}`,
    steps: [`${a} ${SYM.times} ${b} = ${a * b}`],
    weight: a * b,
  })
}

function division(rng: Rng, p: DifficultyProfile): MathProblem {
  // Built backwards from a product so the division is always exact.
  const [tMin, tMax] = p.tableRange
  const divisor = rng.int(Math.max(2, tMin), tMax)
  const quotient = rng.int(2, p.score >= 44 ? Math.max(4, tMax * 2) : tMax)
  const dividend = divisor * quotient
  return makeProblem({
    topic: 'division',
    question: `${dividend} ${SYM.divide} ${divisor} = ?`,
    prompt: `${dividend} ${SYM.divide} ${divisor}`,
    answer: String(quotient),
    value: quotient,
    expr: `${dividend} / ${divisor}`,
    steps: [`${divisor} ${SYM.times} ${quotient} = ${dividend}, so ${dividend} ${SYM.divide} ${divisor} = ${quotient}`],
    weight: dividend,
  })
}

function mixedOperations(rng: Rng, p: DifficultyProfile): MathProblem {
  const steps = clamp(p.maxSteps, 2, 4)
  const [tMin, tMax] = p.tableRange
  const a = rng.int(tMin, tMax)
  const b = rng.int(tMin, tMax)
  const c = rng.int(2, Math.max(3, Math.round(p.numberRange[1] / 4)))

  if (steps >= 3 && rng.chance(0.5)) {
    // (a + b) x c - keeps the parentheses meaningful.
    const d = rng.int(2, Math.max(3, tMax))
    const value = (a + b) * c - d
    if (!p.allowNegatives && value < 0) return mixedOperations(rng, p)
    return makeProblem({
      topic: 'mixed-operations',
      question: `(${a} + ${b}) ${SYM.times} ${c} ${SYM.minus} ${d} = ?`,
      prompt: `(${a} + ${b}) ${SYM.times} ${c} ${SYM.minus} ${d}`,
      answer: String(value),
      value,
      expr: `(${a} + ${b}) * ${c} - ${d}`,
      steps: [`${a} + ${b} = ${a + b}`, `${a + b} ${SYM.times} ${c} = ${(a + b) * c}`, `${(a + b) * c} ${SYM.minus} ${d} = ${value}`],
      weight: Math.abs(value),
    })
  }

  const value = a * b + c
  return makeProblem({
    topic: 'mixed-operations',
    question: `${a} ${SYM.times} ${b} + ${c} = ?`,
    prompt: `${a} ${SYM.times} ${b} + ${c}`,
    answer: String(value),
    value,
    expr: `${a} * ${b} + ${c}`,
    steps: [`Multiply first: ${a} ${SYM.times} ${b} = ${a * b}`, `${a * b} + ${c} = ${value}`],
    weight: value,
  })
}

function placeValue(rng: Rng, p: DifficultyProfile): MathProblem {
  const places = clamp(Math.round(2 + p.score / 22), 2, 7)
  const digits: number[] = [rng.int(1, 9)]
  for (let i = 1; i < places; i++) digits.push(rng.int(0, 9))
  const numberStr = digits.join('')
  const index = rng.int(0, places - 1)
  const digit = digits[index]
  const placeValueOf = 10 ** (places - 1 - index)
  const names = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands', 'hundred thousands', 'millions']
  const placeName = names[places - 1 - index]
  const value = digit * placeValueOf
  return makeProblem({
    topic: 'place-value',
    question: `In ${numberStr}, what is the value of the digit ${digit}?`,
    prompt: `Value of ${digit} in ${numberStr}`,
    answer: String(value),
    value,
    expr: `${digit} * ${placeValueOf}`,
    steps: [`The ${digit} sits in the ${placeName} place`, `${digit} ${SYM.times} ${placeValueOf} = ${value}`],
    weight: value,
  })
}

function rounding(rng: Rng, p: DifficultyProfile): MathProblem {
  const magnitude = rng.pick(p.score >= 46 ? [10, 100, 1000] : [10, 100])
  const n = rng.int(magnitude, Math.max(magnitude * 9, p.numberRange[1]))
  const value = Math.round(n / magnitude) * magnitude
  const names: Record<number, string> = { 10: 'ten', 100: 'hundred', 1000: 'thousand' }
  return makeProblem({
    topic: 'rounding',
    question: `Round ${n} to the nearest ${names[magnitude]}.`,
    prompt: `Round ${n} to nearest ${magnitude}`,
    answer: String(value),
    value,
    expr: `round(${n} / ${magnitude}) * ${magnitude}`,
    steps: [`${n} sits between ${Math.floor(n / magnitude) * magnitude} and ${Math.ceil(n / magnitude) * magnitude}`, `Nearest is ${value}`],
    weight: n,
  })
}

/* ------------------------------------------------------------------ *
 * Fractions, decimals, percentages
 * ------------------------------------------------------------------ */

function fractions(rng: Rng, p: DifficultyProfile): MathProblem {
  const dens = p.denominators
  const mode = rng.pick(
    p.score >= 52
      ? ['add', 'sub', 'mul', 'div', 'simplify', 'of']
      : p.score >= 42
        ? ['add', 'sub', 'simplify', 'of']
        : ['add', 'sub', 'simplify'],
  )

  if (mode === 'simplify') {
    const base = simplify({ n: rng.int(1, 9), d: rng.pick(dens.filter((d) => d > 1)) })
    const factor = rng.int(2, 6)
    const n = base.n * factor
    const d = base.d * factor
    return makeProblem({
      topic: 'fractions',
      question: `Write ${n}/${d} in its simplest form.`,
      prompt: `Simplify ${n}/${d}`,
      answer: fractionToString({ n, d }),
      value: n / d,
      expr: `${n} / ${d}`,
      steps: [`Both parts divide by ${gcd(n, d)}`, `${n}/${d} = ${fractionToString({ n, d })}`],
      weight: d,
    })
  }

  if (mode === 'of') {
    const d = rng.pick(dens)
    const n = rng.int(1, d - 1)
    const multiple = rng.int(2, Math.max(3, Math.round(p.numberRange[1] / d)))
    const whole = d * multiple
    const value = (n / d) * whole
    return makeProblem({
      topic: 'fractions',
      question: `What is ${n}/${d} of ${whole}?`,
      prompt: `${n}/${d} of ${whole}`,
      answer: String(value),
      value,
      expr: `${n} / ${d} * ${whole}`,
      steps: [`${whole} ${SYM.divide} ${d} = ${whole / d}`, `${whole / d} ${SYM.times} ${n} = ${value}`],
      weight: whole,
    })
  }

  const d1 = rng.pick(dens)
  const d2 = p.score >= 46 ? rng.pick(dens) : d1
  const f1: Fraction = { n: rng.int(1, Math.max(1, d1 - 1)), d: d1 }
  const f2: Fraction = { n: rng.int(1, Math.max(1, d2 - 1)), d: d2 }

  if (mode === 'mul') {
    const result = simplify({ n: f1.n * f2.n, d: f1.d * f2.d })
    return makeProblem({
      topic: 'fractions',
      question: `${f1.n}/${f1.d} ${SYM.times} ${f2.n}/${f2.d} = ?`,
      prompt: `${f1.n}/${f1.d} ${SYM.times} ${f2.n}/${f2.d}`,
      answer: fractionToString(result),
      value: fracValue(result),
      expr: `${f1.n} / ${f1.d} * ${f2.n} / ${f2.d}`,
      steps: [`Multiply tops and bottoms: ${f1.n * f2.n}/${f1.d * f2.d}`, `Simplify: ${fractionToString(result)}`],
      weight: f1.d * f2.d,
    })
  }

  if (mode === 'div') {
    const result = simplify({ n: f1.n * f2.d, d: f1.d * f2.n })
    return makeProblem({
      topic: 'fractions',
      question: `${f1.n}/${f1.d} ${SYM.divide} ${f2.n}/${f2.d} = ?`,
      prompt: `${f1.n}/${f1.d} ${SYM.divide} ${f2.n}/${f2.d}`,
      answer: fractionToString(result),
      value: fracValue(result),
      expr: `(${f1.n} / ${f1.d}) / (${f2.n} / ${f2.d})`,
      steps: [`Flip the second fraction and multiply`, `= ${fractionToString(result)}`],
      weight: f1.d * f2.d,
    })
  }

  const isAdd = mode === 'add'
  let n1 = f1.n * f2.d
  const n2 = f2.n * f1.d
  const denom = f1.d * f2.d
  n1 = isAdd ? n1 + n2 : n1 - n2
  if (!p.allowNegatives && n1 < 0) {
    return fractions(rng, p)
  }
  const result = simplify({ n: n1, d: denom })
  return makeProblem({
    topic: 'fractions',
    question: `${f1.n}/${f1.d} ${isAdd ? '+' : SYM.minus} ${f2.n}/${f2.d} = ?`,
    prompt: `${f1.n}/${f1.d} ${isAdd ? '+' : SYM.minus} ${f2.n}/${f2.d}`,
    answer: fractionToString(result),
    value: fracValue(result),
    expr: `${f1.n} / ${f1.d} ${isAdd ? '+' : '-'} ${f2.n} / ${f2.d}`,
    steps: [
      d1 === d2 ? `Same denominator, so combine the tops` : `Common denominator is ${denom}`,
      `= ${fractionToString(result)}`,
    ],
    weight: denom,
  })
}

function decimals(rng: Rng, p: DifficultyProfile): MathProblem {
  const places = clamp(p.decimalPlaces, 1, 2)
  const scale = 10 ** places
  const a = roundTo(rng.int(1, Math.max(10, Math.round(p.numberRange[1] / 4))) + rng.int(1, scale - 1) / scale, places)
  const b = roundTo(rng.int(1, Math.max(5, Math.round(p.numberRange[1] / 8))) + rng.int(1, scale - 1) / scale, places)
  const mode = rng.pick(p.score >= 54 ? ['add', 'sub', 'mul'] : ['add', 'sub'])

  if (mode === 'mul') {
    const whole = rng.int(2, 9)
    const value = roundTo(a * whole, places + 1)
    return makeProblem({
      topic: 'decimals',
      question: `${a.toFixed(places)} ${SYM.times} ${whole} = ?`,
      prompt: `${a.toFixed(places)} ${SYM.times} ${whole}`,
      answer: fmtNumber(value, places + 1),
      value,
      expr: `${a} * ${whole}`,
      tolerance: 1e-6,
      steps: [`${a.toFixed(places)} ${SYM.times} ${whole} = ${fmtNumber(value, places + 1)}`],
      weight: value,
    })
  }

  const isAdd = mode === 'add'
  const [x, y] = !isAdd && b > a ? [b, a] : [a, b]
  const value = roundTo(isAdd ? x + y : x - y, places)
  return makeProblem({
    topic: 'decimals',
    question: `${x.toFixed(places)} ${isAdd ? '+' : SYM.minus} ${y.toFixed(places)} = ?`,
    prompt: `${x.toFixed(places)} ${isAdd ? '+' : SYM.minus} ${y.toFixed(places)}`,
    answer: value.toFixed(places),
    value,
    expr: `${x} ${isAdd ? '+' : '-'} ${y}`,
    tolerance: 1e-6,
    steps: [`Line up the decimal points`, `= ${value.toFixed(places)}`],
    weight: value,
  })
}

function percentages(rng: Rng, p: DifficultyProfile): MathProblem {
  const mode = rng.pick(p.score >= 62 ? ['of', 'find-percent', 'increase'] : ['of', 'find-percent'])
  const pct = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90])

  if (mode === 'find-percent') {
    const whole = rng.pick([20, 25, 40, 50, 80, 100, 200, 250])
    const part = roundTo((pct / 100) * whole, 2)
    return makeProblem({
      topic: 'percentages',
      question: `${part} is what percent of ${whole}?`,
      prompt: `${part} of ${whole} = ?%`,
      answer: `${pct}%`,
      value: pct,
      expr: `${part} / ${whole} * 100`,
      steps: [`percent = (part ${SYM.divide} whole) ${SYM.times} 100`, `(${part} ${SYM.divide} ${whole}) ${SYM.times} 100 = ${pct}%`],
      weight: whole,
    })
  }

  if (mode === 'increase') {
    const base = rng.pick([40, 50, 60, 80, 120, 150, 200, 240])
    const value = roundTo(base * (1 + pct / 100), 2)
    return makeProblem({
      topic: 'percentages',
      question: `Increase ${base} by ${pct}%.`,
      prompt: `${base} + ${pct}%`,
      answer: fmtNumber(value),
      value,
      expr: `${base} * (1 + ${pct} / 100)`,
      steps: [`${pct}% of ${base} = ${roundTo((pct / 100) * base, 2)}`, `${base} + ${roundTo((pct / 100) * base, 2)} = ${fmtNumber(value)}`],
      weight: base,
    })
  }

  const whole = rng.pick([20, 30, 40, 50, 60, 80, 90, 100, 120, 150, 200, 300])
  const value = roundTo((pct / 100) * whole, 2)
  return makeProblem({
    topic: 'percentages',
    question: `What is ${pct}% of ${whole}?`,
    prompt: `${pct}% of ${whole}`,
    answer: fmtNumber(value),
    value,
    expr: `${whole} * ${pct} / 100`,
    steps: [`${pct}% = ${pct}/100`, `${whole} ${SYM.times} ${pct}/100 = ${fmtNumber(value)}`],
    weight: whole,
  })
}

function integers(rng: Rng, p: DifficultyProfile): MathProblem {
  const cap = clamp(Math.round(p.numberRange[1] / 8), 9, 60)
  const a = rng.int(-cap, cap)
  const b = rng.int(-cap, cap)
  const op = rng.pick(['+', '-', SYM.times])
  const av = op === '+' ? a + b : op === '-' ? a - b : a * b
  const showB = b < 0 ? `(${b})` : String(b)
  const showA = a < 0 ? `(${a})` : String(a)
  const exprOp = op === SYM.times ? '*' : op
  return makeProblem({
    topic: 'integers',
    question: `${showA} ${op} ${showB} = ?`,
    prompt: `${showA} ${op} ${showB}`,
    answer: String(av),
    value: av,
    expr: `(${a}) ${exprOp} (${b})`,
    steps: [`${showA} ${op} ${showB} = ${av}`],
    weight: Math.abs(av),
  })
}

function exponents(rng: Rng, p: DifficultyProfile): MathProblem {
  if (rng.chance(0.4)) {
    const root = rng.int(2, p.score >= 70 ? 20 : 12)
    const square = root * root
    return makeProblem({
      topic: 'exponents',
      question: `What is the square root of ${square}?`,
      prompt: `sqrt(${square})`,
      answer: String(root),
      value: root,
      expr: `sqrt(${square})`,
      steps: [`${root} ${SYM.times} ${root} = ${square}`],
      weight: square,
    })
  }
  const base = rng.int(2, p.score >= 70 ? 15 : 10)
  const power = rng.pick(p.score >= 70 ? [2, 2, 3, 3, 4] : [2, 2, 3])
  const value = base ** power
  const glyph = power === 2 ? SYM.squared : power === 3 ? SYM.cubed : `^${power}`
  return makeProblem({
    topic: 'exponents',
    question: `${base}${glyph} = ?`,
    prompt: `${base}${glyph}`,
    answer: String(value),
    value,
    expr: `${base} ^ ${power}`,
    steps: [`${Array(power).fill(base).join(` ${SYM.times} `)} = ${value}`],
    weight: value,
  })
}

function averages(rng: Rng, p: DifficultyProfile): MathProblem {
  const count = rng.int(3, p.score >= 60 ? 6 : 4)
  const cap = clamp(Math.round(p.numberRange[1] / 4), 10, 200)
  // Choose values that divide evenly so the mean stays a clean number.
  const mean = rng.int(4, cap)
  const offsets: number[] = []
  let running = 0
  for (let i = 0; i < count - 1; i++) {
    const o = rng.int(-Math.min(mean - 1, 9), 9)
    offsets.push(o)
    running += o
  }
  offsets.push(-running)
  const values = offsets.map((o) => mean + o)
  if (values.some((v) => v < 0)) return averages(rng, p)
  return makeProblem({
    topic: 'averages',
    question: `Find the mean of ${values.join(', ')}.`,
    prompt: `Mean of ${values.join(', ')}`,
    answer: String(mean),
    value: mean,
    expr: `(${values.join(' + ')}) / ${count}`,
    steps: [`Sum = ${sum(values)}`, `${sum(values)} ${SYM.divide} ${count} = ${mean}`],
    weight: mean,
  })
}

function measurement(rng: Rng, p: DifficultyProfile): MathProblem {
  const conversions: Array<[string, string, number]> = [
    ['cm', 'mm', 10],
    ['m', 'cm', 100],
    ['km', 'm', 1000],
    ['kg', 'g', 1000],
    ['L', 'mL', 1000],
    ['hours', 'minutes', 60],
    ['minutes', 'seconds', 60],
    ['days', 'hours', 24],
    ['weeks', 'days', 7],
  ]
  const [from, to, factor] = rng.pick(conversions)
  const useDecimal = p.allowDecimals && rng.chance(0.35)
  const amount = useDecimal ? roundTo(rng.int(1, 9) + rng.int(1, 9) / 10, 1) : rng.int(2, 12)
  const value = roundTo(amount * factor, 3)
  return makeProblem({
    topic: 'measurement',
    question: `${fmtNumber(amount)} ${from} = ? ${to}`,
    prompt: `${fmtNumber(amount)} ${from} to ${to}`,
    answer: `${fmtNumber(value)} ${to}`,
    value,
    expr: `${amount} * ${factor}`,
    steps: [`1 ${from} = ${factor} ${to}`, `${fmtNumber(amount)} ${SYM.times} ${factor} = ${fmtNumber(value)}`],
    weight: value,
  })
}

function geometry(rng: Rng, p: DifficultyProfile): MathProblem {
  const shapes = ['rect-area', 'rect-perimeter', 'triangle-area', 'square-area']
  if (p.score >= 56) shapes.push('circle-area', 'circle-circumference', 'pythagoras')
  if (p.score >= 62) shapes.push('cuboid-volume', 'angles')
  const shape = rng.pick(shapes)
  const cap = clamp(Math.round(p.numberRange[1] / 20), 6, 40)

  switch (shape) {
    case 'rect-area': {
      const l = rng.int(2, cap)
      const w = rng.int(2, cap)
      return makeProblem({
        topic: 'geometry',
        question: `A rectangle is ${l} cm long and ${w} cm wide. What is its area?`,
        prompt: `Area: ${l} cm ${SYM.times} ${w} cm`,
        answer: `${l * w} cm${SYM.squared}`,
        value: l * w,
        expr: `${l} * ${w}`,
        steps: [`area = length ${SYM.times} width`, `${l} ${SYM.times} ${w} = ${l * w} cm${SYM.squared}`],
        weight: l * w,
      })
    }
    case 'rect-perimeter': {
      const l = rng.int(2, cap)
      const w = rng.int(2, cap)
      const value = 2 * (l + w)
      return makeProblem({
        topic: 'geometry',
        question: `Find the perimeter of a ${l} cm by ${w} cm rectangle.`,
        prompt: `Perimeter: ${l} ${SYM.times} ${w} cm`,
        answer: `${value} cm`,
        value,
        expr: `2 * (${l} + ${w})`,
        steps: [`perimeter = 2 ${SYM.times} (length + width)`, `2 ${SYM.times} (${l} + ${w}) = ${value} cm`],
        weight: value,
      })
    }
    case 'square-area': {
      const s = rng.int(2, cap)
      return makeProblem({
        topic: 'geometry',
        question: `What is the area of a square with side ${s} cm?`,
        prompt: `Square area, side ${s} cm`,
        answer: `${s * s} cm${SYM.squared}`,
        value: s * s,
        expr: `${s} ^ 2`,
        steps: [`area = side${SYM.squared}`, `${s}${SYM.squared} = ${s * s} cm${SYM.squared}`],
        weight: s * s,
      })
    }
    case 'triangle-area': {
      const base = rng.int(2, cap) * 2 // even base keeps the halving clean
      const height = rng.int(2, cap)
      const value = 0.5 * base * height
      return makeProblem({
        topic: 'geometry',
        question: `A triangle has base ${base} cm and height ${height} cm. Find its area.`,
        prompt: `Triangle: b=${base}, h=${height}`,
        answer: `${fmtNumber(value)} cm${SYM.squared}`,
        value,
        expr: `0.5 * ${base} * ${height}`,
        steps: [`area = 0.5 ${SYM.times} base ${SYM.times} height`, `0.5 ${SYM.times} ${base} ${SYM.times} ${height} = ${fmtNumber(value)} cm${SYM.squared}`],
        weight: value,
      })
    }
    case 'circle-area': {
      const r = rng.int(2, 12)
      const value = roundTo(PI * r * r, 2)
      return makeProblem({
        topic: 'geometry',
        question: `Find the area of a circle with radius ${r} cm. Use ${SYM.pi} = 3.14.`,
        prompt: `Circle area, r=${r}`,
        answer: `${roundTo(3.14 * r * r, 2)} cm${SYM.squared}`,
        value: roundTo(3.14 * r * r, 2),
        expr: `3.14 * ${r} ^ 2`,
        tolerance: 0.02,
        steps: [`area = ${SYM.pi}r${SYM.squared}`, `3.14 ${SYM.times} ${r}${SYM.squared} = ${roundTo(3.14 * r * r, 2)} cm${SYM.squared}`],
        weight: value,
      })
    }
    case 'circle-circumference': {
      const r = rng.int(2, 15)
      const value = roundTo(2 * 3.14 * r, 2)
      return makeProblem({
        topic: 'geometry',
        question: `Find the circumference of a circle with radius ${r} cm. Use ${SYM.pi} = 3.14.`,
        prompt: `Circumference, r=${r}`,
        answer: `${value} cm`,
        value,
        expr: `2 * 3.14 * ${r}`,
        tolerance: 0.02,
        steps: [`circumference = 2${SYM.pi}r`, `2 ${SYM.times} 3.14 ${SYM.times} ${r} = ${value} cm`],
        weight: value,
      })
    }
    case 'pythagoras': {
      const triples: Array<[number, number, number]> = [
        [3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [7, 24, 25], [20, 21, 29],
      ]
      const [a, b, c] = rng.pick(triples)
      return makeProblem({
        topic: 'geometry',
        question: `A right triangle has legs ${a} cm and ${b} cm. How long is the hypotenuse?`,
        prompt: `Hypotenuse of ${a}, ${b}`,
        answer: `${c} cm`,
        value: c,
        expr: `sqrt(${a} ^ 2 + ${b} ^ 2)`,
        steps: [`a${SYM.squared} + b${SYM.squared} = c${SYM.squared}`, `${a * a} + ${b * b} = ${c * c}`, `c = ${c} cm`],
        weight: c,
      })
    }
    case 'cuboid-volume': {
      const l = rng.int(2, 12)
      const w = rng.int(2, 12)
      const h = rng.int(2, 12)
      return makeProblem({
        topic: 'geometry',
        question: `Find the volume of a box ${l} ${SYM.times} ${w} ${SYM.times} ${h} cm.`,
        prompt: `Volume ${l}${SYM.times}${w}${SYM.times}${h}`,
        answer: `${l * w * h} cm${SYM.cubed}`,
        value: l * w * h,
        expr: `${l} * ${w} * ${h}`,
        steps: [`volume = l ${SYM.times} w ${SYM.times} h`, `= ${l * w * h} cm${SYM.cubed}`],
        weight: l * w * h,
      })
    }
    default: {
      const known = rng.int(20, 150)
      const kind = rng.pick(['straight', 'triangle'])
      if (kind === 'straight') {
        const value = 180 - known
        return makeProblem({
          topic: 'geometry',
          question: `Two angles sit on a straight line. One is ${known}${SYM.degree}. Find the other.`,
          prompt: `180${SYM.degree} ${SYM.minus} ${known}${SYM.degree}`,
          answer: `${value}${SYM.degree}`,
          value,
          expr: `180 - ${known}`,
          steps: [`Angles on a straight line total 180${SYM.degree}`, `180 ${SYM.minus} ${known} = ${value}${SYM.degree}`],
          weight: value,
        })
      }
      const a = rng.int(20, 90)
      const b = rng.int(20, Math.max(21, 160 - a))
      const value = 180 - a - b
      return makeProblem({
        topic: 'geometry',
        question: `A triangle has angles ${a}${SYM.degree} and ${b}${SYM.degree}. Find the third angle.`,
        prompt: `Third angle: ${a}${SYM.degree}, ${b}${SYM.degree}`,
        answer: `${value}${SYM.degree}`,
        value,
        expr: `180 - ${a} - ${b}`,
        steps: [`Angles in a triangle total 180${SYM.degree}`, `180 ${SYM.minus} ${a} ${SYM.minus} ${b} = ${value}${SYM.degree}`],
        weight: value,
      })
    }
  }
}

function algebra(rng: Rng, p: DifficultyProfile): MathProblem {
  const forms = ['x+a=b', 'x-a=b', 'ax=b']
  if (p.score >= 66) forms.push('ax+b=c', 'x/a=b')
  if (p.score >= 76) forms.push('ax+b=cx+d')
  const form = rng.pick(forms)
  const cap = clamp(Math.round(p.numberRange[1] / 20), 8, 40)
  const x = rng.int(2, cap)

  switch (form) {
    case 'x+a=b': {
      const a = rng.int(1, cap)
      const b = x + a
      return makeProblem({
        topic: 'algebra',
        question: `Solve: x + ${a} = ${b}`,
        prompt: `x + ${a} = ${b}`,
        answer: `x = ${x}`,
        value: x,
        expr: `${b} - ${a}`,
        steps: [`Subtract ${a} from both sides`, `x = ${b} ${SYM.minus} ${a} = ${x}`],
        weight: b,
      })
    }
    case 'x-a=b': {
      const a = rng.int(1, cap)
      const b = x - a
      if (!p.allowNegatives && b < 0) return algebra(rng, p)
      return makeProblem({
        topic: 'algebra',
        question: `Solve: x ${SYM.minus} ${a} = ${b}`,
        prompt: `x ${SYM.minus} ${a} = ${b}`,
        answer: `x = ${x}`,
        value: x,
        expr: `${b} + ${a}`,
        steps: [`Add ${a} to both sides`, `x = ${b} + ${a} = ${x}`],
        weight: Math.abs(b),
      })
    }
    case 'ax=b': {
      const a = rng.int(2, 12)
      const b = a * x
      return makeProblem({
        topic: 'algebra',
        question: `Solve: ${a}x = ${b}`,
        prompt: `${a}x = ${b}`,
        answer: `x = ${x}`,
        value: x,
        expr: `${b} / ${a}`,
        steps: [`Divide both sides by ${a}`, `x = ${b} ${SYM.divide} ${a} = ${x}`],
        weight: b,
      })
    }
    case 'x/a=b': {
      const a = rng.int(2, 9)
      const b = x
      const numerator = a * b
      return makeProblem({
        topic: 'algebra',
        question: `Solve: x ${SYM.divide} ${a} = ${b}`,
        prompt: `x ${SYM.divide} ${a} = ${b}`,
        answer: `x = ${numerator}`,
        value: numerator,
        expr: `${b} * ${a}`,
        steps: [`Multiply both sides by ${a}`, `x = ${b} ${SYM.times} ${a} = ${numerator}`],
        weight: numerator,
      })
    }
    case 'ax+b=cx+d': {
      const a = rng.int(3, 9)
      const c = rng.int(1, a - 1)
      const b = rng.int(1, 20)
      const d = (a - c) * x + b
      return makeProblem({
        topic: 'algebra',
        question: `Solve: ${a}x + ${b} = ${c}x + ${d}`,
        prompt: `${a}x + ${b} = ${c}x + ${d}`,
        answer: `x = ${x}`,
        value: x,
        expr: `(${d} - ${b}) / (${a} - ${c})`,
        steps: [`Move the x terms together: ${a - c}x = ${d - b}`, `x = ${d - b} ${SYM.divide} ${a - c} = ${x}`],
        weight: d,
      })
    }
    default: {
      const a = rng.int(2, 9)
      const b = rng.int(1, cap)
      const c = a * x + b
      return makeProblem({
        topic: 'algebra',
        question: `Solve: ${a}x + ${b} = ${c}`,
        prompt: `${a}x + ${b} = ${c}`,
        answer: `x = ${x}`,
        value: x,
        expr: `(${c} - ${b}) / ${a}`,
        steps: [`Subtract ${b}: ${a}x = ${c - b}`, `Divide by ${a}: x = ${x}`],
        weight: c,
      })
    }
  }
}

/* ------------------------------------------------------------------ *
 * Sequences
 * ------------------------------------------------------------------ */

export interface SequenceSpec {
  kind: string
  terms: number[]
  /** Index of the term that is hidden. */
  hiddenIndex: number
  rule: string
  expr: string
}

export function buildSequence(rng: Rng, p: DifficultyProfile): SequenceSpec {
  const kind = rng.pick(p.sequenceKinds)
  const length = clamp(Math.round(4 + p.score / 25), 4, 7)
  const terms: number[] = []
  let rule = ''
  let expr = ''

  switch (kind) {
    case 'geometric': {
      const r = rng.pick([2, 2, 3, 3, 4, 5, 10])
      const a0 = rng.int(1, 6)
      for (let i = 0; i < length; i++) terms.push(a0 * r ** i)
      rule = `multiply by ${r}`
      break
    }
    case 'skip-count': {
      const d = rng.pick([2, 5, 10, 25, 50, 100])
      const a0 = rng.int(0, 5) * d
      for (let i = 0; i < length; i++) terms.push(a0 + i * d)
      rule = `count on in ${d}s`
      break
    }
    case 'alternating': {
      const up = rng.int(3, 12)
      const down = rng.int(1, up - 1)
      let v = rng.int(5, 30)
      for (let i = 0; i < length; i++) {
        terms.push(v)
        v += i % 2 === 0 ? up : -down
      }
      rule = `+${up}, ${SYM.minus}${down}, repeating`
      break
    }
    case 'squares': {
      const start = rng.int(1, 6)
      for (let i = 0; i < length; i++) terms.push((start + i) ** 2)
      rule = 'square numbers'
      break
    }
    case 'cubes': {
      const start = rng.int(1, 4)
      for (let i = 0; i < length; i++) terms.push((start + i) ** 3)
      rule = 'cube numbers'
      break
    }
    case 'triangular': {
      const start = rng.int(1, 5)
      for (let i = 0; i < length; i++) {
        const n = start + i
        terms.push((n * (n + 1)) / 2)
      }
      rule = 'triangular numbers'
      break
    }
    case 'fibonacci': {
      let a = rng.int(1, 5)
      let b = a + rng.int(1, 5)
      for (let i = 0; i < length; i++) {
        terms.push(a)
        ;[a, b] = [b, a + b]
      }
      rule = 'add the two previous terms'
      break
    }
    case 'double-step': {
      let v = rng.int(1, 9)
      let d = rng.int(1, 5)
      for (let i = 0; i < length; i++) {
        terms.push(v)
        v += d
        d += rng.chance(0.5) ? 1 : 2
      }
      // The step itself grows, so rebuild with a fixed growth for a stateable rule.
      terms.length = 0
      v = rng.int(1, 9)
      d = rng.int(1, 5)
      const growth = rng.int(1, 3)
      for (let i = 0; i < length; i++) {
        terms.push(v)
        v += d
        d += growth
      }
      rule = `the gap grows by ${growth} each time`
      break
    }
    case 'quadratic': {
      const a = rng.int(1, 3)
      const b = rng.int(0, 4)
      for (let i = 1; i <= length; i++) terms.push(a * i * i + b * i)
      rule = `${a}n${SYM.squared}${b ? ` + ${b}n` : ''}`
      break
    }
    case 'primes': {
      const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]
      const start = rng.int(0, primes.length - length - 1)
      for (let i = 0; i < length; i++) terms.push(primes[start + i])
      rule = 'prime numbers'
      break
    }
    case 'recursive': {
      const m = rng.int(2, 3)
      const c = rng.int(1, 5)
      let v = rng.int(1, 4)
      for (let i = 0; i < length; i++) {
        terms.push(v)
        v = m * v + c
      }
      rule = `multiply by ${m} then add ${c}`
      break
    }
    default: {
      const d = rng.int(2, clamp(Math.round(p.numberRange[1] / 12), 3, 25))
      const a0 = rng.int(1, clamp(p.numberRange[1] / 3, 5, 60))
      const descending = p.allowNegatives && rng.chance(0.3)
      for (let i = 0; i < length; i++) terms.push(descending ? a0 - i * d : a0 + i * d)
      rule = descending ? `subtract ${d}` : `add ${d}`
    }
  }

  // Hide the last term most of the time, occasionally an interior one.
  const hiddenIndex = rng.chance(0.75) ? terms.length - 1 : rng.int(1, terms.length - 2)
  expr = String(terms[hiddenIndex])
  return { kind, terms, hiddenIndex, rule, expr }
}

function sequences(rng: Rng, p: DifficultyProfile): MathProblem {
  const spec = buildSequence(rng, p)
  const shown = spec.terms.map((t, i) => (i === spec.hiddenIndex ? '__' : String(t)))
  const answer = spec.terms[spec.hiddenIndex]
  // Independent check: rebuild the missing term from its neighbours where the
  // rule is linear, otherwise state it directly.
  const prev = spec.terms[spec.hiddenIndex - 1]
  const next = spec.terms[spec.hiddenIndex + 1]
  const expr =
    prev !== undefined && next !== undefined && next - answer === answer - prev
      ? `(${prev} + ${next}) / 2`
      : String(answer)
  return makeProblem({
    topic: 'sequences',
    question: `${shown.join(', ')}   What is the missing term?`,
    prompt: shown.join(', '),
    answer: String(answer),
    value: answer,
    expr,
    steps: [`Rule: ${spec.rule}`, `Missing term = ${answer}`],
    weight: Math.abs(answer),
  })
}

/* ------------------------------------------------------------------ *
 * Word problems
 * ------------------------------------------------------------------ */

const NAMES = [
  'Amina', 'Ben', 'Chloe', 'Dev', 'Elena', 'Farid', 'Grace', 'Hugo', 'Iris', 'Jonah',
  'Kaya', 'Liam', 'Maya', 'Noor', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara',
  'Uma', 'Victor', 'Wren', 'Yusuf', 'Zara',
]

const OBJECTS = [
  ['stickers', 'sticker'], ['marbles', 'marble'], ['pencils', 'pencil'], ['apples', 'apple'],
  ['books', 'book'], ['shells', 'shell'], ['cards', 'card'], ['cookies', 'cookie'],
  ['seeds', 'seed'], ['coins', 'coin'], ['beads', 'bead'], ['stamps', 'stamp'],
]

function wordProblems(rng: Rng, p: DifficultyProfile): MathProblem {
  const name = rng.pick(NAMES)
  const other = rng.pick(NAMES.filter((n) => n !== name))
  const [plural] = rng.pick(OBJECTS)
  const cap = clamp(Math.round(p.numberRange[1] / 4), 8, 200)
  const kind = rng.pick(
    p.score >= 50 ? ['share', 'groups', 'total', 'left', 'two-step', 'rate'] : ['total', 'left', 'share', 'groups'],
  )

  switch (kind) {
    case 'share': {
      const groups = rng.int(2, 9)
      const each = rng.int(2, Math.max(3, Math.round(cap / groups)))
      const total = groups * each
      return makeProblem({
        topic: 'word-problems',
        question: `${name} shares ${total} ${plural} equally between ${groups} friends. How many does each friend get?`,
        prompt: `${total} ${plural} shared by ${groups}`,
        answer: String(each),
        value: each,
        expr: `${total} / ${groups}`,
        steps: [`${total} ${SYM.divide} ${groups} = ${each}`],
        weight: total,
      })
    }
    case 'groups': {
      const groups = rng.int(2, 12)
      const each = rng.int(2, 12)
      return makeProblem({
        topic: 'word-problems',
        question: `There are ${groups} boxes with ${each} ${plural} in each. How many ${plural} altogether?`,
        prompt: `${groups} boxes ${SYM.times} ${each}`,
        answer: String(groups * each),
        value: groups * each,
        expr: `${groups} * ${each}`,
        steps: [`${groups} ${SYM.times} ${each} = ${groups * each}`],
        weight: groups * each,
      })
    }
    case 'left': {
      const start = rng.int(10, cap)
      const used = rng.int(1, start - 1)
      return makeProblem({
        topic: 'word-problems',
        question: `${name} had ${start} ${plural} and gave away ${used}. How many are left?`,
        prompt: `${start} ${SYM.minus} ${used}`,
        answer: String(start - used),
        value: start - used,
        expr: `${start} - ${used}`,
        steps: [`${start} ${SYM.minus} ${used} = ${start - used}`],
        weight: start,
      })
    }
    case 'two-step': {
      const packs = rng.int(2, 9)
      const perPack = rng.int(3, 12)
      const extra = rng.int(1, 20)
      const value = packs * perPack + extra
      return makeProblem({
        topic: 'word-problems',
        question: `${name} buys ${packs} packs of ${perPack} ${plural} and finds ${extra} more. How many ${plural} in total?`,
        prompt: `${packs} ${SYM.times} ${perPack} + ${extra}`,
        answer: String(value),
        value,
        expr: `${packs} * ${perPack} + ${extra}`,
        steps: [`${packs} ${SYM.times} ${perPack} = ${packs * perPack}`, `${packs * perPack} + ${extra} = ${value}`],
        weight: value,
      })
    }
    case 'rate': {
      const perHour = rng.int(3, 25)
      const hours = rng.int(2, 9)
      return makeProblem({
        topic: 'word-problems',
        question: `A machine makes ${perHour} ${plural} every hour. How many does it make in ${hours} hours?`,
        prompt: `${perHour}/hour ${SYM.times} ${hours} h`,
        answer: String(perHour * hours),
        value: perHour * hours,
        expr: `${perHour} * ${hours}`,
        steps: [`${perHour} ${SYM.times} ${hours} = ${perHour * hours}`],
        weight: perHour * hours,
      })
    }
    default: {
      const a = rng.int(5, cap)
      const b = rng.int(5, cap)
      return makeProblem({
        topic: 'word-problems',
        question: `${name} has ${a} ${plural} and ${other} has ${b}. How many do they have together?`,
        prompt: `${a} + ${b}`,
        answer: String(a + b),
        value: a + b,
        expr: `${a} + ${b}`,
        steps: [`${a} + ${b} = ${a + b}`],
        weight: a + b,
      })
    }
  }
}

/* ------------------------------------------------------------------ *
 * Dispatcher
 * ------------------------------------------------------------------ */

const GENERATORS: Record<string, (rng: Rng, p: DifficultyProfile) => MathProblem> = {
  addition,
  subtraction,
  multiplication,
  division,
  'mixed-operations': mixedOperations,
  'place-value': placeValue,
  rounding,
  fractions,
  decimals,
  percentages,
  integers,
  exponents,
  averages,
  measurement,
  geometry,
  algebra,
  sequences,
  'word-problems': wordProblems,
}

export function generateProblem(topic: MathTopic, rng: Rng, profile: DifficultyProfile): MathProblem {
  const fn = GENERATORS[topic] ?? addition
  return fn(rng, profile)
}

export interface ProblemSetOptions {
  /** Only keep problems whose answer is a non-negative integer (bingo, mazes). */
  integerAnswersOnly?: boolean
  /** Keep answers inside this closed interval. */
  answerRange?: [number, number]
  /** Reject duplicate answers as well as duplicate questions. */
  uniqueAnswers?: boolean
  /** Restrict to these topics instead of the config's. */
  topics?: MathTopic[]
  /** Cap on the printed question length, so it fits its cell. */
  maxQuestionLength?: number
}

/**
 * Produces `count` distinct problems honouring the config's topic selection.
 * Falls back to easier strands if the requested constraints are too tight so the
 * caller always receives a full set rather than a short one.
 */
export function generateProblemSet(
  count: number,
  ctx: GenContext,
  options: ProblemSetOptions = {},
): MathProblem[] {
  const { rng, profile, config } = ctx
  const topics = options.topics ?? resolveMathTopics(config.mathTopic, profile)
  const out: MathProblem[] = []
  const seenQuestions = new Set<string>()
  const seenAnswers = new Set<string>()

  const accepts = (p: MathProblem): boolean => {
    if (seenQuestions.has(p.question)) return false
    if (options.uniqueAnswers && seenAnswers.has(p.answer)) return false
    if (options.maxQuestionLength && p.question.length > options.maxQuestionLength) return false
    if (options.integerAnswersOnly) {
      if (p.value === null || !Number.isInteger(p.value) || p.value < 0) return false
      if (p.answer !== String(p.value)) return false
    }
    if (options.answerRange && p.value !== null) {
      const [lo, hi] = options.answerRange
      if (p.value < lo || p.value > hi) return false
    }
    return true
  }

  const maxAttempts = count * 60 + 400
  let attempts = 0
  while (out.length < count && attempts < maxAttempts) {
    attempts++
    // After a long struggle, widen to the simplest strands that satisfy the
    // constraints rather than returning an incomplete sheet.
    const pool = attempts > maxAttempts * 0.6
      ? (['addition', 'subtraction', 'multiplication'] as MathTopic[])
      : topics
    const problem = generateProblem(rng.pick(pool), rng, profile)
    if (!accepts(problem)) continue
    seenQuestions.add(problem.question)
    seenAnswers.add(problem.answer)
    out.push(problem)
  }

  return out
}

/**
 * Builds plausible wrong answers that sit near the correct one. Higher
 * `distractorTightness` produces answers that are harder to eliminate by eye.
 */
export function makeDistractors(
  problem: MathProblem,
  count: number,
  rng: Rng,
  profile: DifficultyProfile,
): string[] {
  const out = new Set<string>()
  const value = problem.value
  const tight = profile.distractorTightness

  if (value !== null && Number.isFinite(value)) {
    const target: number = value
    const spread = Math.max(1, Math.round(Math.abs(target) * (1 - tight) * 0.5) + 1)
    let guard = 0
    while (out.size < count && guard < count * 40) {
      guard++
      const offset = rng.int(1, spread + 2) * (rng.chance(0.5) ? 1 : -1)
      const candidate: number = target + offset
      if (candidate === target) continue
      if (!profile.allowNegatives && candidate < 0) continue
      const text = Number.isInteger(target) ? String(Math.round(candidate)) : fmtNumber(candidate, 2)
      if (text === problem.answer) continue
      out.add(text)
    }
  }

  // Non-numeric answers (fractions with units, "x = 4") get suffix-preserving twins.
  let guard = 0
  while (out.size < count && guard < 200) {
    guard++
    const m = /(-?\d+(?:\.\d+)?)/.exec(problem.answer)
    if (!m) break
    const base = Number(m[1])
    const candidate = base + rng.int(1, 6) * (rng.chance(0.5) ? 1 : -1)
    if (candidate === base) continue
    const text = problem.answer.replace(m[1], String(candidate))
    if (text !== problem.answer) out.add(text)
  }

  return Array.from(out).slice(0, count)
}
