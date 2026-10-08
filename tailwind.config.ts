import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        uncc: {
          green: "#005035",
          forest: "#0b3d2e",
          gold: "#A49665",
          ink: "#14231c",
          paper: "#f6f4ef",
          mist: "#e7eee9",
          rule: "#d5ddd7",
        },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["Source Serif 4", "ui-serif", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
