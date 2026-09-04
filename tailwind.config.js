/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: { 950: '#0b1120', 900: '#0f172a', 800: '#1e293b', 700: '#334155' },
      },
      boxShadow: {
        panel: '0 1px 2px rgba(15,23,42,.06), 0 8px 24px -12px rgba(15,23,42,.25)',
        page: '0 2px 8px rgba(15,23,42,.10), 0 24px 48px -24px rgba(15,23,42,.45)',
      },
    },
  },
  plugins: [],
}
