import { formatDateTime } from '../utils/misc'
import type { HistoryEntry } from '../utils/storage'
import { Button, SectionHeading } from './ui/controls'

/**
 * Recent games. Entries store only the configuration, so "Open" re-runs the
 * deterministic pipeline and "Duplicate" is just the same configuration with a
 * fresh seed.
 */
export function HistoryPanel({
  entries,
  activeId,
  onOpen,
  onDuplicate,
  onRemove,
  onClear,
}: {
  entries: HistoryEntry[]
  activeId?: string
  onOpen: (entry: HistoryEntry) => void
  onDuplicate: (entry: HistoryEntry) => void
  onRemove: (id: string) => void
  onClear: () => void
}): JSX.Element {
  return (
    <div>
      <SectionHeading
        action={
          entries.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] font-medium text-slate-400 transition hover:text-red-600"
            >
              Clear all
            </button>
          ) : undefined
        }
      >
        Recent games ({entries.length})
      </SectionHeading>

      {entries.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs leading-relaxed text-slate-500">
          Games you generate are saved here, in this browser only.
          <br />
          Nothing is uploaded anywhere.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((entry) => {
            const active = entry.id === activeId
            return (
              <li
                key={entry.id}
                className={`group rounded-lg px-3 py-2.5 transition ${
                  active ? 'bg-slate-900/5 ring-1 ring-slate-900/20' : 'ring-1 ring-slate-200 hover:ring-slate-300'
                }`}
              >
                <button type="button" onClick={() => onOpen(entry)} className="block w-full text-left">
                  <span className="block truncate text-sm font-medium text-slate-900">{entry.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {entry.generatorName} · {entry.summary}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                    <span>
                      {entry.config.grade === 'adult'
                        ? 'Adult'
                        : entry.config.grade === 'K'
                          ? 'Kindergarten'
                          : `Grade ${entry.config.grade}`}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="capitalize">{entry.config.difficulty.replace('-', ' ')}</span>
                    <span aria-hidden>·</span>
                    <span>{entry.pageCount} pages</span>
                    <span aria-hidden>·</span>
                    <span>{formatDateTime(entry.createdAt)}</span>
                  </span>
                </button>

                <div className="mt-1.5 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                  <Button variant="ghost" className="!px-2 !py-1 !text-xs !shadow-none" onClick={() => onOpen(entry)}>
                    Open
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1 !text-xs !shadow-none"
                    onClick={() => onDuplicate(entry)}
                    title="Same settings, new content"
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="danger"
                    className="!ml-auto !px-2 !py-1 !text-xs !shadow-none"
                    onClick={() => onRemove(entry.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
