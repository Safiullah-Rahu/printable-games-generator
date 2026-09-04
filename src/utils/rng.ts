/**
 * Deterministic pseudo-random number generator.
 *
 * Every generator draws exclusively from an Rng seeded by the user-visible seed
 * string, so "same seed + same config => byte-identical game" holds. That is what
 * makes the History panel able to re-open a game without storing its full page
 * geometry, and what makes the unit tests reproducible.
 *
 * Algorithm: mulberry32 - a 32-bit state PRNG with a period of 2^32, excellent
 * avalanche for a generator this small, and no dependencies.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number
  /** Uniform float in [min, max). */
  float(min: number, max: number): number
  /** True with probability p. */
  chance(p: number): boolean
  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T
  /** Picks `count` distinct elements (or all of them when count exceeds length). */
  sample<T>(items: readonly T[], count: number): T[]
  /** Returns a shuffled copy; never mutates the input. */
  shuffle<T>(items: readonly T[]): T[]
  /** Picks by relative weight. `weights[i]` corresponds to `items[i]`. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T
  /** Forks an independent stream, so adding a feature does not shift later draws. */
  fork(label: string): Rng
}

/** FNV-1a: maps an arbitrary seed string onto a 32-bit integer. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function createRng(seed: string | number): Rng {
  let state = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0
  // A zero state is a fixed point for some PRNGs; nudge it off zero.
  if (state === 0) state = 0x9e3779b9

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const rng: Rng = {
    next,
    int: (min, max) => {
      if (max < min) [min, max] = [max, min]
      return Math.floor(next() * (max - min + 1)) + min
    },
    float: (min, max) => next() * (max - min) + min,
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick called with an empty array')
      return items[Math.floor(next() * items.length)]
    },
    sample: (items, count) => rng.shuffle(items).slice(0, Math.max(0, Math.min(count, items.length))),
    shuffle: (items) => {
      const out = items.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
      }
      return out
    },
    weighted: (items, weights) => {
      const total = weights.reduce((a, b) => a + Math.max(0, b), 0)
      if (total <= 0) return rng.pick(items)
      let roll = next() * total
      for (let i = 0; i < items.length; i++) {
        roll -= Math.max(0, weights[i] ?? 0)
        if (roll <= 0) return items[i]
      }
      return items[items.length - 1]
    },
    fork: (label) => createRng((state ^ hashSeed(label)) >>> 0),
  }

  return rng
}

const SEED_WORDS = [
  'amber', 'brisk', 'cobalt', 'dusk', 'ember', 'flint', 'glade', 'harbor',
  'indigo', 'jasper', 'kelp', 'lumen', 'marble', 'nimbus', 'onyx', 'pebble',
  'quartz', 'ripple', 'slate', 'timber', 'umber', 'vellum', 'willow', 'zenith',
  'orbit', 'meadow', 'canyon', 'lantern', 'compass', 'thistle', 'beacon', 'coral',
]

/** Human-friendly seed such as "amber-orbit-4821". */
export function randomSeed(): string {
  const r = Math.random()
  const a = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]
  const b = SEED_WORDS[Math.floor(Math.random() * SEED_WORDS.length)]
  const n = Math.floor(r * 9000) + 1000
  return `${a}-${b}-${n}`
}
