import type { Config } from "tailwindcss";

// Campus Pulse+ system (DESIGN.md): near-black ink surfaces, white type, and
// three functional signal colours — ok (resolved), warn (in progress), bad (unresolved).
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#08090B",
          900: "#111318",
          800: "#181A20",
          700: "#20232A",
          600: "#292B32",
          500: "#3A3D46",
        },
        fg: {
          DEFAULT: "#F5F5F5",
          muted: "#A1A1AA",
          // Lifted from zinc-500 so small captions keep ≥5:1 contrast on the dark surfaces.
          subtle: "#8E8E98",
        },
        line: {
          DEFAULT: "#292B32",
          strong: "#3A3D46",
        },
        ok: { DEFAULT: "#22C55E", soft: "#86EFAC" },
        warn: { DEFAULT: "#EAB308", soft: "#FDE047" },
        bad: { DEFAULT: "#EF4444", soft: "#FCA5A5" },
        steel: { DEFAULT: "#8B9BB4", soft: "#C3CDDD" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Geist", "Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-mono)", '"Geist Mono"', '"SF Mono"', "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        "4xl": "1.75rem",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 12px 32px -16px rgba(0,0,0,0.6)",
        lift: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 20px 44px -18px rgba(0,0,0,0.75)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
