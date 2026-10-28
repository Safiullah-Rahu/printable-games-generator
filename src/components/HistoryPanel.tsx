import { Copy, FileText, Trash2 } from 'lucide-react'
import { formatDateTime } from '../utils/misc'
import type { HistoryEntry } from '../utils/storage'
import { SectionHeading } from './ui/controls'

/**
 * Recent games. Entries store only the configuration, so "Open" re-runs the
 * deterministic pipeline and "Duplicate" is just the same configuration with a
 * fresh seed.
 */

function gradeLabel(grade: string): string {
  if (grade === 'adult') return 'Adult'
  if (grade === 'K') return 'Kindergarten'
  return `Grade ${grade}`
}

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
              className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-ink-subtle transition hover:bg-danger-soft hover:text-danger"
            >
              Clear all
            </button>
          ) : undefined
        }
      >
        Recent games ({entries.length})
      </SectionHeading>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-10 text-center">
          <FileText className="mx-auto h-6 w-6 text-ink-subtle" aria-hidden />
          <p className="mt-3 text-sm font-medium text-ink">Nothing generated yet</p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-xs leading-relaxed text-ink-muted">
            Games you make are saved here, in this browser only. Nothing is uploaded anywhere.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const active = entry.id === activeId
            return (
              <li
                key={entry.id}
                className={`group rounded-xl px-3 py-2.5 transition duration-200 ${
                  active
                    ? 'bg-accent-soft ring-1 ring-accent/35'
                    : 'ring-1 ring-line hover:bg-surface-sunken hover:ring-line-strong'
                }`}
              >
                <button type="button" onClick={() => onOpen(entry)} className="block w-full text-left">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                      {entry.title}
                    </span>
                    {active && (
                      <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-ink">
                        Open
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">
                    {entry.generatorName} · {entry.summary}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-subtle">
                    <span>{gradeLabel(entry.config.grade)}</span>
                    <span aria-hidden>·</span>
                    <span className="capitalize">{entry.config.difficulty.replace('-', ' ')}</span>
                    <span aria-hidden>·</span>
                    <span>{entry.pageCount} pages</span>
                    <span aria-hidden>·</span>
                    <span>{formatDateTime(entry.createdAt)}</span>
                  </span>
                </button>

                {/* Revealed on hover with a pointer, always present for keyboard
                    and touch - opacity alone would hide them on a phone. */}
                <div className="mt-2 flex gap-1 transition group-focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => onDuplicate(entry)}
                    title="Same settings, new content"
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-muted transition hover:bg-surface hover:text-ink"
                  >
                    <Copy className="h-3 w-3" aria-hidden />
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-ink-subtle transition hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
