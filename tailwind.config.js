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
          DEFAULT: '#1A1A1A',
          hover:   '#333333',
          light:   '#F5F5F5',
        },
        accent: {
          DEFAULT: '#007AFF',
          hover:   '#0056CC',
          light:   'rgba(0, 122, 255, 0.08)',
        },
        bg: {
          main:    '#F2F2F7',
          card:    '#FFFFFF',
          sidebar: '#FFFFFF',
          hover:   '#F5F5F5',
        },
        text: {
          primary:   '#1A1A1A',
          secondary: '#6B7280',
          muted:     '#9CA3AF',
        },
        border: {
          DEFAULT: '#E5E5EA',
          light:   '#F0F0F0',
          focus:   '#007AFF',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'Noto Sans', 'system-ui', '-apple-system', 'sans-serif', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'emoji'],
        heading: ['Inter', 'Figtree', 'system-ui', '-apple-system', 'sans-serif', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'emoji'],
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        'sm':  '8px',
        'md':  '12px',
        'lg':  '16px',
        'xl':  '20px',
        '2xl': '24px',
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
        'card':       '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08)',
        'card-lg':    '0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)',
      },
      screens: {
        'hd': '1920px',   // HD 1080p baseline
        '4k': '2560px',   // 4K / large display
      },
    }
  },
  plugins: []
}
