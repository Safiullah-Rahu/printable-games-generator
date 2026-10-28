import type { ReactNode } from 'react'

/**
 * Form primitives shared by every panel.
 *
 * Nothing here names a colour. Each control reaches for a role - surface, line,
 * ink, accent - which the theme re-points, so light and dark are one codepath
 * and a palette change is a variable edit rather than a sweep through JSX.
 */

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <label
          htmlFor={htmlFor}
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted"
        >
          {label}
        </label>
        {hint && <span className="text-[11px] tabular-nums text-ink-subtle">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export interface Option<T extends string> {
  value: T
  label: string
  description?: string
}

const FIELD_BASE =
  'w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-ink shadow-inset outline-none transition ' +
  'placeholder:text-ink-subtle hover:border-line-strong focus:border-accent focus:ring-4 focus:ring-accent/15'

export function Select<T extends string>({
  value,
  options,
  onChange,
  id,
  disabled,
}: {
  value: T
  options: ReadonlyArray<Option<T>>
  onChange: (value: T) => void
  id?: string
  disabled?: boolean
}): JSX.Element {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={`${FIELD_BASE} cursor-pointer appearance-none pr-9 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-subtle`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle"
      >
        <path
          d="M4 6.5l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: ReadonlyArray<Option<T>>
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div className="flex rounded-xl bg-surface-sunken p-1 ring-1 ring-inset ring-line" role="radiogroup">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            title={o.description}
            className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition duration-200 ${
              active
                ? 'bg-surface text-ink shadow-panel'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  id,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  id?: string
}): JSX.Element {
  // Fill the track up to the thumb so the control reads at a glance.
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        background: `linear-gradient(to right, rgb(var(--accent)) ${pct}%, rgb(var(--line)) ${pct}%)`,
      }}
      className="h-2 w-full cursor-pointer appearance-none rounded-full outline-none transition
        [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none
        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px]
        [&::-webkit-slider-thumb]:border-surface [&::-webkit-slider-thumb]:bg-accent
        [&::-webkit-slider-thumb]:shadow-pop [&::-webkit-slider-thumb]:transition
        [&::-webkit-slider-thumb]:hover:scale-110
        [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full
        [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-surface [&::-moz-range-thumb]:bg-accent"
    />
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-start gap-3 rounded-xl px-1.5 py-2 text-left transition hover:bg-surface-sunken"
    >
      <span
        className={`mt-0.5 flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[3px] transition duration-300 ease-spring ${
          checked ? 'bg-accent' : 'bg-line-strong'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 ease-spring ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{description}</span>
        )}
      </span>
    </button>
  )
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  title,
  className = '',
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  title?: string
  className?: string
  type?: 'button' | 'submit'
}): JSX.Element {
  const styles: Record<string, string> = {
    primary:
      'bg-accent text-accent-ink shadow-panel hover:bg-accent-hover disabled:bg-line-strong disabled:text-ink-subtle disabled:shadow-none',
    secondary:
      'bg-surface text-ink ring-1 ring-line hover:border-line-strong hover:bg-surface-sunken disabled:text-ink-subtle',
    ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink disabled:text-ink-subtle',
    danger: 'text-danger hover:bg-danger-soft disabled:text-ink-subtle',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold
        transition duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100
        ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

/** Square, icon-only button. Sized for touch, shrunk on pointer devices. */
export function IconButton({
  children,
  onClick,
  label,
  active,
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  label: string
  active?: boolean
  disabled?: boolean
  className?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition duration-200
        active:scale-90 disabled:cursor-not-allowed disabled:text-ink-subtle ${
          active ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
        } ${className}`}
    >
      {children}
    </button>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  id,
  mono,
  type = 'text',
  autoComplete,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  mono?: boolean
  type?: string
  autoComplete?: string
}): JSX.Element {
  return (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      autoComplete={autoComplete}
      spellCheck={mono ? false : undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`${FIELD_BASE} ${mono ? 'font-mono text-xs' : ''}`}
    />
  )
}

export function SectionHeading({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">{children}</h2>
      {action}
    </div>
  )
}

/** Small count / status pill. */
export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'ok' | 'warn'
}): JSX.Element {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-sunken text-ink-muted ring-line',
    accent: 'bg-accent-soft text-accent ring-accent/20',
    ok: 'bg-ok-soft text-ok ring-ok/20',
    warn: 'bg-warn-soft text-warn ring-warn/20',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
