/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#4A72FF",
          dark: "#3560E8",
          light: "#E8ECFF",
        },
        accent: "#8B6CF6",
        success: "#10B981",
        danger: "#EF4444",
        warning: "#F59E0B",
        "bg-body": "#EEF1F6",
        "bg-primary": "#EEF1F6",
        "bg-secondary": "#FFFFFF",
        "bg-card": "#FFFFFF",
        "bg-hover": "#F5F6FA",
        "bg-tag": "#EEF2FF",
        "text-primary": "#1E293B",
        "text-secondary": "#475569",
        "text-muted": "#94A3B8",
        border: "#E8ECF2",
        "border-light": "#F0F2F6",
      },
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', '"PingFang SC"', '"Hiragino Sans GB"', '"Microsoft YaHei"', 'sans-serif'],
      },
      letterSpacing: {
        tight: '-0.02em',
        normal: '0',
        wide: '0.02em',
      },
      boxShadow: {
        'xs': '0 1px 2px rgba(0,0,0,0.03)',
        'sm': '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'md': '0 4px 20px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.03)',
        'lg': '0 8px 40px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
        'xl': '0 16px 60px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.04)',
        'card': '0 2px 12px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)',
        'card-hover': '0 8px 30px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.03)',
        'nav': '0 2px 12px rgba(0,0,0,0.03)',
        'fab': '0 4px 24px rgba(74,114,255,0.12), 0 2px 8px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '20px',
      },
      width: {
        sidebar: "260px",
        "ai-panel": "310px",
      },
      height: {
        header: "56px",
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
};
