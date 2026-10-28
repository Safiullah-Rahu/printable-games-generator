import { useCallback, useEffect, useState } from 'react'

/**
 * Theme preference.
 *
 * Three states, not two: "system" is a real choice and it has to keep tracking
 * the OS after the page has loaded, so the media query stays subscribed while
 * that mode is selected. The resolved value is written to a data-theme
 * attribute on <html>; every colour in the app is a CSS variable keyed off it,
 * so nothing re-renders to repaint.
 *
 * The same resolution runs as a blocking inline script in index.html before
 * first paint. Without it the light palette would show for a frame on a dark
 * device - the thing people notice most about a theme implementation.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'pgg.theme.v1'

/** Kept in sync with the inline script in index.html. */
const META_COLOR: Record<ResolvedTheme, string> = {
  light: '#efede8',
  dark: '#0c0c0f',
}

function prefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function loadThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // Storage blocked; follow the OS.
  }
  return 'system'
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'system') return prefersDark() ? 'dark' : 'light'
  return mode
}

function apply(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.dataset.theme = resolved
  // Tints the browser chrome on mobile so the app does not sit in a white frame.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', META_COLOR[resolved])
}

export function useTheme(): {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
} {
  const [mode, setModeState] = useState<ThemeMode>(() => loadThemeMode())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(loadThemeMode()))

  useEffect(() => {
    const next = resolveTheme(mode)
    setResolved(next)
    apply(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // Preference just will not survive a reload.
    }
    if (mode !== 'system' || !window.matchMedia) return

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      const value = query.matches ? 'dark' : 'light'
      setResolved(value)
      apply(value)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [mode])

  const setMode = useCallback((next: ThemeMode) => setModeState(next), [])

  return { mode, resolved, setMode }
}
