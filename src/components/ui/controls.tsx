import type { ReactNode } from 'react'

/** Small, dependency-free form primitives shared by the configuration panel. */

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
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </label>
        {hint && <span className="text-[11px] tabular-nums text-slate-400">{hint}</span>}
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
        className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
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
        className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
      >
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
    <div className="flex rounded-lg bg-slate-100 p-0.5" role="radiogroup">
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
            className={`flex-1 rounded-[6px] px-2 py-1.5 text-xs font-medium transition ${
              active
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-900/5'
                : 'text-slate-500 hover:text-slate-800'
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
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900 outline-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-900 [&::-webkit-slider-thumb]:shadow"
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
      className="flex w-full items-start gap-3 rounded-lg px-1 py-1.5 text-left transition hover:bg-slate-50"
    >
      <span
        className={`mt-0.5 flex h-4.5 w-8 shrink-0 items-center rounded-full p-0.5 transition ${
          checked ? 'bg-slate-900' : 'bg-slate-300'
        }`}
        style={{ height: '18px' }}
      >
        <span
          className={`h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0'
          }`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="block text-xs leading-snug text-slate-500">{description}</span>}
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
    primary: 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300',
    secondary: 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 disabled:text-slate-300',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-300',
    danger: 'text-red-600 hover:bg-red-50 disabled:text-red-200',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed ${styles[variant]} ${className}`}
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
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  id?: string
  mono?: boolean
}): JSX.Element {
  return (
    <input
      id={id}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 ${
        mono ? 'font-mono text-xs' : ''
      }`}
    />
  )
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }): JSX.Element {
  return (
    <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</h2>
      {action}
    </div>
  )
}
