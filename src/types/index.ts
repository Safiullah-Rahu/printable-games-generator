import type { PrintDoc } from './print'
import type { Rng } from '../utils/rng'
import type { ContentPack } from '../ai/types'

export * from './print'

/* ------------------------------------------------------------------ *
 * Configuration vocabulary
 * ------------------------------------------------------------------ */

export type Difficulty = 'very-easy' | 'easy' | 'medium' | 'hard' | 'very-hard'

export const DIFFICULTIES: ReadonlyArray<{ id: Difficulty; label: string }> = [
  { id: 'very-easy', label: 'Very Easy' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'very-hard', label: 'Very Hard' },
]

export type Grade =
  | 'K' | '1' | '2' | '3' | '4' | '5'
  | '6' | '7' | '8' | '9' | '10' | 'adult'

export const GRADES: ReadonlyArray<{ id: Grade; label: string; age: string }> = [
  { id: 'K', label: 'Kindergarten', age: '5-6' },
  { id: '1', label: 'Grade 1', age: '6-7' },
  { id: '2', label: 'Grade 2', age: '7-8' },
  { id: '3', label: 'Grade 3', age: '8-9' },
  { id: '4', label: 'Grade 4', age: '9-10' },
  { id: '5', label: 'Grade 5', age: '10-11' },
  { id: '6', label: 'Grade 6', age: '11-12' },
  { id: '7', label: 'Grade 7', age: '12-13' },
  { id: '8', label: 'Grade 8', age: '13-14' },
  { id: '9', label: 'Grade 9', age: '14-15' },
  { id: '10', label: 'Grade 10', age: '15-16' },
  { id: 'adult', label: 'Adult', age: '16+' },
]

export type Subject =
  | 'mathematics' | 'english' | 'science' | 'geography'
  | 'history' | 'general-knowledge' | 'logic' | 'vocabulary'

export const SUBJECTS: ReadonlyArray<{ id: Subject; label: string }> = [
  { id: 'mathematics', label: 'Mathematics' },
  { id: 'english', label: 'English' },
  { id: 'science', label: 'Science' },
  { id: 'geography', label: 'Geography' },
  { id: 'history', label: 'History' },
  { id: 'general-knowledge', label: 'General Knowledge' },
  { id: 'logic', label: 'Logic' },
  { id: 'vocabulary', label: 'Vocabulary' },
]

/** Fine-grained maths strand. `auto` lets the difficulty engine choose. */
export type MathTopic =
  | 'auto' | 'addition' | 'subtraction' | 'multiplication' | 'division'
  | 'mixed-operations' | 'fractions' | 'decimals' | 'percentages'
  | 'geometry' | 'algebra' | 'sequences' | 'measurement' | 'word-problems'
  | 'place-value' | 'rounding' | 'averages' | 'exponents' | 'integers'

export const MATH_TOPICS: ReadonlyArray<{ id: MathTopic; label: string }> = [
  { id: 'auto', label: 'Auto (match grade)' },
  { id: 'addition', label: 'Addition' },
  { id: 'subtraction', label: 'Subtraction' },
  { id: 'multiplication', label: 'Multiplication' },
  { id: 'division', label: 'Division' },
  { id: 'mixed-operations', label: 'Mixed Operations' },
  { id: 'place-value', label: 'Place Value' },
  { id: 'rounding', label: 'Rounding' },
  { id: 'fractions', label: 'Fractions' },
  { id: 'decimals', label: 'Decimals' },
  { id: 'percentages', label: 'Percentages' },
  { id: 'integers', label: 'Integers' },
  { id: 'exponents', label: 'Exponents & Roots' },
  { id: 'averages', label: 'Averages' },
  { id: 'measurement', label: 'Measurement' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'algebra', label: 'Algebra' },
  { id: 'sequences', label: 'Sequences & Patterns' },
  { id: 'word-problems', label: 'Word Problems' },
]

export type PlayersOption = '1' | '2' | '3-4' | '5+' | 'classroom'

export const PLAYER_OPTIONS: ReadonlyArray<{ id: PlayersOption; label: string; count: number }> = [
  { id: '1', label: '1 player (solo)', count: 1 },
  { id: '2', label: '2 players', count: 2 },
  { id: '3-4', label: '3-4 players', count: 4 },
  { id: '5+', label: '5+ players', count: 6 },
  { id: 'classroom', label: 'Classroom (30)', count: 30 },
]

export type ThemeId =
  | 'minimal' | 'classroom' | 'fun' | 'space' | 'adventure'
  | 'animals' | 'ocean' | 'fantasy' | 'sports' | 'seasonal'

export type PageSizeId = 'a4' | 'letter'
export type Orientation = 'portrait' | 'landscape'

/* ------------------------------------------------------------------ *
 * The configuration object every generator receives
 * ------------------------------------------------------------------ */

export interface GameConfig {
  gameType: string
  /** Human-typeable seed string; identical seed + config produces an identical game. */
  seed: string
  difficulty: Difficulty
  grade: Grade
  subject: Subject
  mathTopic: MathTopic
  players: PlayersOption
  /** Target play time in minutes. Influences item counts and board length. */
  lengthMinutes: number
  itemCount: number
  theme: ThemeId
  pageSize: PageSizeId
  orientation: Orientation
  includeAnswerKey: boolean
  includeInstructions: boolean
  cutLines: boolean
  /** Strip heavy fills so the sheet costs less to print. */
  inkSaver: boolean
  /** Print a "Name / Date" rule under the header. */
  nameLine: boolean
  /** Override the auto-generated title. */
  customTitle?: string
  /** Free-text line under the title (e.g. class name). */
  customSubtitle?: string
}

/* ------------------------------------------------------------------ *
 * Generator contract
 * ------------------------------------------------------------------ */

export interface ValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

export interface AnswerKeyEntry {
  label: string
  answer: string
  note?: string
}

export interface AnswerKey {
  /** Simple numbered list; rendered as columns on the key page. */
  entries: AnswerKeyEntry[]
  /** Free-form notes printed above the list. */
  notes?: string[]
}

/** Everything a generator needs while producing content. */
export interface GenContext {
  config: GameConfig
  rng: Rng
  /** Resolved numeric difficulty profile - see engines/difficulty.ts */
  profile: DifficultyProfile
  /**
   * Optional model-written content. Present only when the user supplied an API
   * key and asked for it; already sanitised and verified (see src/ai). Content
   * engines prefer it over the built-in libraries, then top up locally.
   */
  pack?: ContentPack | null
}

export interface LayoutContext extends GenContext {
  answerKey: AnswerKey
  meta: GameMeta
}

export interface GameMeta {
  title: string
  subtitle?: string
  instructions: string[]
  /** Short facts shown in the preview sidebar, e.g. { Words: 18, Grid: '15x15' }. */
  stats: Record<string, string | number>
  /** Which template/variant fired - surfaced so users can see the variety. */
  variant: string
}

export type GameCategory = 'math' | 'literacy' | 'puzzle' | 'cards' | 'board' | 'trivia'

export interface GameGenerator<P = unknown> {
  id: string
  name: string
  /** One-line description shown on the game-type card. */
  description: string
  category: GameCategory
  /** Short glyph used on the picker card. */
  glyph: string
  /** Subjects this generator can draw content from. */
  subjects: Subject[]
  /** Sensible starting config when the user picks this game type. */
  defaults: Partial<GameConfig>
  /** [min, max] item count, or null when the item slider is irrelevant. */
  itemRange: [number, number] | null
  /** Label for the item slider, e.g. "Questions", "Words", "Cards". */
  itemLabel: string
  /** True when the player-count control changes the output. */
  usesPlayers: boolean
  /** Orientations this generator lays out well in. */
  orientations: Orientation[]

  generate(ctx: GenContext): P
  validate(payload: P, ctx: GenContext): ValidationResult
  generateAnswerKey(payload: P, ctx: GenContext): AnswerKey
  meta(payload: P, ctx: GenContext): GameMeta
  layout(payload: P, ctx: LayoutContext): PrintDoc
}

/* ------------------------------------------------------------------ *
 * Output of the full pipeline
 * ------------------------------------------------------------------ */

export interface GeneratedGame {
  id: string
  createdAt: number
  config: GameConfig
  /** Set when model-written content contributed to this game. */
  pack?: ContentPack | null
  meta: GameMeta
  generatorId: string
  generatorName: string
  payload: unknown
  answerKey: AnswerKey
  doc: PrintDoc
  validation: ValidationResult
  /** How many generate -> validate cycles were needed. */
  attempts: number
}

/* ------------------------------------------------------------------ *
 * Difficulty profile (produced by engines/difficulty.ts)
 * ------------------------------------------------------------------ */

export type Operation =
  | 'addition' | 'subtraction' | 'multiplication' | 'division'
  | 'fractions' | 'decimals' | 'percentages' | 'algebra'
  | 'geometry' | 'sequences' | 'exponents' | 'integers'

export interface DifficultyProfile {
  /** Combined 0-100 score from grade + difficulty; drives every knob below. */
  score: number
  numberRange: [number, number]
  /** Operand ceiling for multiplication tables. */
  tableRange: [number, number]
  operations: Operation[]
  /** How many chained operations a single question may contain. */
  maxSteps: number
  allowNegatives: boolean
  allowDecimals: boolean
  decimalPlaces: number
  /** Denominators drawn on for fraction work. */
  denominators: number[]
  /** Word length window for word-search / crossword / vocabulary. */
  wordLength: [number, number]
  /** Vocabulary tier 1 (simplest) to 5 (hardest) used to filter datasets. */
  vocabTier: number
  /** Word-search / crossword grid edge. */
  gridSize: number
  /** Maze columns x rows. */
  mazeSize: [number, number]
  /** Sudoku box edge (2 => 4x4, 3 => 9x9) and what share of cells to remove. */
  sudokuBox: 2 | 3
  sudokuHolesRatio: number
  /** Bingo card edge (3, 4 or 5). */
  bingoSize: 3 | 4 | 5
  /** How close distractors sit to the correct answer (0 = far, 1 = adjacent). */
  distractorTightness: number
  /** Number of clues offered relative to the minimum needed (>= 1). */
  clueGenerosity: number
  /** How many of the 8 compass directions word search may use. */
  wordSearchDirections: number
  /** Logic-puzzle grid: [entities, categories]. */
  logicSize: [number, number]
  /** Sequence puzzle rule pool. */
  sequenceKinds: string[]
}
