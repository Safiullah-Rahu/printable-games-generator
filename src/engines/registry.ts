import { GENERATORS } from '../generators'
import type { GameCategory, GameGenerator } from '../types'

/**
 * Generator registry.
 *
 * The single place the app learns which games exist. Adding a game type means
 * writing one file and adding one line to src/generators/index.ts - no UI, no
 * pipeline and no PDF code changes. See docs/ADDING_GAMES.md.
 */

const BY_ID = new Map<string, GameGenerator<any>>(GENERATORS.map((g) => [g.id, g]))

export function getGenerator(id: string): GameGenerator<any> | undefined {
  return BY_ID.get(id)
}

export function requireGenerator(id: string): GameGenerator<any> {
  const g = BY_ID.get(id)
  if (!g) throw new Error(`No generator registered for "${id}"`)
  return g
}

export function listGenerators(): GameGenerator<any>[] {
  return GENERATORS
}

export const CATEGORY_LABELS: Record<GameCategory, string> = {
  math: 'Mathematics',
  literacy: 'Words & Literacy',
  puzzle: 'Puzzles & Logic',
  cards: 'Cards',
  board: 'Board Games',
  trivia: 'Quiz & Trivia',
}

export function generatorsByCategory(): Array<{ category: GameCategory; label: string; games: GameGenerator<any>[] }> {
  const order: GameCategory[] = ['math', 'literacy', 'puzzle', 'cards', 'board', 'trivia']
  return order
    .map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      games: GENERATORS.filter((g) => g.category === category),
    }))
    .filter((group) => group.games.length > 0)
}
