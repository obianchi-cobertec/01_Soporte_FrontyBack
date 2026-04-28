/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  corePlugins: {
    preflight: false, // evita conflicto con el reset existente en index.css
  },
  theme: {
    extend: {},
  },
  plugins: [],
}

