# Language Switching (PL/EN) — Design Spec

**Date:** 2026-06-09  
**Status:** Approved

---

## Overview

Add Polish/English language switching to the StocksTracker React app. Polish is the default. The user can switch via a flag button in the Header and via a setting in the Settings page. The choice is persisted in localStorage.

---

## Architecture

### New files

| File | Purpose |
|---|---|
| `src/context/LanguageContext.jsx` | Language state, provider, `useLanguage` hook, `useT` hook |
| `src/translations/pl.js` | All Polish UI strings (flat key→value dictionary) |
| `src/translations/en.js` | All English UI strings (same keys) |

### Modified files

- `src/main.jsx` — wrap app in `<LanguageProvider>`
- `src/components/layout/Header.jsx` — add PL/EN flag toggle button next to eye icon
- `src/pages/Settings.jsx` — add "Język / Language" section with PL/EN buttons
- All pages and shared components — replace hardcoded Polish strings with `t('key')`
- Date/number formatting calls — replace `'pl-PL'` locale string with `locale` from `useLanguage()`

---

## LanguageContext

```jsx
// src/context/LanguageContext.jsx
const LANG_KEY = 'myfund_language';

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(
    () => localStorage.getItem(LANG_KEY) || 'pl'
  );
  // locale string for toLocaleString / toLocaleDateString
  const locale = language === 'en' ? 'en-US' : 'pl-PL';
  const toggle = () => setLanguage(l => l === 'pl' ? 'en' : 'pl');
  return (
    <LanguageContext.Provider value={{ language, locale, setLanguage, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() { return useContext(LanguageContext); }

export function useT() {
  const { language } = useLanguage();
  const dict = language === 'en' ? en : pl;
  return (key) => dict[key] ?? pl[key] ?? key; // fallback: PL → raw key
}
```

---

## Translation Dictionary

Flat `key: string` structure. Keys are snake_case English identifiers.

### Scope of strings to translate

- **Navigation** — all sidebar links and section labels
- **Page titles and subtitles** — every `<h1>`, `page-title`, `card-title`
- **Table column headers** — all `<th>` labels
- **Buttons and actions** — all `<button>` text
- **Form labels and placeholders** — all `field-label`, `placeholder` attributes
- **Empty states and error messages** — "Brak danych", "Błąd zapisu", etc.
- **KPI card labels** — "Wartość portfela", "Zysk / strata", etc.
- **InsightStrip labels** — "Najlepsza pozycja", "Wynik dnia", etc.
- **Modal titles** — "Dodaj spółkę do portfela", etc.
- **Status indicators** — "live", "closed", "Giełda zamknięta"

### Example entries

```js
// pl.js
export default {
  dashboard: 'Dashboard',
  portfolio: 'Portfel',
  history: 'Historia',
  transactions: 'Transakcje',
  dividends: 'Dywidendy',
  watchlist: 'Watchlist',
  settings: 'Ustawienia',
  portfolio_value: 'Wartość portfela',
  gain_loss: 'Zysk / strata',
  dividends_ytd: 'Dywidendy YTD',
  free_cash: 'Wolne środki',
  add_stock: 'Dodaj spółkę do portfela',
  // ... ~200 total keys
}

// en.js
export default {
  dashboard: 'Dashboard',
  portfolio: 'Portfolio',
  history: 'History',
  transactions: 'Transactions',
  dividends: 'Dividends',
  watchlist: 'Watchlist',
  settings: 'Settings',
  portfolio_value: 'Portfolio value',
  gain_loss: 'Gain / loss',
  dividends_ytd: 'Dividends YTD',
  free_cash: 'Free cash',
  add_stock: 'Add stock to portfolio',
  // ... ~200 total keys
}
```

---

## Date & Number Formatting

Replace all hardcoded locale strings:

```js
// Before
new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })
n.toLocaleString('pl-PL', { minimumFractionDigits: 2 })

// After
const { locale } = useLanguage();
new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
n.toLocaleString(locale, { minimumFractionDigits: 2 })
```

This covers:
- Dashboard page subtitle ("wtorek, 9 czerwca" → "Tuesday, June 9")
- All `fmt()` / `fmtVal()` helper functions that use `toLocaleString`
- Calendar dates in Dividends, Calendar pages
- History chart axis labels

**Note:** Currency symbol stays as "zł" / "PLN" — these are financial data identifiers, not UI text.

---

## UI — Language Toggle

### Header (always visible)

Add a flag button to the right of the eye (privacy) icon:

```jsx
<button onClick={toggle} title={language === 'pl' ? 'Switch to English' : 'Przełącz na Polski'}>
  {language === 'pl' ? '🇬🇧' : '🇵🇱'}
</button>
```

The flag shows the *other* language (clicking 🇬🇧 switches to English).

### Settings page

New "Język / Language" section with two toggle buttons (same style as existing ToggleGroup):

```
[ 🇵🇱 Polski ]  [ 🇬🇧 English ]
```

---

## Pages & Components to Update

All 11 pages + shared components:

| File | Effort |
|---|---|
| `Dashboard.jsx` | High — KPI labels, InsightStrip, Top movers, date |
| `Portfolio.jsx` | High — table headers, toolbar labels, modals |
| `History.jsx` | Medium — KPI cards, table headers, chart labels |
| `Transactions.jsx` | Medium — table headers, form labels |
| `Dividends.jsx` | Medium — KPI cards, table headers, FIRE labels |
| `Calendar.jsx` | Low — section titles |
| `Watchlist.jsx` | Medium — table headers, alert labels |
| `Analysis.jsx` | Medium — metric labels, FIRE labels |
| `ScenarioLab.jsx` | Low — section titles, form labels |
| `AiInsights.jsx` | Low — section titles |
| `Settings.jsx` | Low — section labels + add language section |
| `Sidebar.jsx` | Medium — nav links, section labels |
| `Header.jsx` | Low — search placeholder + add toggle |
| `AddStockModal.jsx` | Medium — all form labels |
| `InsightStrip.jsx` | Low — 4 labels |
| `WinnersLosers.jsx` | Low — 1 label |
| `AuthScreen.jsx` | Medium — all auth labels |

---

## Success Criteria

1. Switching language in Header instantly updates all visible text
2. Refreshing the page preserves the selected language
3. Dates show "Tuesday, June 9" in EN and "wtorek, 9 czerwca" in PL
4. Numbers use `1,234.56` format in EN and `1 234,56` in PL
5. No hardcoded Polish strings remain in non-PL files
6. Missing EN key falls back to PL (no blank labels)
