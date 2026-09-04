/** Small shared helpers used across generators and engines. */

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function range(n: number, start = 0): number[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => i + start)
}

export function unique<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items))
}

export function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const k = key(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a || 1
}

/** Rounds to `places` decimals without float dust (0.1+0.2 -> 0.3, not 0.30000000000000004). */
export function roundTo(value: number, places = 2): number {
  const f = 10 ** places
  return Math.round((value + Number.EPSILON) * f) / f
}

/** Formats a number for print: trims trailing zeros, keeps a sensible precision. */
export function fmtNumber(value: number, maxPlaces = 2): string {
  if (Number.isInteger(value)) return String(value)
  return String(roundTo(value, maxPlaces))
}

export function nowId(prefix = 'g'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Slug safe for filenames on Windows, macOS and Linux. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'game'
}
