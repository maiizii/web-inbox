import typography from "@tailwindcss/typography";
import forms from "@tailwindcss/forms";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#2563eb",
          foreground: "#ffffff"
        },
        bg: {
          light: "#f8fafc",
          dark: "#0f172a"
        },
        accent: "#06B6D4",
        glass: "rgba(255,255,255,0.04)"
      },
      boxShadow: {
        soft: "0 4px 16px -4px rgba(0,0,0,0.08)",
        card: "0 6px 20px rgba(2,6,23,0.5)",
        "md-soft": "0 8px 30px rgba(2,6,23,0.6)"
      },
      borderRadius: {
        "xl-2": "1rem"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular"]
      }
    }
  },
  plugins: [typography, forms]
};
