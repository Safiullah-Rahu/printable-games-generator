import { describe, expect, it } from 'vitest'
import { listGenerators } from '../src/engines/registry'
import { buildGame } from '../src/engines/pipeline'
import { validateDoc } from '../src/engines/validation'
import { defaultConfigFor } from '../src/engines/config'
import { COORDINATE_SHAPES } from '../src/generators/coordinateGrid'
import type { Difficulty, Grade, Subject, ThemeId } from '../src/types'

/**
 * Cross-generator smoke tests.
 *
 * Every generator is run across a spread of grades, difficulties, page sizes and
 * themes. A generator that throws, produces an invalid game, or lays out
 * something off the page fails here rather than in front of a teacher.
 */

const GRADES: Grade[] = ['K', '2', '4', '6', '8', '10', 'adult']
const DIFFICULTIES: Difficulty[] = ['very-easy', 'easy', 'medium', 'hard', 'very-hard']
const SUBJECTS: Subject[] = ['mathematics', 'english', 'science', 'geography', 'history', 'general-knowledge', 'logic', 'vocabulary']
const THEMES: ThemeId[] = ['minimal', 'classroom', 'space', 'ocean', 'fantasy']

describe('generator registry', () => {
  it('registers at least ten generators with unique ids', () => {
    const generators = listGenerators()
    expect(generators.length).toBeGreaterThanOrEqual(10)
    const ids = generators.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every generator the full contract', () => {
    for (const g of listGenerators()) {
      expect(typeof g.generate, g.id).toBe('function')
      expect(typeof g.validate, g.id).toBe('function')
      expect(typeof g.generateAnswerKey, g.id).toBe('function')
      expect(typeof g.layout, g.id).toBe('function')
      expect(typeof g.meta, g.id).toBe('function')
      expect(g.name.length, g.id).toBeGreaterThan(0)
      expect(g.subjects.length, g.id).toBeGreaterThan(0)
      expect(g.orientations.length, g.id).toBeGreaterThan(0)
    }
  })
})

describe.each(listGenerators().map((g) => [g.id, g] as const))('%s', (id, generator) => {
  it('produces a valid game at its defaults', () => {
    const game = buildGame(defaultConfigFor(id, 'seed-default'))
    expect(game.validation.ok, JSON.stringify(game.validation.issues)).toBe(true)
    expect(game.doc.pages.length).toBeGreaterThan(0)
    expect(game.meta.title.length).toBeGreaterThan(0)
    expect(game.meta.instructions.length).toBeGreaterThan(0)
  })

  it('lays out cleanly across grades and difficulties', () => {
    for (const grade of GRADES) {
      for (const difficulty of DIFFICULTIES) {
        const config = { ...defaultConfigFor(id, `g-${grade}-${difficulty}`), grade, difficulty }
        const game = buildGame(config)
        const docResult = validateDoc(game.doc)
        const errors = docResult.issues.filter((i) => i.severity === 'error')
        expect(errors, `${id} @ ${grade}/${difficulty}: ${JSON.stringify(errors)}`).toHaveLength(0)
      }
    }
  })

  it('handles every supported subject', () => {
    for (const subject of SUBJECTS) {
      if (!generator.subjects.includes(subject)) continue
      const config = { ...defaultConfigFor(id, `s-${subject}`), subject }
      const game = buildGame(config)
      expect(game.validation.ok, `${id} @ ${subject}`).toBe(true)
    }
  })

  it('handles both page sizes and orientations', () => {
    for (const pageSize of ['a4', 'letter'] as const) {
      for (const orientation of generator.orientations) {
        const config = { ...defaultConfigFor(id, `p-${pageSize}-${orientation}`), pageSize, orientation }
        const game = buildGame(config)
        const errors = validateDoc(game.doc).issues.filter((i) => i.severity === 'error')
        expect(errors, `${id} @ ${pageSize}/${orientation}: ${JSON.stringify(errors)}`).toHaveLength(0)
      }
    }
  })

  it('handles every theme and the ink-saver variant', () => {
    for (const theme of THEMES) {
      for (const inkSaver of [false, true]) {
        const config = { ...defaultConfigFor(id, `t-${theme}-${inkSaver}`), theme, inkSaver }
        const game = buildGame(config)
        expect(game.doc.pages.length, `${id} @ ${theme}`).toBeGreaterThan(0)
      }
    }
  })

  it('honours the item-count range', () => {
    if (!generator.itemRange) return
    const [min, max] = generator.itemRange
    for (const itemCount of [min, Math.round((min + max) / 2), max]) {
      const config = { ...defaultConfigFor(id, `i-${itemCount}`), itemCount }
      const game = buildGame(config)
      expect(game.validation.ok, `${id} @ ${itemCount} items`).toBe(true)
    }
  })

  it('is reproducible from its seed, and different across seeds', () => {
    const a = buildGame(defaultConfigFor(id, 'repro-seed'))
    const b = buildGame(defaultConfigFor(id, 'repro-seed'))
    const c = buildGame(defaultConfigFor(id, 'different-seed'))

    expect(JSON.stringify(a.doc)).toBe(JSON.stringify(b.doc))
    // Not every game type can differ on every seed, but the payload should.
    expect(JSON.stringify(a.payload)).not.toBe(JSON.stringify(c.payload))
  })

  it('omits the answer key when asked to', () => {
    const withKey = buildGame({ ...defaultConfigFor(id, 'key-on'), includeAnswerKey: true })
    const withoutKey = buildGame({ ...defaultConfigFor(id, 'key-on'), includeAnswerKey: false })
    const keyPages = (g: typeof withKey): number => g.doc.pages.filter((p) => p.role === 'answerKey').length

    expect(keyPages(withoutKey)).toBe(0)
    expect(keyPages(withKey)).toBeGreaterThanOrEqual(keyPages(withoutKey))
  })

  it('produces answer-key entries or a solution page', () => {
    const game = buildGame({ ...defaultConfigFor(id, 'key-content'), includeAnswerKey: true })
    const hasEntries = game.answerKey.entries.length > 0
    const hasSolutionPage = game.doc.pages.some((p) => p.role === 'answerKey')
    expect(hasEntries || hasSolutionPage, `${id} produced no answers at all`).toBe(true)
  })
})

describe('coordinate shape catalogue', () => {
  it('every shape is a closed integer polyline inside the printable grid', () => {
    expect(COORDINATE_SHAPES.length).toBeGreaterThanOrEqual(6)
    for (const shape of COORDINATE_SHAPES) {
      expect(shape.points.length, shape.name).toBeGreaterThanOrEqual(4)
      for (const [x, y] of shape.points) {
        expect(Number.isInteger(x), `${shape.name} x=${x}`).toBe(true)
        expect(Number.isInteger(y), `${shape.name} y=${y}`).toBe(true)
        expect(x, shape.name).toBeGreaterThanOrEqual(0)
        expect(x, shape.name).toBeLessThanOrEqual(12)
        expect(y, shape.name).toBeGreaterThanOrEqual(0)
        expect(y, shape.name).toBeLessThanOrEqual(12)
      }
      // Consecutive duplicates would draw a zero-length segment.
      const keys = shape.points.map((p) => p.join(','))
      expect(new Set(keys).size, `${shape.name} repeats a point`).toBe(keys.length)
    }
  })
})
