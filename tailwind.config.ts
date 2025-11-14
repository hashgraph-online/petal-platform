import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./providers/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-roboto)", "Roboto", "system-ui", "sans-serif"],
        mono: ["var(--font-roboto-mono)", "Roboto Mono", "ui-monospace", "SFMono-Regular"],
      },
      colors: {
        // Lightened palette for better contrast on dark backgrounds
        holNavy: "#dfe5ff",
        holBlue: "#6aa9ff",
        holPurple: "#c3a4ff",
        holGreen: "#76f5aa",
      },
    },
  },
  plugins: [],
};

export default config;
