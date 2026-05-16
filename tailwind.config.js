/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Almanac dark (brand navy) theme
        'app-bg': '#0A1426',
        'app-surface': '#0F1A2E',
        'app-surface2': '#152540',
        'app-text': '#F5F8FF',
        'app-muted': 'rgba(220,232,255,0.65)',
        'app-faint': 'rgba(220,232,255,0.38)',
        'app-accent': '#2563EB',
        'app-pos': '#5EE2E8',
        'app-neg': '#FF6B6B',
        // Light mode
        'app-bg-light': '#FAFAFA',
        'app-surface-light': '#FFFFFF',
        'app-surface2-light': '#F2F2F4',
        'app-text-light': '#08080A',
        'app-accent-ink-dark': '#0A1426',
        'app-accent-ink-light': '#FFFFFF',
      },
      fontFamily: {
        sans: ['Inter_400Regular', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['JetBrainsMono_400Regular', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
