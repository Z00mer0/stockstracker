import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// Pierwsza konfiguracja lintera w tym projekcie — mimo że w kodzie od dawna
// były komentarze `eslint-disable`, ESLint nigdy nie był uruchamiany.
//
// Dobór reguł: przepuszczamy styl, pilnujemy błędów. Włączenie pełnego zestawu
// zalecanego dałoby setki zgłoszeń o formatowaniu, ludzie przestaliby je czytać
// i linter stałby się szumem. Tu zostaje to, co wskazuje na realną usterkę.
export default [
  {
    ignores: [
      'dist/**', 'dev-dist/**', 'node_modules/**', 'public/**',
      // Fragmenty makiet z przekazania projektu graficznego, nie kod aplikacji.
      // Odwołują się do pomocników, których nigdzie nie importują, bo nie są
      // modułami — same z siebie dawały 246 z 265 błędów.
      'design_handoff_stockstracker_redesign/**',
    ],
  },

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: { ...globals.browser, ...globals.serviceworker },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,

      // Złamanie zasad hooków to gwarantowany błąd w czasie działania,
      // nie kwestia gustu.
      'react-hooks/rules-of-hooks': 'error',
      // Brakująca zależność daje nieaktualne dane bez żadnego objawu.
      // Na razie ostrzeżenie — w kodzie są już miejsca wyciszone świadomie.
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'off',

      // Nieużywane zmienne zwykle znaczą, że refaktor został w połowie.
      // Argumenty i zmienne z podkreśleniem na początku są celowo pomijane.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],

      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  {
    files: ['**/*.test.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    files: ['api/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },

  {
    files: ['vite.config.js', 'tailwind.config.js', 'postcss.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
