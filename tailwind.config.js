/** @type {import('tailwindcss').Config} */

/*
 * Colours are CSS custom properties holding bare RGB triplets, not hex values,
 * so Tailwind can still apply an opacity modifier (bg-surface/60) and so the
 * whole palette can be swapped by flipping one data-theme attribute on <html>.
 * Components never name a literal colour; they name a role.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        /** The workspace behind the sheet. */
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          sunken: token('surface-sunken'),
          raised: token('surface-raised'),
        },
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        ink: {
          DEFAULT: token('ink'),
          muted: token('ink-muted'),
          subtle: token('ink-subtle'),
        },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          soft: token('accent-soft'),
          ink: token('accent-ink'),
        },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        warn: { DEFAULT: token('warn'), soft: token('warn-soft') },
        ok: { DEFAULT: token('ok'), soft: token('ok-soft') },
      },
      boxShadow: {
        panel: '0 1px 2px rgb(var(--shadow) / 0.05), 0 8px 24px -14px rgb(var(--shadow) / 0.22)',
        pop: '0 2px 4px rgb(var(--shadow) / 0.06), 0 12px 32px -12px rgb(var(--shadow) / 0.30)',
        page: '0 1px 2px rgb(var(--shadow) / 0.12), 0 18px 48px -20px rgb(var(--shadow) / 0.45)',
        inset: 'inset 0 1px 2px rgb(var(--shadow) / 0.06)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      transitionTimingFunction: {
        // Slight overshoot. Used on things that appear, never on colour.
        spring: 'cubic-bezier(.22,1.2,.36,1)',
      },
      keyframes: {
        'fade-rise': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-rise': 'fade-rise .32s cubic-bezier(.22,1.2,.36,1) both',
        'fade-in': 'fade-in .25s ease both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}
