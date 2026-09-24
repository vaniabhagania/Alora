/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // "ink" is the theme's foreground-tint color for subtle borders/fills
        // (dark plum in light mode, white in dark mode) — see applyTheme().
        // Kept separate from Tailwind's literal `black`/`white` so the few
        // places that intentionally stay fixed-dark (world side panel,
        // moodboard canvas, per-world preview cards) are unaffected.
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
