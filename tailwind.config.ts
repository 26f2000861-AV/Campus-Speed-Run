import type { Config } from "tailwindcss";

// Dark slate system (DESIGN.md): built on Tailwind's default slate / red / amber /
// indigo / emerald scales — no custom palette needed.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: [
          'var(--font-serif)',
          '"Playfair Display"',
          'Didot',
          '"Bodoni MT"',
          'Georgia',
          'serif',
        ],
        sans: [
          'var(--font-sans)',
          '"Plus Jakarta Sans"',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          '"JetBrains Mono"',
          '"SF Mono"',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
