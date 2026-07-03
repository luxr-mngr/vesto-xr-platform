/** Color tokens per docs/ERS.md §12.1 — extracted from LUXR CORE brand screenshots. */
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#F3F4FA", dark: "#08090D" },
        surface: { DEFAULT: "#FFFFFF", dark: "#101218" },
        border: { DEFAULT: "rgba(11,12,20,0.08)", dark: "rgba(255,255,255,0.08)" },
        "text-primary": { DEFAULT: "#0B0C14", dark: "#F5F6FA" },
        "text-secondary": { DEFAULT: "#6B7280", dark: "#9AA0AE" },
        accent: {
          DEFAULT: "#3D5AFE",
          light: "#5B7CFA",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
