import type { MathTopic, Subject, ThemeId } from '../types'

/**
 * Optional AI augmentation.
 *
 * The app generates complete games with zero network access. This layer is
 * strictly additive: when the user supplies their own API key, a model can
 * write FRESH CONTENT (words, clues, questions on any topic) or propose a
 * different game entirely. Everything it returns is treated as untrusted data
 * and pushed through the same validation engine as locally-generated content -
 * see ai/sanitize.ts for why that matters.
 *
 * If no key is set, nothing here ever runs and no request is ever made.
 */

export type AiProviderId = 'anthropic' | 'openai'

export interface AiSettings {
  provider: AiProviderId
  /** Kept in memory always; persisted only when `remember` is true. */
  apiKey: string
  model: string
  /** Free-text topic the user wants content about. Blank = follow the config. */
  topic: string
  /** Persist the key to localStorage. Off by default - see ai/store.ts. */
  remember: boolean
  /**
   * Optional override for the provider's base URL, for users routing through
   * their own proxy. Required for OpenAI, whose API does not send the CORS
   * headers a browser needs - see ai/client.ts.
   */
  baseUrl: string
}

/** One term/clue pair, the same shape the built-in libraries use. */
export interface AiFact {
  term: string
  clue: string
  category: string
}

/** One question/answer pair. `expr` enables independent maths verification. */
export interface AiQuestion {
  question: string
  answer: string
  /** Arithmetic expression that re-derives a numeric answer, or null. */
  expr: string | null
}

/**
 * A batch of model-written content, ready to be injected into any generator.
 * Every field has already passed sanitisation and (for maths) verification.
 */
export interface ContentPack {
  id: string
  createdAt: number
  provider: AiProviderId
  model: string
  /** What the user asked for, echoed back for the history panel. */
  topic: string
  facts: AiFact[]
  questions: AiQuestion[]
  /** Extra themed words for grid puzzles. */
  words: string[]
  /** Counts of what was discarded during sanitisation, for transparency. */
  rejected: { facts: number; questions: number; words: number }
}

/** A model-proposed game, used by "Surprise me". */
export interface AiVariation {
  gameType: string
  subject: Subject
  mathTopic: MathTopic
  theme: ThemeId
  itemCount: number | null
  title: string
  subtitle: string
  /** Shown in the UI only - never printed on the sheet. */
  rationale: string
}

export interface AiUsage {
  inputTokens: number | null
  outputTokens: number | null
  ms: number
}

export interface AiResult<T> {
  data: T
  usage: AiUsage
  /** Non-fatal notes worth surfacing, e.g. "8 of 30 items were rejected". */
  notes: string[]
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'network' | 'rate-limit' | 'refusal' | 'format' | 'server' | 'unknown',
    readonly detail?: string,
  ) {
    super(message)
    this.name = 'AiError'
  }
}
