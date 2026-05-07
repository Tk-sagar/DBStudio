import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{js,ts,jsx,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // ── Zinc — driven by CSS vars so they invert between light/dark ───────
        zinc: {
          50:  'rgb(var(--zinc-50)  / <alpha-value>)',
          100: 'rgb(var(--zinc-100) / <alpha-value>)',
          200: 'rgb(var(--zinc-200) / <alpha-value>)',
          300: 'rgb(var(--zinc-300) / <alpha-value>)',
          400: 'rgb(var(--zinc-400) / <alpha-value>)',
          500: 'rgb(var(--zinc-500) / <alpha-value>)',
          600: 'rgb(var(--zinc-600) / <alpha-value>)',
          700: 'rgb(var(--zinc-700) / <alpha-value>)',
          800: 'rgb(var(--zinc-800) / <alpha-value>)',
          900: 'rgb(var(--zinc-900) / <alpha-value>)',
          950: 'rgb(var(--zinc-950) / <alpha-value>)',
        },
        // ── Surface scale — driven by CSS vars ───────────────────────────────
        base:    'var(--bg)',
        surface: 'var(--surface)',
        raised:  'var(--raised)',
        overlay: 'var(--overlay)',
        // ── Accent ──────────────────────────────────────────────────────────
        violet: {
          DEFAULT: 'var(--violet)',
          hover:   '#7c3aed',
          subtle:  'rgba(139,92,246,0.15)',
          border:  'rgba(139,92,246,0.32)',
          glow:    'rgba(139,92,246,0.22)',
        },
      },
      boxShadow: {
        'glow-violet': '0 0 0 1px rgba(139,92,246,0.45), 0 0 20px rgba(139,92,246,0.20)',
        'card':        '0 1px 3px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
        'modal':       '0 8px 40px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'gradient-violet':  'linear-gradient(135deg, #8b5cf6, #6366f1)',
        'gradient-surface': 'linear-gradient(180deg, var(--raised) 0%, var(--surface) 100%)',
      },
      animation: {
        'spin-fast': 'spin 0.6s linear infinite',
      },
    },
  },
  plugins: [],
};
