import { PROVIDERS } from './client'
import type { AiSettings } from './types'

/**
 * AI settings persistence.
 *
 * The API key is treated differently from every other setting. It lives in
 * React state for the session and is written to localStorage ONLY when the user
 * ticks "remember" - and the UI says plainly what that means. localStorage is
 * readable by any script running on the origin, so defaulting to persistence
 * would be a decision made on the user's behalf about their own credential.
 *
 * Everything else (provider, model, topic) persists freely.
 */

const SETTINGS_KEY = 'pgg.ai.settings.v1'
const KEY_KEY = 'pgg.ai.key.v1'

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'anthropic',
  apiKey: '',
  model: PROVIDERS.anthropic.defaultModel,
  topic: '',
  remember: false,
  baseUrl: '',
}

function available(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

export function loadAiSettings(): AiSettings {
  if (!available()) return { ...DEFAULT_AI_SETTINGS }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    const stored = raw ? (JSON.parse(raw) as Partial<AiSettings>) : {}
    const remembered = stored.remember ? window.localStorage.getItem(KEY_KEY) ?? '' : ''
    return {
      ...DEFAULT_AI_SETTINGS,
      ...stored,
      // Never resurrect a key that was persisted before "remember" was cleared.
      apiKey: remembered,
    }
  } catch {
    return { ...DEFAULT_AI_SETTINGS }
  }
}

export function saveAiSettings(settings: AiSettings): void {
  if (!available()) return
  try {
    const { apiKey, ...rest } = settings
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest))
    if (settings.remember && apiKey) {
      window.localStorage.setItem(KEY_KEY, apiKey)
    } else {
      window.localStorage.removeItem(KEY_KEY)
    }
  } catch {
    // Storage disabled or full - the session still works, it just will not
    // survive a reload. Never let this break generation.
  }
}

export function forgetApiKey(): void {
  if (!available()) return
  try {
    window.localStorage.removeItem(KEY_KEY)
  } catch {
    // Nothing to do.
  }
}

/** Loose shape check so an obviously wrong key is caught before a round trip. */
export function looksLikeKey(provider: AiSettings['provider'], key: string): boolean {
  const trimmed = key.trim()
  if (trimmed.length < 20) return false
  return trimmed.startsWith(PROVIDERS[provider].keyPrefix)
}
