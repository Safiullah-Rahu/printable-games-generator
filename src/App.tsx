import {
  Clock,
  Download,
  ExternalLink,
  FileText,
  Monitor,
  Moon,
  Printer,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Sun,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { generateContentPack } from './ai/contentPack'
import { forgetApiKey, loadAiSettings, saveAiSettings } from './ai/store'
import { AiError, type AiSettings, type ContentPack } from './ai/types'
import { applyVariation, generateVariation } from './ai/variation'
import { AiPanel } from './components/AiPanel'
import { ConfigPanel } from './components/ConfigPanel'
import { DocPreview, PrintSurface } from './components/DocPreview'
import { GameTypePicker } from './components/GameTypePicker'
import { HistoryPanel } from './components/HistoryPanel'
import { Button, IconButton } from './components/ui/controls'
import { applyPreset, defaultConfigFor, normalizeConfig, type Preset } from './engines/config'
import { buildProfile } from './engines/difficulty'
import { buildGame, GenerationError, nextSeed } from './engines/pipeline'
import { getGenerator } from './engines/registry'
import { downloadPdf, pdfBlobUrl } from './pdf/exportPdf'
import type { GameConfig, GeneratedGame } from './types'
import { nowId } from './utils/misc'
import { randomSeed } from './utils/rng'
import { useTheme, type ThemeMode } from './utils/theme'
import {
  addHistoryEntry, clearHistory, loadHistory, loadLastConfig,
  removeHistoryEntry, saveLastConfig, type HistoryEntry,
} from './utils/storage'

/**
 * Application shell.
 *
 * Generation is debounced and re-runs whenever the configuration changes, so
 * the preview is always live. Because the pipeline is pure and deterministic,
 * re-running it is cheap and needs no cache invalidation logic - the config IS
 * the cache key.
 */

/**
 * Which section is showing.
 *
 * 'preview' is a phone-only destination. Below the lg breakpoint the shell is a
 * single column and this state decides what occupies it; from lg upward the
 * settings panel and the preview each have their own column and are both
 * visible at all times, so the value is only ever used to pick the panel.
 */
type Tab = 'setup' | 'ai' | 'history' | 'preview'

export default function App(): JSX.Element {
  const [config, setConfig] = useState<GameConfig>(
    () => loadLastConfig() ?? defaultConfigFor('word-search', randomSeed()),
  )
  const [game, setGame] = useState<GeneratedGame | null>(null)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('setup')
  const [zoom, setZoom] = useState(78)
  // The largest zoom that still fits the preview column, reported by DocPreview.
  const [fitZoom, setFitZoom] = useState(Infinity)
  const [pageIndex, setPageIndex] = useState<number | undefined>(undefined)
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())

  /* AI state. Nothing here touches the network until the user asks it to. */
  const [ai, setAi] = useState<AiSettings>(() => loadAiSettings())
  const [pack, setPack] = useState<ContentPack | null>(null)
  const [aiBusy, setAiBusy] = useState<'content' | 'variation' | null>(null)
  const [aiError, setAiError] = useState<AiError | null>(null)
  const [aiNotes, setAiNotes] = useState<string[]>([])

  const profile = useMemo(() => buildProfile(config.grade, config.difficulty), [config.grade, config.difficulty])
  const generator = getGenerator(config.gameType)

  /* --------------------------- generation --------------------------- */

  const timer = useRef<number | null>(null)

  useEffect(() => {
    setBusy(true)
    if (timer.current) window.clearTimeout(timer.current)

    // A short debounce keeps dragging the item slider smooth: only the settled
    // value is ever generated.
    timer.current = window.setTimeout(() => {
      try {
        const built = buildGame(config, pack)
        setGame(built)
        setError(null)
        setPageIndex((current) => (current !== undefined && current < built.doc.pages.length ? current : undefined))
        saveLastConfig(config)
      } catch (err) {
        setGame(null)
        setError({
          message: err instanceof Error ? err.message : String(err),
          details: err instanceof GenerationError ? err.issues.slice(0, 5).map((i) => `${i.code}: ${i.message}`) : [],
        })
      } finally {
        setBusy(false)
      }
    }, 180)

    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [config, pack])

  /* ----------------------------- history ---------------------------- */

  useEffect(() => {
    if (!game) return
    const summary = Object.entries(game.meta.stats)
      .slice(0, 2)
      .map(([k, v]) => `${v} ${k.toLowerCase()}`)
      .join(' · ')
    setHistory(
      addHistoryEntry({
        id: nowId('h'),
        createdAt: Date.now(),
        title: game.meta.title,
        generatorId: game.generatorId,
        generatorName: game.generatorName,
        config: game.config,
        pageCount: game.doc.pages.length,
        summary: summary || game.meta.variant,
      }),
    )
  }, [game])

  /* ----------------------------- actions ---------------------------- */

  const patch = useCallback((update: Partial<GameConfig>) => {
    setConfig((current) => normalizeConfig({ ...current, ...update }))
  }, [])

  const selectGameType = useCallback((gameType: string) => {
    setConfig((current) => {
      const defaults = defaultConfigFor(gameType, current.seed)
      // Keep the teacher's level and paper choices; take the rest from the
      // generator's own defaults so each game type starts sensibly configured.
      return normalizeConfig({
        ...defaults,
        grade: current.grade,
        difficulty: current.difficulty,
        theme: current.theme,
        pageSize: current.pageSize,
        includeAnswerKey: current.includeAnswerKey,
        includeInstructions: current.includeInstructions,
        cutLines: current.cutLines,
        inkSaver: current.inkSaver,
        nameLine: current.nameLine,
        seed: randomSeed(),
      })
    })
    setPageIndex(undefined)
  }, [])

  const regenerate = useCallback(() => {
    setConfig((current) => ({ ...current, seed: nextSeed(current.seed) }))
    setPageIndex(undefined)
  }, [])

  const usePreset = useCallback((preset: Preset) => {
    setConfig((current) => applyPreset(current, preset))
    setPageIndex(undefined)
  }, [])

  const openHistory = useCallback((entry: HistoryEntry) => {
    setConfig(normalizeConfig(entry.config))
    setTab('setup')
    setPageIndex(undefined)
  }, [])

  const duplicateHistory = useCallback((entry: HistoryEntry) => {
    setConfig(normalizeConfig({ ...entry.config, seed: randomSeed() }))
    setTab('setup')
    setPageIndex(undefined)
  }, [])

  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  const handleDownload = useCallback(() => {
    if (game) downloadPdf(game)
  }, [game])

  const handleOpenPdf = useCallback(() => {
    if (!game) return
    // Opened rather than downloaded, so a teacher can check the real PDF before
    // committing it to disk. Revoked once the tab has had time to load it.
    const url = pdfBlobUrl(game)
    window.open(url, '_blank', 'noopener')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }, [game])

  /* ------------------------------- ai ------------------------------- */

  const patchAi = useCallback((update: Partial<AiSettings>) => {
    setAi((current) => {
      const next = { ...current, ...update }
      saveAiSettings(next)
      return next
    })
    setAiError(null)
  }, [])

  const runContentPack = useCallback(async () => {
    setAiBusy('content')
    setAiError(null)
    setAiNotes([])
    try {
      const result = await generateContentPack({ settings: ai, config })
      setPack(result.data)
      setAiNotes(result.notes)
      // New content should be visible immediately, so re-seed the game.
      setConfig((current) => ({ ...current, seed: nextSeed(current.seed) }))
      setTab('setup')
    } catch (err) {
      setAiError(err instanceof AiError ? err : new AiError(String(err), 'unknown'))
    } finally {
      setAiBusy(null)
    }
  }, [ai, config])

  const runSurpriseMe = useCallback(async () => {
    setAiBusy('variation')
    setAiError(null)
    setAiNotes([])
    try {
      const result = await generateVariation({ settings: ai, config })
      setConfig((current) =>
        normalizeConfig({ ...applyVariation(current, result.data), seed: randomSeed() }),
      )
      setAiNotes([result.data.rationale, ...result.notes])
      setPageIndex(undefined)
      setTab('setup')
    } catch (err) {
      setAiError(err instanceof AiError ? err : new AiError(String(err), 'unknown'))
    } finally {
      setAiBusy(null)
    }
  }, [ai, config])

  const clearPack = useCallback(() => {
    setPack(null)
    setAiNotes([])
    setConfig((current) => ({ ...current, seed: nextSeed(current.seed) }))
  }, [])

  const theme = useTheme()

  /* ------------------------------ render ---------------------------- */

  const pageCount = game?.doc.pages.length ?? 0
  // 'preview' has no panel of its own; on a wide screen it must still show one.
  const panelTab: Exclude<Tab, 'preview'> = tab === 'preview' ? 'setup' : tab
  const warnings = game?.validation.issues.filter((i) => i.severity === 'warning') ?? []

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas text-ink">
      <Header
        game={game}
        busy={busy}
        themeMode={theme.mode}
        onThemeChange={theme.setMode}
        onRegenerate={regenerate}
        onPrint={handlePrint}
        onDownload={handleDownload}
        onOpenPdf={handleOpenPdf}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ------------------------- left column ------------------------- */}
        <aside
          className={`w-full min-w-0 shrink-0 flex-col border-line bg-surface lg:flex lg:w-[408px] lg:border-r ${
            tab === 'preview' ? 'hidden' : 'flex'
          }`}
        >
          {/* Replaced by the bottom bar below lg. */}
          <div className="hidden shrink-0 px-4 pt-4 lg:block">
            <div className="flex gap-1 rounded-xl bg-surface-sunken p-1 ring-1 ring-inset ring-line">
              {(['setup', 'ai', 'history'] as const).map((t) => {
                const active = panelTab === t
                const label =
                  t === 'setup' ? 'Set up' : t === 'ai' ? 'AI boost' : `History (${history.length})`
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition duration-200 ${
                      active ? 'bg-surface text-ink shadow-panel' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {label}
                    {t === 'ai' && pack && (
                      <span className="h-1.5 w-1.5 rounded-full bg-ok" title="A content pack is active" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-4 py-5">
            {panelTab === 'ai' ? (
              <AiPanel
                settings={ai}
                onChange={patchAi}
                pack={pack}
                busy={aiBusy}
                error={aiError}
                notes={aiNotes}
                onGenerateContent={() => void runContentPack()}
                onSurpriseMe={() => void runSurpriseMe()}
                onClearPack={clearPack}
                onForgetKey={forgetApiKey}
              />
            ) : panelTab === 'setup' ? (
              <div className="space-y-7">
                <section>
                  <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                    Game type
                  </h2>
                  <GameTypePicker value={config.gameType} onSelect={selectGameType} onPreset={usePreset} />
                </section>
                <ConfigPanel config={config} profile={profile} onChange={patch} />
              </div>
            ) : (
              <HistoryPanel
                entries={history}
                activeId={history.find((h) => h.config.seed === config.seed)?.id}
                onOpen={openHistory}
                onDuplicate={duplicateHistory}
                onRemove={(id) => setHistory(removeHistoryEntry(id))}
                onClear={() => setHistory(clearHistory())}
              />
            )}
          </div>
        </aside>

        {/* ------------------------ preview column ----------------------- */}
        <main className={`min-w-0 flex-1 flex-col lg:flex ${tab === 'preview' ? 'flex' : 'hidden'}`}>
          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{game?.meta.title ?? 'No preview'}</p>
              <p className="truncate text-xs text-ink-muted">
                {game
                  ? `${generator?.name} · ${game.meta.variant} · ${pageCount} page${pageCount === 1 ? '' : 's'}`
                  : 'Adjust the settings to generate a game.'}
              </p>
            </div>

            {pageCount > 1 && (
              <div className="scrollbar-slim flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-surface-sunken p-1 ring-1 ring-inset ring-line">
                <button
                  type="button"
                  onClick={() => setPageIndex(undefined)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    pageIndex === undefined ? 'bg-surface text-ink shadow-panel' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  All
                </button>
                {game?.doc.pages.map((page, i) => (
                  <button
                    key={`${page.label}-${i}`}
                    type="button"
                    title={page.label}
                    onClick={() => setPageIndex(i)}
                    className={`min-w-[28px] shrink-0 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums transition ${
                      pageIndex === i ? 'bg-surface text-ink shadow-panel' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-0.5 rounded-xl bg-surface-sunken p-1 ring-1 ring-inset ring-line">
              <IconButton
                label="Zoom out"
                className="h-7 w-7"
                onClick={() => setZoom((z) => Math.max(20, Math.round(Math.min(z, fitZoom)) - 12))}
              >
                <span className="text-base leading-none">−</span>
              </IconButton>
              <span className="w-10 text-center text-xs font-semibold tabular-nums text-ink-muted">
                {zoom >= fitZoom ? 'Fit' : `${zoom}%`}
              </span>
              <IconButton
                label="Zoom in"
                className="h-7 w-7"
                onClick={() => setZoom((z) => Math.min(200, Math.round(Math.min(z, fitZoom)) + 12))}
              >
                <span className="text-base leading-none">+</span>
              </IconButton>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="shrink-0 border-b border-warn/30 bg-warn-soft px-4 py-1.5 text-xs text-warn">
              {warnings.length} layout note{warnings.length === 1 ? '' : 's'}: {warnings[0].message}
            </div>
          )}

          <div className="canvas-grid scrollbar-slim min-h-0 flex-1 overflow-auto px-2 sm:px-4">
            {error ? (
              <div className="mx-auto mt-16 max-w-md animate-fade-rise rounded-2xl border border-line bg-surface p-6 text-center shadow-pop">
                <p className="text-sm font-semibold text-danger">Could not generate this game</p>
                <p className="mt-2 text-sm text-ink-muted">{error.message}</p>
                {error.details.length > 0 && (
                  <ul className="mt-3 space-y-1 rounded-xl bg-surface-sunken p-3 text-left text-xs text-ink-muted">
                    {error.details.map((d) => (
                      <li key={d} className="font-mono leading-snug">
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="primary" className="mt-5" onClick={regenerate}>
                  Try another seed
                </Button>
              </div>
            ) : game ? (
              <DocPreview doc={game.doc} zoom={zoom} pageIndex={pageIndex} onFitZoom={setFitZoom} />
            ) : (
              <PreviewSkeleton />
            )}
          </div>
        </main>

        {/* -------------------------- info rail -------------------------- */}
        {game && (
          <aside className="scrollbar-slim hidden w-60 shrink-0 flex-col gap-6 overflow-y-auto border-l border-line bg-surface px-4 py-5 xl:flex">
            <div>
              <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                This game
              </h3>
              <dl className="space-y-0">
                {Object.entries(game.meta.stats).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-0"
                  >
                    <dt className="truncate text-xs text-ink-muted">{key}</dt>
                    <dd className="shrink-0 text-xs font-semibold tabular-nums text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                Pages
              </h3>
              <ol className="space-y-0.5">
                {game.doc.pages.map((page, i) => (
                  <li key={`${page.label}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setPageIndex(i)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition ${
                        pageIndex === i
                          ? 'bg-accent-soft font-semibold text-accent'
                          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                      }`}
                    >
                      <span className="w-3 shrink-0 tabular-nums opacity-60">{i + 1}</span>
                      <span className="truncate">{page.label}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-auto space-y-2 border-t border-line pt-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">Seed</p>
                <p className="mt-0.5 break-all font-mono text-[11px] text-ink-muted">{game.config.seed}</p>
              </div>
              <p className="text-[11px] leading-relaxed text-ink-subtle">
                Built in {game.attempts} pass{game.attempts === 1 ? '' : 'es'}, entirely on this device.
              </p>
            </div>
          </aside>
        )}
      </div>

      <MobileNav tab={tab} onSelect={setTab} historyCount={history.length} hasPack={pack !== null} />

      {game && <PrintSurface doc={game.doc} />}
    </div>
  )
}

/** Placeholder with the proportions of an A4 sheet, so nothing jumps on arrival. */
function PreviewSkeleton(): JSX.Element {
  return (
    <div className="flex w-full flex-col items-center py-6">
      <div
        className="relative w-full max-w-[520px] overflow-hidden rounded-[3px] bg-surface shadow-page"
        style={{ aspectRatio: '210 / 297' }}
      >
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-ink/[0.045] to-transparent" />
      </div>
      <p className="mt-4 text-xs font-medium text-ink-muted">Generating…</p>
    </div>
  )
}

const THEME_OPTIONS: ReadonlyArray<{ id: ThemeMode; label: string; Icon: typeof Sun }> = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'system', label: 'Match system', Icon: Monitor },
  { id: 'dark', label: 'Dark', Icon: Moon },
]

function ThemeToggle({
  mode,
  onChange,
}: {
  mode: ThemeMode
  onChange: (mode: ThemeMode) => void
}): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-xl bg-surface-sunken p-1 ring-1 ring-inset ring-line"
    >
      {THEME_OPTIONS.map(({ id, label, Icon }) => {
        const active = mode === id
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(id)}
            className={`grid h-7 w-7 place-items-center rounded-lg transition duration-200 ${
              active ? 'bg-surface text-accent shadow-panel' : 'text-ink-subtle hover:text-ink'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

function Header({
  game,
  busy,
  themeMode,
  onThemeChange,
  onRegenerate,
  onPrint,
  onDownload,
  onOpenPdf,
}: {
  game: GeneratedGame | null
  busy: boolean
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
  onRegenerate: () => void
  onPrint: () => void
  onDownload: () => void
  onOpenPdf: () => void
}): JSX.Element {
  return (
    <header className="flex shrink-0 flex-col gap-2.5 border-b border-line bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-[11px] font-black tracking-tight text-accent-ink shadow-panel"
        >
          PG
        </span>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-bold tracking-tight text-ink">Printable Games Generator</h1>
          <p className="hidden items-center gap-1.5 text-[11px] text-ink-muted sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
            Runs entirely on this device — no account, no internet
          </p>
        </div>
        {busy && <span className="ml-auto shrink-0 text-xs text-ink-subtle sm:hidden">Generating…</span>}
      </div>

      <div className="flex items-center gap-2 sm:ml-auto">
        {busy && <span className="hidden text-xs text-ink-subtle sm:inline">Generating…</span>}
        <div className="hidden sm:block">
          <ThemeToggle mode={themeMode} onChange={onThemeChange} />
        </div>

        {/* Four equal columns on a phone; the labels shorten so they fit at 320px. */}
        <div className="grid w-full grid-cols-4 gap-1.5 sm:flex sm:w-auto sm:gap-2">
          <Button onClick={onRegenerate} title="New content with the same settings" className="px-2 sm:px-3.5">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">Generate another</span>
          </Button>
          <Button
            onClick={onOpenPdf}
            disabled={!game}
            title="Open the PDF in a new tab without saving it"
            className="px-2 sm:px-3.5"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sm:hidden">Open</span>
            <span className="hidden sm:inline">Preview PDF</span>
          </Button>
          <Button onClick={onPrint} disabled={!game} className="px-2 sm:px-3.5">
            <Printer className="h-3.5 w-3.5" aria-hidden />
            Print
          </Button>
          <Button variant="primary" onClick={onDownload} disabled={!game} className="px-2 sm:px-3.5">
            <Download className="h-3.5 w-3.5" aria-hidden />
            <span className="sm:hidden">Save</span>
            <span className="hidden sm:inline">Download PDF</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

/**
 * Bottom tab bar, phones and small tablets only.
 *
 * Below lg the shell shows one column at a time, so the sections that sit
 * side by side on a desktop need somewhere to be switched from. It is a normal
 * flex child rather than a fixed overlay, which keeps it clear of the scrolling
 * content without any padding compensation, and it carries the iOS home-bar
 * inset so the labels are not sitting under the indicator.
 */
function MobileNav({
  tab,
  onSelect,
  historyCount,
  hasPack,
}: {
  tab: Tab
  onSelect: (tab: Tab) => void
  historyCount: number
  hasPack: boolean
}): JSX.Element {
  const items = [
    { id: 'setup' as const, label: 'Set up', Icon: SlidersHorizontal },
    { id: 'preview' as const, label: 'Preview', Icon: FileText },
    { id: 'ai' as const, label: 'AI', Icon: Sparkles },
    { id: 'history' as const, label: 'History', Icon: Clock },
  ]

  return (
    <nav
      aria-label="Sections"
      className="flex shrink-0 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map(({ id, label, Icon }) => {
        const active = tab === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={id === 'history' ? `History, ${historyCount} saved` : label}
            className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition ${
              active ? 'text-accent' : 'text-ink-subtle hover:text-ink'
            }`}
          >
            {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent" />}
            <span className="relative">
              <Icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
              {id === 'history' && historyCount > 0 && (
                <span
                  aria-hidden
                  className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-accent px-1 text-center text-[9px] font-bold leading-[15px] text-accent-ink"
                >
                  {historyCount > 99 ? '99+' : historyCount}
                </span>
              )}
              {id === 'ai' && hasPack && (
                <span
                  className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-ok ring-2 ring-surface"
                  title="A content pack is active"
                />
              )}
            </span>
            {label}
          </button>
        )
      })}
    </nav>
  )
}
