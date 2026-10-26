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
  plugins: [
    // `hoverable:` applies only on devices with a real hover (mouse/trackpad). Row actions use
    // `hoverable:opacity-0 hoverable:group-hover:opacity-100`, so on touch tablets (≥768px, which
    // `md:` mistook for desktops) and for keyboard users (group-focus-within) they stay reachable.
    function ({ addVariant }) {
      addVariant('hoverable', '@media (hover: hover) and (pointer: fine)');
    },
  ],
};
