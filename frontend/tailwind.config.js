const colors = require("tailwindcss/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    transparent: "transparent",
    current: "currentColor",
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        ink: "#16203A",
        slate: { ...colors.slate, DEFAULT: "#5A6478" },
        paper: "#F2F4F7",
        surface: "#FFFFFF",
        hairline: "#DBE0E8",
        teal: { DEFAULT: "#0F766E", 50: "#EFFBF8", 100: "#D5F3EC", 600: "#0F766E", 700: "#115E59" },
        brass: { DEFAULT: "#A8801C", 50: "#FBF6E7", 100: "#F3E7BE", 600: "#A8801C", 700: "#876619" },
        rag: { red: "#DC2626", amber: "#C2700A", green: "#0F8A5F" },
        tremor: {
          brand: { faint: "#EFFBF8", muted: "#D5F3EC", subtle: "#5EC7BB", DEFAULT: "#0F766E", emphasis: "#115E59", inverted: "#FFFFFF" },
          background: { muted: "#F2F4F7", subtle: "#F8FAFC", DEFAULT: "#FFFFFF", emphasis: "#374151" },
          border: { DEFAULT: "#DBE0E8" },
          ring: { DEFAULT: "#DBE0E8" },
          content: { subtle: "#94A3B8", DEFAULT: "#5A6478", emphasis: "#334155", strong: "#16203A", inverted: "#FFFFFF" },
        },
      },
      boxShadow: {
        "tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "tremor-card": "0 1px 3px 0 rgb(22 32 58 / 0.08), 0 1px 2px -1px rgb(22 32 58 / 0.06)",
        "tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        card: "0 1px 3px 0 rgb(22 32 58 / 0.08), 0 1px 2px -1px rgb(22 32 58 / 0.06)",
      },
      borderRadius: { "tremor-small": "0.375rem", "tremor-default": "0.5rem", "tremor-full": "9999px" },
      fontSize: {
        "tremor-label": ["0.75rem", { lineHeight: "1rem" }],
        "tremor-default": ["0.875rem", { lineHeight: "1.25rem" }],
        "tremor-title": ["1.125rem", { lineHeight: "1.75rem" }],
        "tremor-metric": ["1.875rem", { lineHeight: "2.25rem" }],
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(220, 38, 38, 0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(220, 38, 38, 0)" },
        },
      },
      animation: { "pulse-glow": "pulse-glow 2s ease-in-out infinite" },
    },
  },
  safelist: [
    { pattern: /^(bg|text|border|ring|stroke|fill)-(tremor|rag|teal|brass)-(brand|background|border|ring|content|red|amber|green|faint|muted|subtle|DEFAULT|emphasis|inverted|strong)?-?(faint|muted|subtle|DEFAULT|emphasis|inverted|strong)?/ },
    { pattern: /^(bg|text|border|ring|stroke|fill)-(slate|emerald|red|amber|rose|green|teal)-(50|100|200|300|400|500|600|700|800|900)$/, variants: ["hover", "ui-selected"] },
  ],
  plugins: [require("@headlessui/tailwindcss"), require("@tailwindcss/forms")],
};
