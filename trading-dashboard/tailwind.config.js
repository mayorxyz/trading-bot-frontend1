/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Numeric / data face. Geometric, squared terminals — instrument-panel character.
        mono: ['"Azeret Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        // Label / header face. Condensed grotesque.
        sans: ['"Archivo Narrow"', "system-ui", "-apple-system", "sans-serif"],
      },
      fontSize: {
        eyebrow: ["10px", { lineHeight: "1", letterSpacing: "0.18em" }],
        label: ["11px", { lineHeight: "1.2", letterSpacing: "0.06em" }],
        "data-xs": ["10px", { lineHeight: "1.3", letterSpacing: "0" }],
        "data-sm": ["11px", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        data: ["13px", { lineHeight: "1.4", letterSpacing: "-0.02em" }],
        "data-lg": ["20px", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
        hero: ["30px", { lineHeight: "1", letterSpacing: "-0.04em" }],
      },
      colors: {
        // ── Structure (achromatic, cold-shifted graphite) ──────────────────
        void: "#08090C",
        bay: "#0C0E13",
        well: "#10131A",
        rule: "#191D26",
        "rule-bright": "#252A36",
        etch: "#5A6472",
        "etch-dim": "#3A4250",
        signal: "#E8ECF2",

        // ── Interactive accent. Edges, focus, needle. Never a surface fill. ─
        arc: {
          DEFAULT: "#00D9FF",
          dim: "#0B7C93",
        },

        // ── Trade semantics ONLY. Never chrome, never accent. ──────────────
        long: "#00E08A",
        short: "#FF4D5E",
        flat: "#6B7280",

        // Aliases mapped onto the semantic set so existing intent survives.
        win: "#00E08A",
        loss: "#FF4D5E",
        neutral: "#6B7280",

        // Tailwind/shadcn-compatible aliases used by leftover utility classes.
        border: "#191D26",
        background: "#08090C",
        foreground: "#E8ECF2",
      },
      borderRadius: {
        // Structural surfaces are square. Radius only on interactive pills.
        none: "0",
        pill: "2px",
      },
      keyframes: {
        "tick-up": {
          "0%": { backgroundColor: "rgba(0, 224, 138, 0.22)", color: "#00E08A" },
          "100%": { backgroundColor: "rgba(0, 224, 138, 0)", color: "#E8ECF2" },
        },
        "tick-down": {
          "0%": { backgroundColor: "rgba(255, 77, 94, 0.22)", color: "#FF4D5E" },
          "100%": { backgroundColor: "rgba(255, 77, 94, 0)", color: "#E8ECF2" },
        },
        "zone-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        "sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
      },
      animation: {
        "tick-up": "tick-up 480ms cubic-bezier(0.2, 0, 0.4, 1)",
        "tick-down": "tick-down 480ms cubic-bezier(0.2, 0, 0.4, 1)",
        "zone-in": "zone-in 420ms cubic-bezier(0.2, 0, 0.4, 1) both",
        "pulse-dot": "pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        sweep: "sweep 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      transitionTimingFunction: {
        // Needle swing: settles with a slight overshoot. The one physical motion.
        needle: "cubic-bezier(0.34, 1.42, 0.64, 1)",
      },
    },
  },
  plugins: [],
};
