import { listGenerators } from '../engines/registry'
import { MATH_TOPICS, SUBJECTS, type GameConfig, type MathTopic, type Subject, type ThemeId } from '../types'
import { THEME_OPTIONS } from '../engines/layout/theme'
import { clamp } from '../utils/misc'
import { callModel } from './client'
import { sanitizeHeading } from './sanitize'
import type { AiResult, AiSettings, AiVariation } from './types'

/**
 * "Surprise me" - let the model choose the whole game.
 *
 * The model picks a game type, subject, theme and size from the app's own
 * registry, which is what produces genuinely different sheets rather than the
 * same game with new words. Its choice is then clamped against the registry
 * before anything is generated: an unknown game type, an unsupported subject or
 * an out-of-range item count falls back to a valid value instead of failing.
 *
 * The model may name the sheet, but it does NOT write the instructions - those
 * come from the generator, which knows how the game actually works and is not
 * a channel an outside system can write printed text through.
 */

const VARIATION_SCHEMA = {
  type: 'object',
  properties: {
    gameType: { type: 'string' },
    subject: { type: 'string' },
    mathTopic: { type: 'string' },
    theme: { type: 'string' },
    itemCount: { type: ['integer', 'null'] },
    title: { type: 'string' },
    subtitle: { type: 'string' },
    rationale: { type: 'string' },
  },
  required: ['gameType', 'subject', 'mathTopic', 'theme', 'itemCount', 'title', 'subtitle', 'rationale'],
  additionalProperties: false,
} as const

const SYSTEM = `You design printable classroom games. You are shown the game types an app can produce and you choose ONE, then configure it. Return JSON only.

Rules:
- gameType, subject, mathTopic and theme MUST be values from the lists given. Never invent one.
- Choose a combination that suits the age group and would be genuinely enjoyable to hand out.
- Prefer a game type the user has not just been looking at, unless it is clearly the best fit.
- title: 3-40 characters, plain words, no quotes or emoji. It is printed at the top of the sheet.
- subtitle: up to 60 characters, describing the activity.
- rationale: one sentence for the teacher explaining why this suits the class. Not printed.
- Return only the JSON object.`

export interface VariationRequest {
  settings: AiSettings
  config: GameConfig
  signal?: AbortSignal
}

export async function generateVariation(request: VariationRequest): Promise<AiResult<AiVariation>> {
  const { settings, config } = request
  const generators = listGenerators()

  const catalogue = generators
    .map((g) => `- ${g.id}: ${g.name}. ${g.description} Subjects: ${g.subjects.join(', ')}.` +
      (g.itemRange ? ` ${g.itemLabel} ${g.itemRange[0]}-${g.itemRange[1]}.` : ''))
    .join('\n')

  const user = [
    'Available game types:',
    catalogue,
    '',
    `Subjects: ${SUBJECTS.map((s) => s.id).join(', ')}`,
    `Maths topics: ${MATH_TOPICS.map((t) => t.id).join(', ')}`,
    `Themes: ${THEME_OPTIONS.map((t) => t.id).join(', ')}`,
    '',
    `Class: grade ${config.grade}, difficulty ${config.difficulty.replace('-', ' ')}, about ${config.lengthMinutes} minutes.`,
    settings.topic.trim() ? `The teacher wants it to involve: ${settings.topic.trim()}` : '',
    `Currently selected (pick something different unless it is clearly best): ${config.gameType}`,
    '',
    'Choose and configure one game.',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await callModel<Record<string, unknown>>({
    provider: settings.provider,
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    system: SYSTEM,
    user,
    schema: VARIATION_SCHEMA as unknown as Record<string, unknown>,
    schemaName: 'game_variation',
    maxTokens: 3000,
    signal: request.signal,
  })

  const raw = result.data
  const notes: string[] = []

  /* -------- clamp every field against the registry, never trust it -------- */

  const requestedType = String(raw.gameType ?? '').trim()
  const generator = generators.find((g) => g.id === requestedType)
  if (!generator) {
    notes.push(`"${requestedType}" is not a game this app makes - kept the current type.`)
  }
  const resolved = generator ?? generators.find((g) => g.id === config.gameType) ?? generators[0]

  const requestedSubject = String(raw.subject ?? '') as Subject
  const subject: Subject = resolved.subjects.includes(requestedSubject)
    ? requestedSubject
    : resolved.subjects[0]

  const requestedTopic = String(raw.mathTopic ?? '') as MathTopic
  const mathTopic: MathTopic = MATH_TOPICS.some((t) => t.id === requestedTopic) ? requestedTopic : 'auto'

  const requestedTheme = String(raw.theme ?? '') as ThemeId
  const theme: ThemeId = THEME_OPTIONS.some((t) => t.id === requestedTheme) ? requestedTheme : config.theme

  let itemCount: number | null = null
  if (resolved.itemRange && typeof raw.itemCount === 'number' && Number.isFinite(raw.itemCount)) {
    itemCount = clamp(Math.round(raw.itemCount), resolved.itemRange[0], resolved.itemRange[1])
  }

  const variation: AiVariation = {
    gameType: resolved.id,
    subject,
    mathTopic,
    theme,
    itemCount,
    title: sanitizeHeading(raw.title, 40, resolved.name),
    subtitle: sanitizeHeading(raw.subtitle, 60, ''),
    rationale: sanitizeHeading(raw.rationale, 200, 'A change of pace for this class.'),
  }

  return { data: variation, usage: result.usage, notes }
}

/** Applies a validated variation on top of the current configuration. */
export function applyVariation(config: GameConfig, variation: AiVariation): GameConfig {
  return {
    ...config,
    gameType: variation.gameType,
    subject: variation.subject,
    mathTopic: variation.mathTopic,
    theme: variation.theme,
    itemCount: variation.itemCount ?? config.itemCount,
    customTitle: variation.title,
    customSubtitle: variation.subtitle || undefined,
  }
}
