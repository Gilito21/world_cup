/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Boldonse', 'Anton', 'Arial Black', 'sans-serif'],
        serif:   ['"Instrument Serif"', '"Times New Roman"', 'serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Editorial palette — same tokens used on the landing.
        cream:      { DEFAULT: '#F4ECD6', 50: '#FAF5E3', 100: '#F4ECD6', 200: '#EBE0BD', 300: '#E5D8A8' },
        paper:      { DEFAULT: '#EDE3C4', 50: '#F1E8CC', 100: '#EDE3C4', 200: '#E0D3A8' },
        ink: {
          DEFAULT: '#0E2A18',
          50:  '#E8EFEA',
          100: '#C5D5C9',
          200: '#9CB7A3',
          300: '#73967D',
          400: '#4A7657',
          500: '#1C4D2C',
          600: '#0E2A18',
          700: '#08200F',
          800: '#051509',
          900: '#020A04',
        },
        terracotta: {
          DEFAULT: '#C8552B',
          300: '#E58A2E',
          400: '#D86A2A',
          500: '#C8552B',
          600: '#A8421F',
          700: '#883315',
        },
        grass: {
          300: '#7BB661',
          500: '#2F7D3B',
          600: '#1C4D2C',
        },
        // `brand` previously aliased to amber. Re-aliased to terracotta so
        // any lingering `brand-*` usages pick up the editorial accent.
        brand: {
          50:  '#FBE5DA',
          100: '#F6CAB1',
          200: '#EFA688',
          300: '#E58A2E',
          400: '#D86A2A',
          500: '#C8552B',
          600: '#A8421F',
          700: '#883315',
          800: '#5C220E',
          900: '#3A1408',
        },
      },
      animation: {
        'fade-in':  'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'skeleton': 'skeleton 1.4s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:   { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp:  { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        skeleton: { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
      },
    },
  },
  plugins: [],
}
