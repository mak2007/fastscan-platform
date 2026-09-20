/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./client/index.html",
    "./client/src/**/*.{js,ts,jsx,tsx}",
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        limeBrand: {
          DEFAULT: '#bbf246',
          hover: '#a3e635',
          dark: '#4d7c0f',
          glow: 'rgba(187, 242, 70, 0.25)',
          surface: '#151d18',
          bg: '#0a0e0d'
        },
        darkSurface: {
          DEFAULT: '#111614',
          card: '#151c19',
          border: '#1e2923',
          inner: '#0d1310'
        }
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-short': 'bounce 0.5s ease-in-out 2'
      }
    },
  },
  plugins: [],
}
