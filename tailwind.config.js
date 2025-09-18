import typography from "@tailwindcss/typography";

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
        }
      },
      boxShadow: {
        soft: "0 4px 16px -4px rgba(0,0,0,0.08)"
      }
    }
  },
  plugins: [typography]
};
