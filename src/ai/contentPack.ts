import { GRADES, type GameConfig } from '../types'
import { buildProfile } from '../engines/difficulty'
import { nowId } from '../utils/misc'
import { callModel } from './client'
import { sanitizeFacts, sanitizeQuestions, sanitizeWords } from './sanitize'
import { AiError, type AiResult, type AiSettings, type ContentPack } from './types'

/**
 * Content-pack generation.
 *
 * Asks the model for terms, clues and questions on a topic, then hands the
 * reply to ai/sanitize.ts. What survives is injected into the ordinary
 * generators, so a word search, crossword, quiz deck or memory set can be about
 * anything the user names - not just the topics shipped in src/data.
 *
 * The prompt asks for `expr` on every numeric question specifically so the
 * expression evaluator can re-derive the answer and drop the ones that do not
 * check out. That is what makes model-written maths safe to print.
 */

const PACK_SCHEMA = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          clue: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['term', 'clue', 'category'],
        additionalProperties: false,
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
          expr: { type: ['string', 'null'] },
        },
        required: ['question', 'answer', 'expr'],
        additionalProperties: false,
      },
    },
    words: { type: 'array', items: { type: 'string' } },
  },
  required: ['facts', 'questions', 'words'],
  additionalProperties: false,
} as const

const SYSTEM = `You write content for printable classroom games. You are given a topic, a school grade and a difficulty, and you return JSON only.

Rules you must follow:
- TERM: a single answer word or short phrase, UPPERCASE, A-Z and spaces only, 3-14 letters once spaces are removed. No digits, no punctuation, no accents.
- CLUE: one short definition or question, 6-120 characters, that identifies the term WITHOUT containing it.
- QUESTION/ANSWER: a self-contained question with one short, unambiguous answer.
- EXPR: for any question whose answer is a plain number, give an arithmetic expression using only digits and + - * / ( ) ^ that evaluates to exactly that number (e.g. question "A box holds 6 pencils. How many in 7 boxes?", answer "42", expr "6 * 7"). For every non-numeric question, set expr to null. Never invent an expression that does not evaluate to the answer.
- WORDS: extra single words on the topic for letter grids, 3-14 letters, A-Z only.
- Everything must be factually correct and appropriate for the stated grade.
- Return only the JSON object. No commentary.`

export interface PackRequest {
  settings: AiSettings
  config: GameConfig
  /** How many of each kind to ask for. */
  factCount?: number
  questionCount?: number
  wordCount?: number
  signal?: AbortSignal
}

function describeGrade(config: GameConfig): string {
  const grade = GRADES.find((g) => g.id === config.grade)
  if (!grade) return 'school age'
  return `${grade.label} (ages ${grade.age})`
}

export async function generateContentPack(request: PackRequest): Promise<AiResult<ContentPack>> {
  const { settings, config } = request
  const profile = buildProfile(config.grade, config.difficulty)

  const factCount = request.factCount ?? 26
  const questionCount = request.questionCount ?? 20
  const wordCount = request.wordCount ?? 18

  const topic = settings.topic.trim() || `${config.subject.replace('-', ' ')}`

  const user = [
    `Topic: ${topic}`,
    `Audience: ${describeGrade(config)}`,
    `Difficulty: ${config.difficulty.replace('-', ' ')}`,
    `Subject area: ${config.subject.replace('-', ' ')}`,
    config.subject === 'mathematics' && config.mathTopic !== 'auto'
      ? `Maths strand: ${config.mathTopic.replace('-', ' ')}`
      : '',
    `Vocabulary should suit tier ${profile.vocabTier} of 5, with answer words ${profile.wordLength[0]}-${profile.wordLength[1]} letters.`,
    '',
    `Produce exactly:`,
    `- ${factCount} facts (term + clue)`,
    `- ${questionCount} questions (question + answer + expr)`,
    `- ${wordCount} words`,
    '',
    'All content must be about the topic above.',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await callModel<{ facts: unknown; questions: unknown; words: unknown }>({
    provider: settings.provider,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    system: SYSTEM,
    user,
    schema: PACK_SCHEMA as unknown as Record<string, unknown>,
    schemaName: 'content_pack',
    maxTokens: 8000,
    signal: request.signal,
  })

  const facts = sanitizeFacts(result.data.facts)
  const questions = sanitizeQuestions(result.data.questions)
  const words = sanitizeWords(result.data.words)

  const pack: ContentPack = {
    id: nowId('pack'),
    createdAt: Date.now(),
    provider: settings.provider,
    model: settings.model,
    topic,
    facts: facts.kept,
    questions: questions.kept,
    words: words.kept,
    rejected: { facts: facts.rejected, questions: questions.rejected, words: words.rejected },
  }

  // A pack this thin will not visibly change any sheet, so treat it as a
  // failure the user can act on rather than silently producing a local game.
  if (pack.facts.length < 6 && pack.questions.length < 6) {
    throw new AiError(
      `The model returned too little usable content (${pack.facts.length} facts, ${pack.questions.length} questions). Try a broader topic.`,
      'format',
    )
  }

  const notes: string[] = []
  const totalRejected = facts.rejected + questions.rejected + words.rejected
  if (totalRejected > 0) {
    notes.push(
      `${totalRejected} item(s) were discarded for failing the content checks` +
        (questions.rejected > 0 ? ', including answers that did not verify' : '') +
        '.',
    )
  }

  return { data: pack, usage: result.usage, notes }
}
