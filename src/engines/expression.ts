/**
 * A tiny, dependency-free arithmetic parser used by the validation engine.
 *
 * WHY THIS EXISTS: every math generator computes its answer *by construction*
 * (it picks a and b, then stores a+b). That means a bug in the generator would
 * produce a question and a matching-but-wrong answer, and nothing would notice.
 *
 * So each problem also carries a plain expression string. The validator parses
 * that string with this evaluator - a completely separate code path - and checks
 * the result against the stored answer. A mismatch means the sheet is broken and
 * the pipeline regenerates it. This is the "programmatically verify every
 * generated mathematical answer" requirement, implemented as a real second
 * opinion rather than a restatement of the first.
 *
 * Grammar (standard precedence, right-associative exponentiation):
 *   expr    := term (('+' | '-') term)*
 *   term    := power (('*' | '/' | '%') power)*
 *   power   := unary ('^' power)?
 *   unary   := ('-' | '+')? primary
 *   primary := number | '(' expr ')' | func '(' expr ')'
 *   func    := sqrt | abs | round | floor | ceil
 */

export class ExpressionError extends Error {}

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
}

interface ParserState {
  src: string
  pos: number
}

function skipSpace(s: ParserState): void {
  while (s.pos < s.src.length && /\s/.test(s.src[s.pos])) s.pos++
}

function peek(s: ParserState): string {
  skipSpace(s)
  return s.pos < s.src.length ? s.src[s.pos] : ''
}

function eat(s: ParserState, ch: string): boolean {
  if (peek(s) === ch) {
    s.pos++
    return true
  }
  return false
}

function parseExpr(s: ParserState): number {
  let value = parseTerm(s)
  for (;;) {
    if (eat(s, '+')) value += parseTerm(s)
    else if (eat(s, '-')) value -= parseTerm(s)
    else return value
  }
}

function parseTerm(s: ParserState): number {
  let value = parsePower(s)
  for (;;) {
    if (eat(s, '*')) value *= parsePower(s)
    else if (eat(s, '/')) {
      const d = parsePower(s)
      if (d === 0) throw new ExpressionError('division by zero')
      value /= d
    } else if (eat(s, '%')) {
      const d = parsePower(s)
      if (d === 0) throw new ExpressionError('modulo by zero')
      value %= d
    } else return value
  }
}

function parsePower(s: ParserState): number {
  const base = parseUnary(s)
  if (eat(s, '^')) return base ** parsePower(s)
  return base
}

function parseUnary(s: ParserState): number {
  if (eat(s, '-')) return -parseUnary(s)
  if (eat(s, '+')) return parseUnary(s)
  return parsePrimary(s)
}

function parsePrimary(s: ParserState): number {
  skipSpace(s)
  if (eat(s, '(')) {
    const value = parseExpr(s)
    if (!eat(s, ')')) throw new ExpressionError('unbalanced parenthesis')
    return value
  }

  const nameMatch = /^[a-z]+/i.exec(s.src.slice(s.pos))
  if (nameMatch) {
    const name = nameMatch[0].toLowerCase()
    const fn = FUNCTIONS[name]
    if (!fn) throw new ExpressionError(`unknown function "${name}"`)
    s.pos += nameMatch[0].length
    if (!eat(s, '(')) throw new ExpressionError(`"${name}" must be followed by (`)
    const arg = parseExpr(s)
    if (!eat(s, ')')) throw new ExpressionError('unbalanced parenthesis')
    return fn(arg)
  }

  const numMatch = /^\d+(\.\d+)?/.exec(s.src.slice(s.pos))
  if (!numMatch) {
    throw new ExpressionError(`unexpected "${s.src[s.pos] ?? 'end of input'}" at ${s.pos}`)
  }
  s.pos += numMatch[0].length
  return Number(numMatch[0])
}

/** Evaluates an arithmetic expression. Throws ExpressionError on bad input. */
export function evalExpr(source: string): number {
  // Normalise the print symbols the generators use back into ASCII operators.
  const normalised = source
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')

  const state: ParserState = { src: normalised, pos: 0 }
  const value = parseExpr(state)
  skipSpace(state)
  if (state.pos < state.src.length) {
    throw new ExpressionError(`trailing input at ${state.pos}: "${state.src.slice(state.pos)}"`)
  }
  if (!Number.isFinite(value)) throw new ExpressionError('result is not finite')
  return value
}

/** Non-throwing variant used inside validators. */
export function tryEvalExpr(source: string): { ok: true; value: number } | { ok: false; error: string } {
  try {
    return { ok: true, value: evalExpr(source) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
