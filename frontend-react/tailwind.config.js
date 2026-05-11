/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#1a1a2e',
        'surface2': '#16213e',
        accent: '#6366f1',
      },
    },
  },
  plugins: [],
};
