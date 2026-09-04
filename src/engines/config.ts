import type { GameConfig } from '../types'
import { clamp } from '../utils/misc'
import { randomSeed } from '../utils/rng'
import { getGenerator, listGenerators } from './registry'

/**
 * Configuration defaults and normalisation.
 *
 * `normalizeConfig` is the guard rail between the UI and the generators: it
 * clamps the item count into the range the chosen generator can actually
 * handle, swaps to a supported subject and orientation, and keeps play length
 * sane. Generators can then trust their config instead of re-validating it.
 */

export const BASE_CONFIG: GameConfig = {
  gameType: 'word-search',
  seed: 'starter-seed-1000',
  difficulty: 'medium',
  grade: '4',
  subject: 'mathematics',
  mathTopic: 'auto',
  players: '1',
  lengthMinutes: 15,
  itemCount: 12,
  theme: 'classroom',
  pageSize: 'a4',
  orientation: 'portrait',
  includeAnswerKey: true,
  includeInstructions: true,
  cutLines: true,
  inkSaver: false,
  nameLine: true,
}

export const LENGTH_OPTIONS = [5, 10, 15, 20, 30, 45, 60]

export function defaultConfigFor(gameType: string, seed?: string): GameConfig {
  const generator = getGenerator(gameType)
  const merged: GameConfig = {
    ...BASE_CONFIG,
    gameType,
    seed: seed ?? randomSeed(),
    ...(generator?.defaults ?? {}),
  }
  return normalizeConfig(merged)
}

/** Clamps a config into what the selected generator supports. */
export function normalizeConfig(config: GameConfig): GameConfig {
  const generator = getGenerator(config.gameType) ?? listGenerators()[0]
  const next: GameConfig = { ...config, gameType: generator.id }

  if (generator.itemRange) {
    const [min, max] = generator.itemRange
    next.itemCount = clamp(Math.round(next.itemCount), min, max)
  }

  if (!generator.subjects.includes(next.subject)) {
    next.subject = generator.subjects[0]
  }

  if (!generator.orientations.includes(next.orientation)) {
    next.orientation = generator.orientations[0]
  }

  next.lengthMinutes = clamp(Math.round(next.lengthMinutes), 3, 120)
  if (!next.seed.trim()) next.seed = randomSeed()

  return next
}

/**
 * "Quick start" presets: the named games from the brief, expressed as a
 * generator plus a configuration. They exist so a user can pick
 * "Multiplication Game" without first having to learn that it is Quiz Cards
 * with a maths topic applied.
 */
export interface Preset {
  id: string
  label: string
  description: string
  config: Partial<GameConfig> & { gameType: string }
}

export const PRESETS: Preset[] = [
  {
    id: 'addition-race',
    label: 'Addition & Subtraction Game',
    description: 'Flash cards drilling addition and subtraction facts.',
    config: { gameType: 'flash-cards', subject: 'mathematics', mathTopic: 'addition', grade: '2', difficulty: 'easy', itemCount: 24 },
  },
  {
    id: 'multiplication-game',
    label: 'Multiplication Game',
    description: 'Times-table bingo for a whole class.',
    config: { gameType: 'math-bingo', subject: 'mathematics', mathTopic: 'multiplication', grade: '4', difficulty: 'medium', players: 'classroom' },
  },
  {
    id: 'division-game',
    label: 'Division Game',
    description: 'Match each division to its answer.',
    config: { gameType: 'equation-matching', subject: 'mathematics', mathTopic: 'division', grade: '4', itemCount: 12 },
  },
  {
    id: 'fraction-game',
    label: 'Fraction Game',
    description: 'Quiz cards on adding, comparing and simplifying fractions.',
    config: { gameType: 'quiz-cards', subject: 'mathematics', mathTopic: 'fractions', grade: '5', difficulty: 'medium', itemCount: 18 },
  },
  {
    id: 'decimal-game',
    label: 'Decimal Game',
    description: 'Memory pairs matching decimals to their values.',
    config: { gameType: 'memory-cards', subject: 'mathematics', mathTopic: 'decimals', grade: '5', itemCount: 12 },
  },
  {
    id: 'geometry-game',
    label: 'Geometry Game',
    description: 'Area, perimeter and angle problems along a maze route.',
    config: { gameType: 'math-maze', subject: 'mathematics', mathTopic: 'geometry', grade: '6', difficulty: 'medium' },
  },
  {
    id: 'pattern-game',
    label: 'Pattern Game',
    description: 'Spot the rule and fill the gaps in each sequence.',
    config: { gameType: 'sequence-puzzle', subject: 'mathematics', mathTopic: 'sequences', grade: '4', itemCount: 12 },
  },
  {
    id: 'roll-and-move',
    label: 'Roll-and-Move Game',
    description: 'A full board game with question cards and a score sheet.',
    config: { gameType: 'board-game', subject: 'general-knowledge', grade: '5', players: '3-4', lengthMinutes: 30 },
  },
  {
    id: 'spelling-search',
    label: 'Spelling Word Search',
    description: 'Tricky spellings hidden in a themed letter grid.',
    config: { gameType: 'word-search', subject: 'english', grade: '5', theme: 'fun', itemCount: 16 },
  },
  {
    id: 'science-crossword',
    label: 'Science Crossword',
    description: 'Interlocking science vocabulary with clues.',
    config: { gameType: 'crossword', subject: 'science', grade: '6', itemCount: 14 },
  },
  {
    id: 'capitals-quiz',
    label: 'Capital Cities Trivia',
    description: 'Team quiz night on world capitals and landmarks.',
    config: { gameType: 'trivia-game', subject: 'geography', grade: '7', players: '5+', itemCount: 24 },
  },
  {
    id: 'brain-teaser',
    label: 'Logic Brain Teaser',
    description: 'Grid deduction puzzle with a single provable answer.',
    config: { gameType: 'logic-puzzle', subject: 'logic', grade: '7', difficulty: 'medium' },
  },
]

export function applyPreset(current: GameConfig, preset: Preset): GameConfig {
  return normalizeConfig({
    ...current,
    ...preset.config,
    seed: randomSeed(),
  })
}
