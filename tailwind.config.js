/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#6366f1", dark: "#4f46e5" },
        accent: "#f59e0b",
        success: "#22c55e",
        danger: "#ef4444",
        warning: "#f97316",
        "bg-primary": "#0f172a",
        "bg-secondary": "#1e293b",
        "bg-card": "#334155",
        "bg-hover": "#475569",
        "text-primary": "#f1f5f9",
        "text-secondary": "#94a3b8",
        "text-muted": "#64748b",
      },
      width: {
        sidebar: "240px",
        "ai-panel": "320px",
      },
      height: {
        header: "48px",
        statusbar: "28px",
      },
    },
  },
  plugins: [],
};
