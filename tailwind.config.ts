import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/ui/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        scout: {
          app: "var(--bg-app)",
          page: "var(--bg-page)",
          card: "var(--bg-card)",
          border: "var(--border)",
          input: "var(--border-input)",
          text: "var(--text)",
          muted: "var(--text-muted)",
          brand: "var(--brand)",
          accent: "var(--brand-accent)",
          ink: "var(--ink-button)",
          chart: "var(--chart)",
          "nav-active": "var(--nav-active-bg)",
        },
        // Compatibility aliases used by existing screens
        uncc: {
          green: "var(--brand)",
          forest: "var(--brand)",
          gold: "var(--brand-accent)",
          ink: "var(--text)",
          paper: "var(--bg-page)",
          mist: "var(--bg-page)",
          rule: "var(--border)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        serif: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      fontSize: {
        "scout-title": ["22px", { lineHeight: "1.25", fontWeight: "700", letterSpacing: "-0.3px" }],
        "scout-card": ["17px", { lineHeight: "1.3", fontWeight: "600", letterSpacing: "-0.2px" }],
        "scout-kpi": ["27px", { lineHeight: "1.15", fontWeight: "700", letterSpacing: "-0.4px" }],
        "scout-body": ["13.5px", { lineHeight: "1.45" }],
        "scout-caption": ["11.5px", { lineHeight: "1.4" }],
      },
      borderRadius: {
        scout: "16px",
        "scout-control": "11px",
        "scout-pill": "999px",
      },
      boxShadow: {
        scout: "var(--shadow-card)",
        "scout-window": "var(--shadow-window)",
        "scout-hover": "var(--shadow-hover)",
      },
      spacing: {
        "scout-gutter": "26px",
        "scout-gap": "14px",
        "scout-sidebar": "270px",
      },
    },
  },
  plugins: [],
};

export default config;
