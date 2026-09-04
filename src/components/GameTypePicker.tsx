import { useMemo, useState } from 'react'
import { generatorsByCategory } from '../engines/registry'
import { PRESETS, type Preset } from '../engines/config'
import { Button } from './ui/controls'

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
    ? PRESETS.filter((p) => p.label.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle))
    : PRESETS

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search game types…"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10"
        />
        <Button
          variant={showPresets ? 'primary' : 'secondary'}
          onClick={() => setShowPresets((v) => !v)}
          title="Ready-made setups for common classroom games"
        >
          Quick starts
        </Button>
      </div>

      {showPresets && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Ready-made setups
          </p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {visiblePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onPreset(preset)
                  setShowPresets(false)
                }}
                className="rounded-lg bg-white px-3 py-2 text-left ring-1 ring-slate-200 transition hover:ring-slate-900/30"
              >
                <span className="block text-sm font-medium text-slate-900">{preset.label}</span>
                <span className="block text-xs leading-snug text-slate-500">{preset.description}</span>
              </button>
            ))}
            {visiblePresets.length === 0 && (
              <p className="col-span-full py-2 text-sm text-slate-500">No quick start matches that search.</p>
            )}
          </div>
        </div>
      )}

      {filtered.map((group) => (
        <section key={group.category}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</h3>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {group.games.map((game) => {
              const active = game.id === value
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => onSelect(game.id)}
                  aria-pressed={active}
                  className={`group flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition ${
                    active
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:ring-slate-900/30'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-[10px] font-bold tracking-tight ${
                      active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {game.glyph}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-tight">{game.name}</span>
                    <span
                      className={`mt-0.5 block text-xs leading-snug ${active ? 'text-white/70' : 'text-slate-500'}`}
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

      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">No game type matches "{query}".</p>
      )}
    </div>
  )
}
