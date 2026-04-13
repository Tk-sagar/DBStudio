import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(__dirname, './index.html'),
    path.join(__dirname, './src/**/*.{js,ts,jsx,tsx}'),
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        base:    '#09090b',
        surface: '#111113',
        raised:  '#1c1c1f',
        overlay: '#232329',
        violet: {
          DEFAULT: '#7c3aed',
          hover:   '#6d28d9',
          subtle:  'rgba(124,58,237,0.12)',
          border:  'rgba(124,58,237,0.28)',
          glow:    'rgba(124,58,237,0.18)',
        },
      },
      boxShadow: {
        'glow-violet': '0 0 0 1px rgba(124,58,237,0.4), 0 0 20px rgba(124,58,237,0.15)',
        'card':        '0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.25)',
        'modal':       '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'gradient-violet':  'linear-gradient(135deg, #7c3aed, #6366f1)',
        'gradient-surface': 'linear-gradient(180deg, #151518 0%, #111113 100%)',
      },
      animation: {
        'spin-fast': 'spin 0.6s linear infinite',
      },
    },
  },
  plugins: [],
};
