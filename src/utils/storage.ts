import type { GameConfig } from '../types'

/**
 * Game history in localStorage.
 *
 * Only the CONFIG is stored, never the rendered document. Because generation is
 * fully deterministic from (seed + config), replaying a history entry rebuilds
 * the identical game - so a hundred saved games cost a few kilobytes instead of
 * megabytes of page geometry, and the store never goes stale against a newer
 * version of a generator.
 */

const HISTORY_KEY = 'pgg.history.v1'
const CONFIG_KEY = 'pgg.lastConfig.v1'
const MAX_ENTRIES = 60

export interface HistoryEntry {
  id: string
  createdAt: number
  title: string
  generatorId: string
  generatorName: string
  config: GameConfig
  pageCount: number
  /** Short summary line, e.g. "18 words · 15x15". */
  summary: string
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function available(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

export function loadHistory(): HistoryEntry[] {
  if (!available()) return []
  const entries = safeParse<HistoryEntry[]>(window.localStorage.getItem(HISTORY_KEY), [])
  return entries.filter((e) => e && e.config && e.id).slice(0, MAX_ENTRIES)
}

export function saveHistory(entries: HistoryEntry[]): void {
  if (!available()) return
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    // Quota exceeded, or storage disabled in a private window: history is a
    // convenience, so failing to persist must never break generation.
  }
}

export function addHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  const existing = loadHistory()
  // Regenerating the same seed+type replaces its entry rather than stacking.
  const deduped = existing.filter(
    (e) => !(e.config.seed === entry.config.seed && e.generatorId === entry.generatorId),
  )
  const next = [entry, ...deduped].slice(0, MAX_ENTRIES)
  saveHistory(next)
  return next
}

export function removeHistoryEntry(id: string): HistoryEntry[] {
  const next = loadHistory().filter((e) => e.id !== id)
  saveHistory(next)
  return next
}

export function clearHistory(): HistoryEntry[] {
  saveHistory([])
  return []
}

export function loadLastConfig(): GameConfig | null {
  if (!available()) return null
  return safeParse<GameConfig | null>(window.localStorage.getItem(CONFIG_KEY), null)
}

export function saveLastConfig(config: GameConfig): void {
  if (!available()) return
  try {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    // Same reasoning as above - persistence is best-effort.
  }
}
