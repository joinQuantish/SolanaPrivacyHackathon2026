/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Quantish brutalist palette
        qn: {
          bg: '#f5f5f5',
          white: '#ffffff',
          black: '#0d0d0d',
          gray: {
            100: '#f5f5f5',
            200: '#e5e5e5',
            300: '#d9d9d9',
            400: '#a3a3a3',
            500: '#737373',
            600: '#525252',
            700: '#404040',
            800: '#262626',
            900: '#171717',
          },
        },
        accent: {
          green: '#1cca5b',
          red: '#ef4343',
          blue: '#2563eb',
          purple: '#7c3aed',
          cyan: '#0ea5e9',
          orange: '#d97706',
        },
        // Keep obsidian as fallback during migration
        obsidian: {
          50: '#f5f5f5',
          100: '#e5e5e5',
          200: '#d9d9d9',
          300: '#a3a3a3',
          400: '#737373',
          500: '#525252',
          600: '#404040',
          700: '#262626',
          800: '#171717',
          900: '#0d0d0d',
          950: '#000000',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'ui-sans-serif', '-apple-system', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', '"SF Mono"', 'Menlo', 'Monaco', '"Courier New"', 'monospace'],
        code: ['"IBM Plex Mono"', 'monospace'],
      },
      boxShadow: {
        'brutal': '4px 4px 0px 0px rgb(13, 13, 13)',
        'brutal-sm': '2px 2px 0px 0px rgb(13, 13, 13)',
        'brutal-green': '4px 4px 0px 0px rgba(34, 197, 94, 0.4)',
        'brutal-red': '4px 4px 0px 0px rgba(239, 67, 67, 0.4)',
        'brutal-blue': '4px 4px 0px 0px rgba(59, 130, 246, 0.4)',
        'brutal-purple': '4px 4px 0px 0px rgba(124, 58, 237, 0.4)',
      },
      borderRadius: {
        'none': '0px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
