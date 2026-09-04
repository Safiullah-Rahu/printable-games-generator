import type { ContentPack } from '../ai/types'
import type { GameConfig, GameGenerator, GeneratedGame, GenContext, LayoutContext, ValidationResult } from '../types'
import { createRng } from '../utils/rng'
import { nowId } from '../utils/misc'
import { buildProfile } from './difficulty'
import { applyFooters } from './layout/components'
import { resolveTheme } from './layout/theme'
import { getGenerator } from './registry'
import { combine, validateDoc } from './validation'

/**
 * The generation pipeline.
 *
 *   Game Definition -> Input Config -> Difficulty Rules -> Content Generator
 *   -> Game Mechanics -> Validation -> Layout -> Printable Game -> PDF
 *
 * Implemented as: resolve the generator, build the difficulty profile, then loop
 * generate -> validate until a game passes. Each attempt gets its own RNG stream
 * (seed + attempt number), so a rejected game is genuinely replaced rather than
 * nudged. Layout runs only on content that already passed, and the finished
 * document is validated a second time for geometry before anyone sees it.
 */

const MAX_CONTENT_ATTEMPTS = 12
const MAX_LAYOUT_ATTEMPTS = 4

export class GenerationError extends Error {
  constructor(message: string, readonly issues: ValidationResult['issues']) {
    super(message)
    this.name = 'GenerationError'
  }
}

function contextFor(config: GameConfig, attempt: number, pack?: ContentPack | null): GenContext {
  return {
    config,
    // Attempt 0 uses the bare seed so a stated seed reproduces exactly.
    rng: createRng(attempt === 0 ? config.seed : `${config.seed}#${attempt}`),
    profile: buildProfile(config.grade, config.difficulty),
    pack: pack ?? null,
  }
}

/**
 * Builds a game. An optional content pack (see src/ai) supplies model-written
 * material to the content engines; the pipeline is otherwise identical, so
 * AI-sourced content faces exactly the same validation as local content.
 */
export function buildGame(config: GameConfig, pack?: ContentPack | null): GeneratedGame {
  const generator = getGenerator(config.gameType) as GameGenerator<unknown> | undefined
  if (!generator) throw new GenerationError(`Unknown game type "${config.gameType}"`, [])

  const collected: ValidationResult['issues'] = []
  let lastError: unknown = null

  for (let attempt = 0; attempt < MAX_CONTENT_ATTEMPTS; attempt++) {
    const ctx = contextFor(config, attempt, pack)

    let payload: unknown
    try {
      payload = generator.generate(ctx)
    } catch (err) {
      lastError = err
      collected.push({
        severity: 'warning',
        code: 'generate.threw',
        message: `Attempt ${attempt + 1} failed: ${err instanceof Error ? err.message : String(err)}`,
      })
      continue
    }

    const contentResult = generator.validate(payload, ctx)
    if (!contentResult.ok) {
      collected.push(...contentResult.issues)
      continue
    }

    const answerKey = generator.generateAnswerKey(payload, ctx)
    const meta = generator.meta(payload, ctx)
    const layoutCtx: LayoutContext = { ...ctx, answerKey, meta }

    // Layout can still fail on geometry (an unusually long word in a tight
    // grid). Retry with fresh content rather than shipping a broken sheet.
    for (let layoutAttempt = 0; layoutAttempt < MAX_LAYOUT_ATTEMPTS; layoutAttempt++) {
      let doc
      try {
        doc = generator.layout(payload, layoutCtx)
      } catch (err) {
        lastError = err
        collected.push({
          severity: 'warning',
          code: 'layout.threw',
          message: `Layout failed: ${err instanceof Error ? err.message : String(err)}`,
        })
        break
      }

      const theme = resolveTheme(config.theme, config.inkSaver)
      applyFooters(doc, theme, meta, config)

      const docResult = validateDoc(doc)
      if (!docResult.ok) {
        collected.push(...docResult.issues)
        break
      }

      return {
        id: nowId('game'),
        createdAt: Date.now(),
        config,
        pack: pack ?? null,
        meta,
        generatorId: generator.id,
        generatorName: generator.name,
        payload,
        answerKey,
        doc,
        validation: combine(contentResult, docResult, { ok: true, issues: [] }),
        attempts: attempt + 1,
      }
    }
  }

  throw new GenerationError(
    `Could not produce a valid ${generator.name} after ${MAX_CONTENT_ATTEMPTS} attempts.` +
      (lastError instanceof Error ? ` Last error: ${lastError.message}` : ''),
    collected.slice(-12),
  )
}

/**
 * Convenience for the UI's "Generate Another" button: same config, new seed.
 * The seed is derived from the old one so the sequence stays reproducible if a
 * user ever wants to walk it again.
 */
export function nextSeed(seed: string): string {
  const rng = createRng(`${seed}~next`)
  return `${seed.replace(/-\d+$/, '')}-${rng.int(1000, 9999)}`
}
