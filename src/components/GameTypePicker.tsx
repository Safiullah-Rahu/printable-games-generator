import { useMemo, useState } from 'react'
import { Search, Sparkles, X } from 'lucide-react'
import { generatorsByCategory } from '../engines/registry'
import { PRESETS, type Preset } from '../engines/config'

/**
 * Game-type picker. Reads straight from the generator registry, so a newly
 * registered generator shows up here with no changes to this file.
 */
export function GameTypePicker({
  value,
  onSelect,
  onPreset,
}: {
  value: string
  onSelect: (id: string) => void
  onPreset: (preset: Preset) => void
}): JSX.Element {
  const groups = useMemo(() => generatorsByCategory(), [])
  const [query, setQuery] = useState('')
  const [showPresets, setShowPresets] = useState(false)

  const needle = query.trim().toLowerCase()
  const filtered = needle
    ? groups
        .map((group) => ({
          ...group,
          games: group.games.filter(
            (g) =>
              g.name.toLowerCase().includes(needle) ||
              g.description.toLowerCase().includes(needle) ||
              g.category.includes(needle),
          ),
        }))
        .filter((group) => group.games.length > 0)
    : groups

  const visiblePresets = needle
    ? PRESETS.filter(
        (p) =>
          p.label.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle),
      )
    : PRESETS

  const matchCount = filtered.reduce((n, g) => n + g.games.length, 0)

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 18 game types…"
            aria-label="Search game types"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-9 text-sm text-ink shadow-inset outline-none transition placeholder:text-ink-subtle hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent/15 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-ink-subtle transition hover:bg-surface-sunken hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowPresets((v) => !v)}
          aria-pressed={showPresets}
          // The label is hidden at narrow widths, so name the button explicitly.
          aria-label="Quick starts"
          title="Ready-made setups for common classroom games"
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition duration-200 active:scale-[0.97] ${
            showPresets
              ? 'bg-accent text-accent-ink shadow-panel'
              : 'bg-surface text-ink ring-1 ring-line hover:bg-surface-sunken'
          }`}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline lg:hidden xl:inline">Quick starts</span>
        </button>
      </div>

      {showPresets && (
        <div className="animate-fade-rise rounded-2xl border border-line bg-surface-sunken p-3">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
            Ready-made setups
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {visiblePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onPreset(preset)
                  setShowPresets(false)
                }}
                className="rounded-xl bg-surface px-3 py-2.5 text-left ring-1 ring-line transition duration-200 hover:-translate-y-px hover:shadow-panel hover:ring-accent/40 active:translate-y-0"
              >
                <span className="block text-sm font-semibold text-ink">{preset.label}</span>
                <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-ink-muted">
                  {preset.description}
                </span>
              </button>
            ))}
            {visiblePresets.length === 0 && (
              <p className="col-span-full py-2 text-sm text-ink-muted">
                No quick start matches that search.
              </p>
            )}
          </div>
        </div>
      )}

      {filtered.map((group) => (
        <section key={group.category}>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
            {group.label}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.games.map((game) => {
              const active = game.id === value
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => onSelect(game.id)}
                  aria-pressed={active}
                  title={game.description}
                  className={`group flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition duration-200 ${
                    active
                      ? 'bg-accent text-accent-ink shadow-panel'
                      : 'bg-surface text-ink ring-1 ring-line hover:-translate-y-px hover:shadow-panel hover:ring-accent/40 active:translate-y-0'
                  }`}
                >
                  <span
                    className={`mt-px grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold tracking-tight transition ${
                      active
                        ? 'bg-white/20 text-accent-ink'
                        : 'bg-surface-sunken text-ink-subtle group-hover:bg-accent-soft group-hover:text-accent'
                    }`}
                  >
                    {game.glyph}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{game.name}</span>
                    <span
                      className={`mt-1 line-clamp-2 block text-xs leading-relaxed ${
                        active ? 'text-accent-ink/75' : 'text-ink-muted'
                      }`}
                    >
                      {game.description}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {matchCount === 0 && (
        <p className="rounded-2xl border border-dashed border-line-strong py-8 text-center text-sm text-ink-muted">
          No game type matches “{query}”.
        </p>
      )}
    </div>
  )
}
