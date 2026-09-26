/** @type {import('tailwindcss').Config} */

// Kolory, zaokrąglenia, cienie i czcionki pochodzą z tokenów w src/index.css —
// Tailwind tylko je nazywa. Dzięki temu klasa typu `bg-panel` sama przełącza
// się z motywem (data-theme), a wygląd ma jedno źródło zamiast dwóch.
// Wcześniej była tu paleta indygo, której aplikacja nigdzie nie używała.
//
// Uwaga: kolory to zmienne CSS, więc modyfikator przezroczystości
// (`bg-panel/50`) na nich nie działa — do półprzezroczystych teł służą
// gotowe warianty *-soft.
const v = (name) => `var(--${name})`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg:            { DEFAULT: v('bg'), 2: v('bg-2') },
        panel:         { DEFAULT: v('panel'), 2: v('panel-2'), hover: v('panel-hover') },
        line:          { DEFAULT: v('border'), strong: v('border-strong') },
        fg:            v('text'),
        dim:           v('text-dim'),
        faint:         v('text-faint'),
        up:            { DEFAULT: v('up'), soft: v('up-soft') },
        down:          { DEFAULT: v('down'), soft: v('down-soft') },
        warn:          { DEFAULT: v('warn'), soft: v('warn-soft') },
        info:          { DEFAULT: v('info'), soft: v('info-soft') },
        accent:        { DEFAULT: v('accent'), fg: v('accent-fg') },
      },
      // Nowe nazwy zamiast nadpisywania rounded-sm/-lg — te domyślne są już
      // używane w kodzie i zmiana ich wartości przesunęłaby istniejące ekrany.
      borderRadius: {
        'card-sm': v('radius-sm'),
        card:      v('radius'),
        'card-lg': v('radius-lg'),
      },
      boxShadow: {
        card: v('shadow-card'),
        pop:  v('shadow-pop'),
      },
      fontFamily: {
        sans: v('font-sans'),
        mono: v('font-mono'),
      },
      fontSize: {
        label:        [v('fs-label'), { lineHeight: '1.3', letterSpacing: '0.08em' }],
        small:        [v('fs-small'), { lineHeight: '1.45' }],
        body:         [v('fs-body'),  { lineHeight: '1.5' }],
        'card-title': [v('fs-title'), { lineHeight: '1.35', fontWeight: '600' }],
        h1:           [v('fs-h1'),    { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        kpi:          [v('fs-kpi'),   { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
};
