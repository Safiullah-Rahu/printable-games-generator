import { Clock, FileText, Sparkles, SlidersHorizontal } from 'lucide-react'
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
import { Button } from './components/ui/controls'
import { applyPreset, defaultConfigFor, normalizeConfig, type Preset } from './engines/config'
import { buildProfile } from './engines/difficulty'
import { buildGame, GenerationError, nextSeed } from './engines/pipeline'
import { getGenerator } from './engines/registry'
import { downloadPdf, pdfBlobUrl } from './pdf/exportPdf'
import type { GameConfig, GeneratedGame } from './types'
import { nowId } from './utils/misc'
import { randomSeed } from './utils/rng'
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

  /* ------------------------------ render ---------------------------- */

  const pageCount = game?.doc.pages.length ?? 0
  // 'preview' has no panel of its own; on a wide screen it must still show one.
  const panelTab: Exclude<Tab, 'preview'> = tab === 'preview' ? 'setup' : tab
  const warnings = game?.validation.issues.filter((i) => i.severity === 'warning') ?? []

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-100 text-slate-900">
      <Header
        game={game}
        busy={busy}
        onRegenerate={regenerate}
        onPrint={handlePrint}
        onDownload={handleDownload}
        onOpenPdf={handleOpenPdf}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* ------------------------- left column ------------------------- */}
        <aside
          className={`w-full min-w-0 shrink-0 flex-col border-slate-200 bg-white lg:flex lg:w-[400px] lg:border-r ${
            tab === 'preview' ? 'hidden' : 'flex'
          }`}
        >
          <div className="hidden gap-1 border-b border-slate-200 px-3 pt-3 lg:flex">
            {(['setup', 'ai', 'history'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-t-lg px-3 py-2 text-sm font-medium capitalize transition ${
                  panelTab === t
                    ? 'bg-white text-slate-900 shadow-[inset_0_-2px_0_0_theme(colors.slate.900)]'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t === 'setup' ? 'Set up' : t === 'ai' ? (pack ? 'AI ✦' : 'AI') : `History (${history.length})`}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
              <div className="space-y-6">
                <section>
                  <h2 className="mb-3 border-b border-slate-200 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
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
        <main
          className={`min-w-0 flex-1 flex-col lg:flex ${tab === 'preview' ? 'flex' : 'hidden'}`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {game?.meta.title ?? 'No preview'}
              </p>
              <p className="truncate text-xs text-slate-500">
                {game
                  ? `${generator?.name} · ${game.meta.variant} · ${pageCount} page${pageCount === 1 ? '' : 's'}`
                  : 'Adjust the settings to generate a game.'}
              </p>
            </div>

            {pageCount > 1 && (
              <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setPageIndex(undefined)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                    pageIndex === undefined ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
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
                    className={`rounded-md px-2 py-1 text-xs font-medium tabular-nums transition ${
                      pageIndex === i ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(20, Math.round(Math.min(z, fitZoom)) - 12))}
                className="grid h-9 w-9 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:h-7 sm:w-7"
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="w-10 text-center text-xs tabular-nums text-slate-500">
                {zoom >= fitZoom ? 'Fit' : `${zoom}%`}
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(200, Math.round(Math.min(z, fitZoom)) + 12))}
                className="grid h-9 w-9 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 sm:h-7 sm:w-7"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
              {warnings.length} layout note{warnings.length === 1 ? '' : 's'}: {warnings[0].message}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto bg-slate-200/60 px-2 sm:px-4">
            {error ? (
              <div className="mx-auto mt-16 max-w-md rounded-xl bg-white p-6 text-center shadow-panel">
                <p className="text-sm font-semibold text-red-600">Could not generate this game</p>
                <p className="mt-2 text-sm text-slate-600">{error.message}</p>
                {error.details.length > 0 && (
                  <ul className="mt-3 space-y-1 text-left text-xs text-slate-500">
                    {error.details.map((d) => (
                      <li key={d} className="font-mono leading-snug">
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="primary" className="mt-4" onClick={regenerate}>
                  Try another seed
                </Button>
              </div>
            ) : game ? (
              <DocPreview doc={game.doc} zoom={zoom} pageIndex={pageIndex} onFitZoom={setFitZoom} />
            ) : (
              <div className="mt-24 text-center text-sm text-slate-500">Generating…</div>
            )}
          </div>
        </main>

        {/* -------------------------- info rail -------------------------- */}
        {game && (
          <aside className="hidden w-56 shrink-0 flex-col gap-4 border-l border-slate-200 bg-white px-4 py-4 xl:flex">
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">This game</h3>
              <dl className="space-y-1.5">
                {Object.entries(game.meta.stats).map(([key, value]) => (
                  <div key={key} className="flex items-baseline justify-between gap-2">
                    <dt className="truncate text-xs text-slate-500">{key}</dt>
                    <dd className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pages</h3>
              <ol className="space-y-1">
                {game.doc.pages.map((page, i) => (
                  <li key={`${page.label}-${i}`}>
                    <button
                      type="button"
                      onClick={() => setPageIndex(i)}
                      className={`w-full truncate rounded px-1.5 py-1 text-left text-xs transition ${
                        pageIndex === i ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="tabular-nums opacity-60">{i + 1}.</span> {page.label}
                    </button>
                  </li>
                ))}
              </ol>
            </div>

            <div className="mt-auto space-y-1 border-t border-slate-200 pt-3">
              <p className="text-[11px] leading-relaxed text-slate-400">
                Seed
                <br />
                <span className="font-mono text-[10px] text-slate-600">{game.config.seed}</span>
              </p>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Generated in {game.attempts} pass{game.attempts === 1 ? '' : 'es'}, fully offline.
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

function Header({
  game,
  busy,
  onRegenerate,
  onPrint,
  onDownload,
  onOpenPdf,
}: {
  game: GeneratedGame | null
  busy: boolean
  onRegenerate: () => void
  onPrint: () => void
  onDownload: () => void
  onOpenPdf: () => void
}): JSX.Element {
  return (
    <header className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4 sm:py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white">
          PG
        </span>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold">Printable Games Generator</h1>
          <p className="hidden text-[11px] text-slate-500 sm:block">
            Runs entirely on this device — no account, no internet.
          </p>
        </div>
        {busy && <span className="ml-auto shrink-0 text-xs text-slate-400 sm:hidden">Generating…</span>}
      </div>

      {/* Four equal columns on a phone; the labels shorten so they fit at 320px. */}
      <div className="grid grid-cols-4 gap-1.5 sm:ml-auto sm:flex sm:items-center sm:gap-2">
        {busy && <span className="hidden text-xs text-slate-400 sm:inline">Generating…</span>}
        <Button onClick={onRegenerate} title="New content with the same settings" className="px-2 sm:px-3">
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">Generate another</span>
        </Button>
        <Button
          onClick={onOpenPdf}
          disabled={!game}
          title="Open the PDF in a new tab without saving it"
          className="px-2 sm:px-3"
        >
          <span className="sm:hidden">Open</span>
          <span className="hidden sm:inline">Preview PDF</span>
        </Button>
        <Button onClick={onPrint} disabled={!game} className="px-2 sm:px-3">
          Print
        </Button>
        <Button variant="primary" onClick={onDownload} disabled={!game} className="px-2 sm:px-3">
          <span className="sm:hidden">Save</span>
          <span className="hidden sm:inline">Download PDF</span>
        </Button>
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
      className="flex shrink-0 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
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
            className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition ${
              active ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {active && <span className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-slate-900" />}
            <span className="relative">
              <Icon className="h-5 w-5" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
              {id === 'history' && historyCount > 0 && (
                <span
                  aria-hidden
                  className="absolute -right-2 -top-1.5 min-w-[15px] rounded-full bg-slate-900 px-1 text-center text-[9px] font-semibold leading-[15px] text-white"
                >
                  {historyCount > 99 ? '99+' : historyCount}
                </span>
              )}
              {id === 'ai' && hasPack && (
                <span
                  className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white"
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
