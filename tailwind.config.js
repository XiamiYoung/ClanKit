/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3B82F6',
          dark:    '#1D4ED8',
          light:   '#60A5FA',
        },
        accent:  '#F97316',
        bg: {
          main:    '#F8FAFC',
          card:    '#ffffff',
          sidebar: '#0F172A',
        },
        text: {
          primary:   '#1E293B',
          secondary: '#475569',
          muted:     '#64748B',
        },
        border: {
          DEFAULT: '#E2E8F0',
          focus:   '#3B82F6',
        },
      },
      fontFamily: {
        sans:    ['Noto Sans', 'system-ui', 'sans-serif', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'emoji'],
        heading: ['Figtree', 'system-ui', 'sans-serif', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'emoji'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in':    'fadeIn 200ms ease-out',
        'slide-in':   'slideIn 200ms ease-out',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite'
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        }
      },
      boxShadow: {
        card:       '0 2px 8px rgba(15, 23, 42, 0.06)',
        'card-hover': '0 4px 16px rgba(15, 23, 42, 0.12)',
      }
    }
  },
  plugins: []
}
