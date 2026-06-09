# Language Switching (PL/EN) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Polish/English language switching to StocksTracker React app with persistent localStorage preference, flag toggle in Header + Settings, full UI translation, and locale-aware date/number formatting.

**Architecture:** Custom `LanguageContext` + flat `useT()` hook (no external library). Two dictionaries `pl.js` / `en.js` with ~200 keys. All hardcoded Polish strings replaced with `t('key')`, all `'pl-PL'` locale strings replaced with `locale` from `useLanguage()`.

**Tech Stack:** React context, localStorage, `toLocaleString` locale parameter, ES module flat dictionaries.

---

## File Map

| Action | File |
|---|---|
| Create | `src/context/LanguageContext.jsx` |
| Create | `src/translations/pl.js` |
| Create | `src/translations/en.js` |
| Modify | `src/main.jsx` |
| Modify | `src/components/layout/Header.jsx` |
| Modify | `src/components/layout/navItems.jsx` |
| Modify | `src/components/layout/Sidebar.jsx` |
| Modify | `src/components/shared/InsightStrip.jsx` |
| Modify | `src/components/shared/WinnersLosers.jsx` |
| Modify | `src/pages/Dashboard.jsx` |
| Modify | `src/pages/Portfolio.jsx` |
| Modify | `src/pages/History.jsx` |
| Modify | `src/pages/Transactions.jsx` |
| Modify | `src/pages/Dividends.jsx` |
| Modify | `src/pages/Watchlist.jsx` |
| Modify | `src/pages/Calendar.jsx` |
| Modify | `src/pages/Analysis.jsx` |
| Modify | `src/pages/ScenarioLab.jsx` |
| Modify | `src/pages/AiInsights.jsx` |
| Modify | `src/pages/Settings.jsx` |
| Modify | `src/components/AddStockModal.jsx` |
| Modify | `src/components/SellStockModal.jsx` |
| Modify | `src/components/EditPositionModal.jsx` |
| Modify | `src/components/AddDividendModal.jsx` |
| Modify | `src/components/auth/AuthScreen.jsx` |

---

### Task 1: LanguageContext + hooks

**Files:**
- Create: `src/context/LanguageContext.jsx`

- [ ] **Step 1: Create LanguageContext**

```jsx
// src/context/LanguageContext.jsx
import { createContext, useContext, useState } from 'react';
import pl from '../translations/pl';
import en from '../translations/en';

const LANG_KEY = 'myfund_language';
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(
    () => localStorage.getItem(LANG_KEY) || 'pl'
  );

  const locale = language === 'en' ? 'en-US' : 'pl-PL';

  function changeLanguage(lang) {
    localStorage.setItem(LANG_KEY, lang);
    setLanguage(lang);
  }

  const toggle = () => changeLanguage(language === 'pl' ? 'en' : 'pl');

  return (
    <LanguageContext.Provider value={{ language, locale, setLanguage: changeLanguage, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useT() {
  const { language } = useLanguage();
  const dict = language === 'en' ? en : pl;
  return (key) => dict[key] ?? pl[key] ?? key;
}
```

- [ ] **Step 2: Verify no import errors by checking that pl.js and en.js stubs exist (create them in Task 2 first, then come back)**

Note: Task 2 must be completed before Task 1 can be verified. Create empty stubs now:

```js
// src/translations/pl.js
export default {};

// src/translations/en.js
export default {};
```

- [ ] **Step 3: Commit stub**

```bash
git add src/context/LanguageContext.jsx src/translations/pl.js src/translations/en.js
git commit -m "feat(i18n): add LanguageContext, useT hook, stub dictionaries"
```

---

### Task 2: Translation Dictionaries

**Files:**
- Modify: `src/translations/pl.js`
- Modify: `src/translations/en.js`

- [ ] **Step 1: Write pl.js — all Polish UI strings**

```js
// src/translations/pl.js
export default {
  // ── Navigation ──────────────────────────────────────────────
  nav_dashboard:        'Dashboard',
  nav_portfolio:        'Portfel',
  nav_history:          'Historia',
  nav_transactions:     'Transakcje',
  nav_dividends:        'Dywidendy',
  nav_calendar:         'Kalendarz',
  nav_watchlist:        'Watchlist',
  nav_scenario:         'Scenario Lab',
  nav_analysis:         'Atrybucja',
  nav_ai:               'AI Insights',
  nav_settings:         'Ustawienia',
  nav_section_main:     'Główne',
  nav_section_account:  'Konto',
  nav_portfolios:       'Portfele',
  nav_all:              'Wszystkie',
  nav_new_portfolio:    'Nowy portfel',

  // ── Header ───────────────────────────────────────────────────
  search_placeholder:   'Szukaj spółki…',
  your_portfolio:       'Twój portfel',
  show_values:          'Pokaż wartości',
  hide_values:          'Ukryj wartości',
  add_transaction:      '+ Dodaj transakcję',
  earnings_calendar:    'Kalendarz wyników',
  close_menu:           'Zamknij menu',

  // ── Dashboard KPIs ───────────────────────────────────────────
  portfolio_value:      'Wartość portfela',
  today:                'dziś',
  gain_loss:            'Zysk / strata',
  dividends_ytd:        'Dywidendy YTD',
  free_cash:            'Wolne środki',
  next_dividend:        'Nast. dywidenda',
  next_prefix:          'następna',
  last_12m:             'ostatnie 12 mies.',
  market_closed:        'Giełda zamknięta',
  no_data:              'Brak danych',
  no_pl_data:           'Brak danych P&L',
  not_enough_history:   'Za mało danych historycznych',
  add_positions_hint:   'Dodaj pozycje w zakładce Portfel',
  portfolio_value_tf:   'Wartość portfela',

  // ── InsightStrip ─────────────────────────────────────────────
  best_position:        'Najlepsza pozycja',
  under_pressure:       'Pod presją',
  biggest_move:         'Największy ruch dziś',
  daily_result:         'Wynik dnia',

  // ── Table column headers ─────────────────────────────────────
  col_symbol:           'Symbol',
  col_qty:              'Ilość',
  col_avg_price:        'Śr. zakup',
  col_currency:         'Waluta',
  col_price:            'Cena',
  col_cost_pln:         'Wart. zakupu (PLN)',
  col_value_pln:        'Wart. teraz (PLN)',
  col_pl_pln:           'Zysk/Strata (PLN)',
  col_daily_chg:        'Zmiana dz. (%)',
  col_period:           'Okres',
  col_share_pct:        'Udział %',
  col_value:            'Wartość',
  col_date:             'Data',
  col_type:             'Typ',
  col_note:             'Notatka',
  col_company:          'Spółka',
  col_payments:         'Wypłaty',
  col_source:           'Źródło',
  col_day:              'Dzień',
  col_avg_price_short:  'Śr. cena',

  // ── Portfolio toolbar ────────────────────────────────────────
  filter:               'Filtry',
  sort:                 'Sortuj',
  export:               'Eksport',
  add:                  'Dodaj',
  group_sectors:        'Grupuj sektory',
  columns:              'Kolumny',
  all_currencies:       'Wszystkie waluty',
  all_exchanges:        'Wszystkie giełdy',
  all_sectors:          'Wszystkie sektory',
  exchange:             'Giełda',
  clear_filters:        'Wyczyść filtry',
  sort_by_cost:         'Wg kosztu',
  sort_az:              'A–Z',
  sort_by_qty:          'Wg ilości',
  sort_by_pl:           'Wg P&L',
  totals:               'Razem',

  // ── Portfolio actions / context menu ────────────────────────
  buy_more:             'Kup więcej',
  edit_position:        'Edytuj pozycję',
  watch:                'Obserwuj',
  unwatch:              'Usuń z obserwowanych',
  delete_position:      'Usuń pozycję',
  delete:               'Usuń',
  cancel:               'Anuluj',
  add_stock_btn:        '+ Dodaj spółkę',
  add_first_stock_hint: 'Dodaj pierwszą spółkę, aby zacząć śledzić portfel',
  portfolio_value_rail: 'Wartość portfela',
  quote_not_found:      'Nie znaleziono notowań — kliknij aby zmienić ticker',
  added_watchlist:      'dodano do Watchlist',
  removed_watchlist:    'usunięto z Watchlist',
  split_detected:       'Split wykryty — sprawdź czy ilość akcji jest już po splicie',
  confirm_delete_pos:   'Pozycja zostanie usunięta z portfela. Transakcji nie można cofnąć.',

  // ── Other assets (Portfolio) ─────────────────────────────────
  other_assets:         'Inne aktywa',
  real_estate:          'Nieruchomość',
  savings:              'Oszczędności/Lokata',
  asset_value_label:    'Wartość *',
  asset_note_placeholder: 'np. wartość rynkowa szacunkowa',
  real_estate_hint:     'Nieruchomości, lokaty, złoto, pojazdy — wyceniane ręcznie',
  total_approx:         'łącznie',
  enter_name:           'Podaj nazwę',
  enter_value_err:      'Podaj wartość',

  // ── AddStockModal ────────────────────────────────────────────
  add_stock_title:      'Dodaj spółkę do portfela',
  ticker_symbol:        'Symbol tickera *',
  ticker_hint_gpw:      '🇵🇱 GPW: dodaj .WA (np. PKN.WA) · 🇺🇸 US: bez sufiksu (np. AAPL)',
  qty_label:            'Ilość akcji *',
  value_label:          'Wartość transakcji *',
  buy_price_label:      'Cena zakupu *',
  currency_label:       'Waluta',
  buy_date_label:       'Data zakupu',
  note_label:           'Notatka (opcjonalna)',
  note_placeholder:     'np. długoterminowo, dywidendowa…',
  source_of_funds:      'Źródło środków',
  top_up:               '💼 Dopłata',
  deduct_cash:          '💵 Odejmij od gotówki',
  saving:               'Zapisuję…',
  add_to_portfolio:     'Dodaj do portfela',
  already_own_prefix:   'Masz już',
  already_own_suffix:   'szt. po śr.',
  will_average:         '— zostanie uśrednione',
  err_enter_symbol:     'Podaj symbol tickera',
  err_enter_qty:        'Podaj ilość / wartość',
  err_enter_price:      'Podaj cenę zakupu',
  save_error:           'Błąd zapisu',
  mode_qty:             'Ilość',
  mode_value:           'Wartość transakcji',

  // ── Transactions page ────────────────────────────────────────
  add_transaction_title: 'Dodaj transakcję',
  type_buy:             'Kupno',
  type_sell:            'Sprzedaż',
  type_div:             'Dywidenda',
  type_cash:            'Gotówka',
  qty_short:            'Ilość',
  price_label:          'Cena',
  sells_30d:            'Sprzedaże 30d',
  cash_30d:             'Gotówka 30d',
  err_enter_qty_short:  'Podaj ilość',
  err_enter_price_short: 'Podaj cenę',

  // ── History page ────────────────────────────────────────────
  history_first_refresh: 'Historia pojawi się po pierwszym odświeżeniu portfela',
  value_filter:         'Wartość (filtr)',
  rolling_returns:      'Rolling Returns — kroczące stopy zwrotu',
  entries:              'wpisów',
  invested_label:       'Zainwestowano',
  delta_label:          'Zmiana',
  value_pln_header:     'Wartość (PLN)',
  invested_pln_header:  'Zainwestowano (PLN)',

  // ── Dividends page ───────────────────────────────────────────
  last_12m_sub:         'ostatnie 12 miesięcy',
  yield_sub:            'roczne dywidendy / wartość portfela',
  upcoming_30d:         'Nadchodzące (30 dni)',
  set_monthly_goal:     'Ustaw miesięczny cel dywidendowy (PLN/mies.)',
  change_goal:          'Zmień cel',
  of_monthly_goal:      'miesięcznego celu',
  goal_achieved:        '🎯 Cel osiągnięty! Twój portfel generuje pasywny dochód wystarczający na pokrycie celu.',
  gross:                'brutto',
  net:                  'netto',
  display_mode:         'Tryb wyświetlania kwot',
  gpw_dividends_note:   'Daty dywidend GPW są dodawane ręcznie.',
  add_dividend_gpw:     '+ Dodaj dywidendę GPW',
  add_manually:         '+ Dodaj ręcznie',
  manual_source:        '✍️ ręczne',
  auto_source:          '🤖 auto',
  no_upcoming_div:      'Brak nadchodzących dywidend.',
  us_no_data_note:      'US stocks: Finnhub może nie mieć danych dla tej spółki.',
  upcoming_dividends:   'Nadchodzące dywidendy',
  payment_timeline:     'Timeline wypłat',
  div_per_company:      'Dywidendy per spółka · Yield on Cost',
  payment_history:      'Historia wypłat',
  total_dividends:      'Łącznie dywidendy',
  num_payments:         'Liczba wypłat',
  dividend_companies:   'Spółki dywidendowe',
  no_div_companies:     'Brak spółek dywidendowych w portfelu',
  no_div_hint:          'Dodaj wypłatę dywidendy w sekcji Transakcje (typ: DIV) lub ręcznie powyżej.',
  total_pln_header:     'Łącznie PLN',
  months: ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'],

  // ── Watchlist ────────────────────────────────────────────────
  watched_companies:    'Obserwowane spółki',
  loading_quotes:       'Ładowanie kursów…',
  watched_synced:       'Spółki obserwowane synchronizowane są z serwerem.',
  owned_companies:      'Posiadane spółki',
  above_alert:          '↑ Powyżej',
  below_alert:          '↓ Poniżej',
  click_to_remove:      'Kliknij aby usunąć',

  // ── Settings ────────────────────────────────────────────────
  settings_title:       'Ustawienia',
  api_keys:             'Klucze API',
  change_password:      'Zmiana hasła',
  current_password:     'Aktualne hasło',
  new_password:         'Nowe hasło',
  repeat_new_password:  'Powtórz nowe',
  change_password_btn:  'Zmień hasło',
  password_changed:     'Hasło zostało zmienione ✓',
  passwords_mismatch:   'Nowe hasła nie są identyczne',
  password_error:       'Błąd zmiany hasła',
  saving_btn:           'Zapisywanie…',
  dividend_tax:         'Podatek od dywidend',
  gpw_tax:              'GPW (.WA)',
  gpw_tax_value:        '19% ryczałt (stała)',
  us_stocks:            'Akcje US',
  language_section:     'Język / Language',
  refresh_data:         'Odśwież dane',
  existing_snapshots:   'Istniejące snapshots',
  portfolio_val_zl:     'Wartość portfela (zł)',
  invested_zl:          'Zainwestowano (zł)',
  save_changes:         'Zapisz zmiany',
  add_snapshot:         'Dodaj snapshot',
  saved_ok:             '✓ Zapisano',
  delete_snapshot_confirm: 'Usunąć snapshot z',
  import_csv:           'Importuj historię z pliku CSV (eToro itp.). Obsługiwane: Closed Positions, Cash Operations.',
  light_theme:          'Motyw jasny',
  dark_theme:           'Motyw ciemny',
  gpw_pln_label:        'GPW · PLN',
  user_label:           'Użytkownik',

  // ── Auth ────────────────────────────────────────────────────
  username_placeholder: 'nazwa użytkownika',
  password_placeholder: 'hasło',
  login_btn:            'Zaloguj się',
  register_btn:         'Zarejestruj się',
  logout_btn:           'Wyloguj się',

  // ── Common ──────────────────────────────────────────────────
  save_btn:             'Zapisz',
  delete_btn:           'Usuń',
  cancel_btn:           'Anuluj',
  close_btn:            'Zamknij',
  add_btn:              '+ Dodaj',
  loading:              'Ładowanie…',
  error:                'Błąd',
};
```

- [ ] **Step 2: Write en.js — all English translations**

```js
// src/translations/en.js
export default {
  // ── Navigation ──────────────────────────────────────────────
  nav_dashboard:        'Dashboard',
  nav_portfolio:        'Portfolio',
  nav_history:          'History',
  nav_transactions:     'Transactions',
  nav_dividends:        'Dividends',
  nav_calendar:         'Calendar',
  nav_watchlist:        'Watchlist',
  nav_scenario:         'Scenario Lab',
  nav_analysis:         'Attribution',
  nav_ai:               'AI Insights',
  nav_settings:         'Settings',
  nav_section_main:     'Main',
  nav_section_account:  'Account',
  nav_portfolios:       'Portfolios',
  nav_all:              'All',
  nav_new_portfolio:    'New portfolio',

  // ── Header ───────────────────────────────────────────────────
  search_placeholder:   'Search stock…',
  your_portfolio:       'Your portfolio',
  show_values:          'Show values',
  hide_values:          'Hide values',
  add_transaction:      '+ Add transaction',
  earnings_calendar:    'Earnings calendar',
  close_menu:           'Close menu',

  // ── Dashboard KPIs ───────────────────────────────────────────
  portfolio_value:      'Portfolio value',
  today:                'today',
  gain_loss:            'Gain / loss',
  dividends_ytd:        'Dividends YTD',
  free_cash:            'Free cash',
  next_dividend:        'Next dividend',
  next_prefix:          'next',
  last_12m:             'last 12 mo.',
  market_closed:        'Market closed',
  no_data:              'No data',
  no_pl_data:           'No P&L data',
  not_enough_history:   'Not enough historical data',
  add_positions_hint:   'Add positions in the Portfolio tab',
  portfolio_value_tf:   'Portfolio value',

  // ── InsightStrip ─────────────────────────────────────────────
  best_position:        'Best position',
  under_pressure:       'Under pressure',
  biggest_move:         'Biggest move today',
  daily_result:         'Daily result',

  // ── Table column headers ─────────────────────────────────────
  col_symbol:           'Symbol',
  col_qty:              'Qty',
  col_avg_price:        'Avg buy',
  col_currency:         'Currency',
  col_price:            'Price',
  col_cost_pln:         'Cost (PLN)',
  col_value_pln:        'Value (PLN)',
  col_pl_pln:           'P&L (PLN)',
  col_daily_chg:        'Daily chg. (%)',
  col_period:           'Period',
  col_share_pct:        'Share %',
  col_value:            'Value',
  col_date:             'Date',
  col_type:             'Type',
  col_note:             'Note',
  col_company:          'Company',
  col_payments:         'Payments',
  col_source:           'Source',
  col_day:              'Day',
  col_avg_price_short:  'Avg price',

  // ── Portfolio toolbar ────────────────────────────────────────
  filter:               'Filters',
  sort:                 'Sort',
  export:               'Export',
  add:                  'Add',
  group_sectors:        'Group by sector',
  columns:              'Columns',
  all_currencies:       'All currencies',
  all_exchanges:        'All exchanges',
  all_sectors:          'All sectors',
  exchange:             'Exchange',
  clear_filters:        'Clear filters',
  sort_by_cost:         'By cost',
  sort_az:              'A–Z',
  sort_by_qty:          'By quantity',
  sort_by_pl:           'By P&L',
  totals:               'Total',

  // ── Portfolio actions / context menu ────────────────────────
  buy_more:             'Buy more',
  edit_position:        'Edit position',
  watch:                'Watch',
  unwatch:              'Remove from watchlist',
  delete_position:      'Delete position',
  delete:               'Delete',
  cancel:               'Cancel',
  add_stock_btn:        '+ Add stock',
  add_first_stock_hint: 'Add your first stock to start tracking your portfolio',
  portfolio_value_rail: 'Portfolio value',
  quote_not_found:      'Quote not found — click to change ticker',
  added_watchlist:      'added to Watchlist',
  removed_watchlist:    'removed from Watchlist',
  split_detected:       'Split detected — check if share count is post-split',
  confirm_delete_pos:   'Position will be removed from portfolio. Transactions cannot be undone.',

  // ── Other assets (Portfolio) ─────────────────────────────────
  other_assets:         'Other assets',
  real_estate:          'Real estate',
  savings:              'Savings / Deposit',
  asset_value_label:    'Value *',
  asset_note_placeholder: 'e.g. estimated market value',
  real_estate_hint:     'Real estate, deposits, gold, vehicles — manually valued',
  total_approx:         'total',
  enter_name:           'Enter name',
  enter_value_err:      'Enter value',

  // ── AddStockModal ────────────────────────────────────────────
  add_stock_title:      'Add stock to portfolio',
  ticker_symbol:        'Ticker symbol *',
  ticker_hint_gpw:      '🇵🇱 GPW: add .WA (e.g. PKN.WA) · 🇺🇸 US: no suffix (e.g. AAPL)',
  qty_label:            'Share qty *',
  value_label:          'Transaction value *',
  buy_price_label:      'Buy price *',
  currency_label:       'Currency',
  buy_date_label:       'Buy date',
  note_label:           'Note (optional)',
  note_placeholder:     'e.g. long-term, dividend…',
  source_of_funds:      'Source of funds',
  top_up:               '💼 Top up',
  deduct_cash:          '💵 Deduct from cash',
  saving:               'Saving…',
  add_to_portfolio:     'Add to portfolio',
  already_own_prefix:   'You already own',
  already_own_suffix:   'pcs at avg',
  will_average:         '— will be averaged',
  err_enter_symbol:     'Enter ticker symbol',
  err_enter_qty:        'Enter quantity / value',
  err_enter_price:      'Enter buy price',
  save_error:           'Save error',
  mode_qty:             'Qty',
  mode_value:           'Transaction value',

  // ── Transactions page ────────────────────────────────────────
  add_transaction_title: 'Add transaction',
  type_buy:             'Buy',
  type_sell:            'Sell',
  type_div:             'Dividend',
  type_cash:            'Cash',
  qty_short:            'Qty',
  price_label:          'Price',
  sells_30d:            'Sells 30d',
  cash_30d:             'Cash 30d',
  err_enter_qty_short:  'Enter quantity',
  err_enter_price_short: 'Enter price',

  // ── History page ────────────────────────────────────────────
  history_first_refresh: 'History will appear after the first portfolio refresh',
  value_filter:         'Value (filter)',
  rolling_returns:      'Rolling Returns',
  entries:              'entries',
  invested_label:       'Invested',
  delta_label:          'Change',
  value_pln_header:     'Value (PLN)',
  invested_pln_header:  'Invested (PLN)',

  // ── Dividends page ───────────────────────────────────────────
  last_12m_sub:         'last 12 months',
  yield_sub:            'annual dividends / portfolio value',
  upcoming_30d:         'Upcoming (30 days)',
  set_monthly_goal:     'Set monthly dividend goal (PLN/mo.)',
  change_goal:          'Change goal',
  of_monthly_goal:      'of monthly goal',
  goal_achieved:        '🎯 Goal achieved! Your portfolio generates passive income sufficient to cover the goal.',
  gross:                'gross',
  net:                  'net',
  display_mode:         'Amount display mode',
  gpw_dividends_note:   'GPW dividend dates are added manually.',
  add_dividend_gpw:     '+ Add GPW dividend',
  add_manually:         '+ Add manually',
  manual_source:        '✍️ manual',
  auto_source:          '🤖 auto',
  no_upcoming_div:      'No upcoming dividends.',
  us_no_data_note:      'US stocks: Finnhub may not have data for this company.',
  upcoming_dividends:   'Upcoming dividends',
  payment_timeline:     'Payment timeline',
  div_per_company:      'Dividends per company · Yield on Cost',
  payment_history:      'Payment history',
  total_dividends:      'Total dividends',
  num_payments:         'Number of payments',
  dividend_companies:   'Dividend companies',
  no_div_companies:     'No dividend stocks in portfolio',
  no_div_hint:          'Add a dividend payment in Transactions (type: DIV) or manually above.',
  total_pln_header:     'Total PLN',
  months: ['January','February','March','April','May','June','July','August','September','October','November','December'],

  // ── Watchlist ────────────────────────────────────────────────
  watched_companies:    'Watched stocks',
  loading_quotes:       'Loading quotes…',
  watched_synced:       'Watched stocks are synced with the server.',
  owned_companies:      'Owned stocks',
  above_alert:          '↑ Above',
  below_alert:          '↓ Below',
  click_to_remove:      'Click to remove',

  // ── Settings ────────────────────────────────────────────────
  settings_title:       'Settings',
  api_keys:             'API keys',
  change_password:      'Change password',
  current_password:     'Current password',
  new_password:         'New password',
  repeat_new_password:  'Repeat new',
  change_password_btn:  'Change password',
  password_changed:     'Password changed ✓',
  passwords_mismatch:   'New passwords do not match',
  password_error:       'Password change error',
  saving_btn:           'Saving…',
  dividend_tax:         'Dividend tax',
  gpw_tax:              'GPW (.WA)',
  gpw_tax_value:        '19% flat (fixed)',
  us_stocks:            'US stocks',
  language_section:     'Language / Język',
  refresh_data:         'Refresh data',
  existing_snapshots:   'Existing snapshots',
  portfolio_val_zl:     'Portfolio value (zł)',
  invested_zl:          'Invested (zł)',
  save_changes:         'Save changes',
  add_snapshot:         'Add snapshot',
  saved_ok:             '✓ Saved',
  delete_snapshot_confirm: 'Delete snapshot from',
  import_csv:           'Import history from CSV file (eToro etc.). Supported: Closed Positions, Cash Operations.',
  light_theme:          'Light theme',
  dark_theme:           'Dark theme',
  gpw_pln_label:        'GPW · PLN',
  user_label:           'User',

  // ── Auth ────────────────────────────────────────────────────
  username_placeholder: 'username',
  password_placeholder: 'password',
  login_btn:            'Log in',
  register_btn:         'Register',
  logout_btn:           'Log out',

  // ── Common ──────────────────────────────────────────────────
  save_btn:             'Save',
  delete_btn:           'Delete',
  cancel_btn:           'Cancel',
  close_btn:            'Close',
  add_btn:              '+ Add',
  loading:              'Loading…',
  error:                'Error',
};
```

- [ ] **Step 3: Commit dictionaries**

```bash
git add src/translations/pl.js src/translations/en.js
git commit -m "feat(i18n): add complete pl.js and en.js translation dictionaries"
```

---

### Task 3: Wire LanguageProvider + Header toggle

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/components/layout/Header.jsx`

- [ ] **Step 1: Wrap app in LanguageProvider in main.jsx**

```jsx
// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './tabs.css';
import { PrivacyProvider } from './context/PrivacyContext';
import { LanguageProvider } from './context/LanguageContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <PrivacyProvider>
        <App />
      </PrivacyProvider>
    </LanguageProvider>
  </React.StrictMode>
);
```

- [ ] **Step 2: Add language toggle to Header.jsx**

In Header.jsx, add the following imports at the top:

```jsx
import { useLanguage, useT } from '../../context/LanguageContext';
```

Inside the Header component, add:

```jsx
const { language, toggle } = useLanguage();
const t = useT();
```

Replace the `placeholder="Szukaj spółki…"` on the search input:
```jsx
placeholder={t('search_placeholder')}
```

Replace `{!query && <div ...>Twój portfel</div>}`:
```jsx
{!query && <div ...>{t('your_portfolio')}</div>}
```

Replace `title={isPrivate ? 'Pokaż wartości' : 'Ukryj wartości'}`:
```jsx
title={isPrivate ? t('show_values') : t('hide_values')}
```

Replace `title="Kalendarz wyników"` and `aria-label="Kalendarz wyników"`:
```jsx
title={t('earnings_calendar')} aria-label={t('earnings_calendar')}
```

Replace `{isMobile ? '+' : '+ Dodaj transakcję'}`:
```jsx
{isMobile ? '+' : t('add_transaction')}
```

Add the language toggle button **after** the privacy (eye) button, before the earnings calendar button:

```jsx
<button
  style={iconBtn}
  onClick={toggle}
  title={language === 'pl' ? 'Switch to English' : 'Przełącz na Polski'}
>
  <span style={{ fontSize: 18, lineHeight: 1 }}>
    {language === 'pl' ? '🇬🇧' : '🇵🇱'}
  </span>
</button>
```

- [ ] **Step 3: Start dev server and verify toggle appears**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run dev
```

Open browser, confirm 🇬🇧 flag appears next to eye icon. Click it — UI should switch to English. Reload — English should persist. Click 🇵🇱 — switches back to Polish.

- [ ] **Step 4: Commit**

```bash
git add src/main.jsx src/components/layout/Header.jsx
git commit -m "feat(i18n): wire LanguageProvider, add flag toggle to Header"
```

---

### Task 4: Settings language section

**Files:**
- Modify: `src/pages/Settings.jsx`

- [ ] **Step 1: Add language imports and useT to Settings**

At the top of Settings.jsx, add:
```jsx
import { useLanguage, useT } from '../context/LanguageContext';
```

Inside the Settings component, add:
```jsx
const { language, setLanguage } = useLanguage();
const t = useT();
```

- [ ] **Step 2: Add "Język / Language" section**

Find the section structure in Settings.jsx and add a new section. Place it near the top (after the main settings card header, before API keys):

```jsx
{/* ── Language section ── */}
<div style={{ marginBottom: 24 }}>
  <div className="card-title" style={{ marginBottom: 12 }}>{t('language_section')}</div>
  <div style={{ display: 'flex', gap: 8 }}>
    <button
      className={`btn${language === 'pl' ? ' btn-primary' : ''}`}
      onClick={() => setLanguage('pl')}
    >
      🇵🇱 Polski
    </button>
    <button
      className={`btn${language === 'en' ? ' btn-primary' : ''}`}
      onClick={() => setLanguage('en')}
    >
      🇬🇧 English
    </button>
  </div>
</div>
```

- [ ] **Step 3: Translate key Settings strings**

Replace hardcoded strings in Settings.jsx:
- `'Zmiana hasła'` → `t('change_password')`  (Card title)
- `'Aktualne hasło'` → `t('current_password')`
- `'Nowe hasło'` → `t('new_password')`
- `'Powtórz nowe'` → `t('repeat_new_password')`
- `'Zmień hasło'` → `t('change_password_btn')`
- `'Hasło zostało zmienione ✓'` → `t('password_changed')`
- `'Nowe hasła nie są identyczne'` → `t('passwords_mismatch')`
- `'Błąd zmiany hasła'` → `t('password_error')`
- `'Zapisywanie…'` → `t('saving_btn')`
- `'Podatek od dywidend'` → `t('dividend_tax')`
- `'GPW (.WA)'` → `t('gpw_tax')`
- `'19% ryczałt (stała)'` → `t('gpw_tax_value')`
- `'Akcje US'` → `t('us_stocks')`
- `'Odśwież dane'` → `t('refresh_data')`
- `'Wartość portfela (zł)'` → `t('portfolio_val_zl')`
- `'Zainwestowano (zł)'` → `t('invested_zl')`
- `'✓ Zapisano'` → `t('saved_ok')`
- `'Zapisuję…'` → `t('saving')`
- `'Zapisz zmiany'` → `t('save_changes')`
- `'Dodaj snapshot'` → `t('add_snapshot')`
- `'Istniejące snapshots'` → `t('existing_snapshots')`

Also fix `toLocaleString('pl-PL'...)` in Settings.jsx — replace with `locale`:
```jsx
const { locale } = useLanguage();
// Then replace 'pl-PL' with locale
s.total.toLocaleString(locale, { maximumFractionDigits: 0 })
s.invested.toLocaleString(locale, { maximumFractionDigits: 0 })
```

- [ ] **Step 4: Verify Settings section appears and both buttons work**

Open /settings, confirm "Język / Language" section shows two buttons. Click English, confirm Settings UI updates.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.jsx
git commit -m "feat(i18n): add language section to Settings, translate Settings strings"
```

---

### Task 5: Update navItems + Sidebar

**Files:**
- Modify: `src/components/layout/navItems.jsx`
- Modify: `src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Make navItems labels translation-aware**

`navItems.jsx` exports static arrays — labels need to become functions that accept `t`. Replace the static arrays with a factory function:

```jsx
// src/components/layout/navItems.jsx
const ic = (d) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

// Keep icon definitions the same, but make labels dynamic
export function getNavItems(t) {
  return [
    { to: '/',             icon: ic(<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>), label: t('nav_dashboard') },
    { to: '/portfolio',    icon: ic(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></>), label: t('nav_portfolio') },
    { to: '/history',      icon: ic(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>), label: t('nav_history') },
    { to: '/transactions', icon: ic(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>), label: t('nav_transactions') },
    { to: '/dividends',    icon: ic(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>), label: t('nav_dividends') },
    { to: '/calendar',     icon: ic(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>), label: t('nav_calendar') },
    { to: '/watchlist',    icon: ic(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>), label: t('nav_watchlist') },
    { to: '/scenario',     icon: ic(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>), label: t('nav_scenario') },
    { to: '/analysis',     icon: ic(<><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>), label: t('nav_analysis') },
    { to: '/ai',           icon: ic(<><path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2z"/><path d="M12 8v4l3 3"/></>), label: t('nav_ai') },
  ];
}

export function getNavBottom(t) {
  return [
    { to: '/settings', icon: ic(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>), label: t('nav_settings') },
  ];
}

// Backward-compat static exports (used if any file imports NAV_ITEMS directly)
export const NAV_ITEMS = getNavItems(k => k);
export const NAV_BOTTOM = getNavBottom(k => k);
```

- [ ] **Step 2: Update Sidebar.jsx to use getNavItems/getNavBottom**

In Sidebar.jsx, add imports:
```jsx
import { useT } from '../../context/LanguageContext';
import { getNavItems, getNavBottom } from './navItems';
```

Inside the Sidebar component:
```jsx
const t = useT();
const NAV_ITEMS = getNavItems(t);
const NAV_BOTTOM = getNavBottom(t);
```

Then replace hardcoded Sidebar strings:
- `'Portfele'` → `{t('nav_portfolios')}`
- `'Wszystkie'` → `{t('nav_all')}`
- `'Nowy portfel'` → `{t('nav_new_portfolio')}`
- `'Główne'` → `{t('nav_section_main')}`
- `'Konto'` → `{t('nav_section_account')}`
- `'Użytkownik'` → `{t('user_label')}`
- `'GPW · PLN'` → `{t('gpw_pln_label')}`
- `title="Zamknij menu"` → `title={t('close_menu')}`

Also check MobileDrawer.jsx — if it imports NAV_ITEMS, it will automatically get the static fallback. If it renders nav labels directly, apply the same useT pattern.

- [ ] **Step 3: Verify nav labels switch language**

Start dev server, toggle language — sidebar links should switch between Polish and English.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/navItems.jsx src/components/layout/Sidebar.jsx src/components/layout/MobileDrawer.jsx
git commit -m "feat(i18n): translate navigation labels in Sidebar"
```

---

### Task 6: Update shared components (InsightStrip, WinnersLosers)

**Files:**
- Modify: `src/components/shared/InsightStrip.jsx`
- Modify: `src/components/shared/WinnersLosers.jsx`

- [ ] **Step 1: Update InsightStrip.jsx**

Replace the file content:

```jsx
import React from 'react';
import { useLanguage, useT } from '../../context/LanguageContext';

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

export default function InsightStrip({ positions = [], dailyChangePLN = 0 }) {
  const { locale } = useLanguage();
  const t = useT();

  function fmtPLN(n) {
    if (n == null || isNaN(n)) return '—';
    return (n >= 0 ? '+' : '') + Math.round(n).toLocaleString(locale) + ' zł';
  }

  const withPl = positions.filter(p => p.plPLN != null && p.costPLN > 0);
  const withDay = positions.filter(p => p.dailyChg != null);

  const best  = [...withPl].sort((a, b) => (b.plPLN / b.costPLN) - (a.plPLN / a.costPLN))[0];
  const worst = [...withPl].sort((a, b) => (a.plPLN / a.costPLN) - (b.plPLN / b.costPLN))[0];
  const mover = [...withDay].sort((a, b) => Math.abs(b.dailyChg) - Math.abs(a.dailyChg))[0];

  if (!best && !worst && !mover) return null;

  const bestPct  = best  ? (best.plPLN  / best.costPLN)  * 100 : null;
  const worstPct = worst ? (worst.plPLN / worst.costPLN) * 100 : null;
  const dayUp    = dailyChangePLN >= 0;

  return (
    <div className="insight-strip">
      {best && (
        <div className="insight">
          <span className="ins-dot" style={{ background: 'var(--up)' }} />
          <div className="ins-body">
            <div className="ins-label">{t('best_position')}</div>
            <div className="ins-text">
              {best.symbol.replace('.WA', '')}
              {' · '}
              <span className="num up">{fmtPct(bestPct)}</span>
            </div>
          </div>
        </div>
      )}
      {worst && worst.symbol !== best?.symbol && (
        <div className="insight">
          <span className="ins-dot" style={{ background: 'var(--down)' }} />
          <div className="ins-body">
            <div className="ins-label">{t('under_pressure')}</div>
            <div className="ins-text">
              {worst.symbol.replace('.WA', '')}
              {' · '}
              <span className="num down">{fmtPct(worstPct)}</span>
            </div>
          </div>
        </div>
      )}
      {mover && (
        <div className="insight">
          <span className="ins-dot" style={{ background: 'var(--info)' }} />
          <div className="ins-body">
            <div className="ins-label">{t('biggest_move')}</div>
            <div className="ins-text">
              {mover.symbol.replace('.WA', '')}
              {' · '}
              <span className={'num ' + (mover.dailyChg >= 0 ? 'up' : 'down')}>{fmtPct(mover.dailyChg)}</span>
            </div>
          </div>
        </div>
      )}
      {dailyChangePLN != null && (
        <div className="insight">
          <span className="ins-dot" style={{ background: dayUp ? 'var(--up)' : 'var(--down)' }} />
          <div className="ins-body">
            <div className="ins-label">{t('daily_result')}</div>
            <div className="ins-text">
              <span className={'num ' + (dayUp ? 'up' : 'down')}>{fmtPLN(dailyChangePLN)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update WinnersLosers.jsx**

In WinnersLosers.jsx, add:
```jsx
import { useT } from '../../context/LanguageContext';
```

Inside component:
```jsx
const t = useT();
```

Replace `'Brak danych P&L'` → `{t('no_pl_data')}`

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/InsightStrip.jsx src/components/shared/WinnersLosers.jsx
git commit -m "feat(i18n): translate InsightStrip and WinnersLosers"
```

---

### Task 7: Update Dashboard

**Files:**
- Modify: `src/pages/Dashboard.jsx`

- [ ] **Step 1: Add imports and hooks to Dashboard**

```jsx
import { useLanguage, useT } from '../context/LanguageContext';
```

Inside Dashboard component:
```jsx
const { locale } = useLanguage();
const t = useT();
```

- [ ] **Step 2: Fix fmt() to use locale**

```js
function fmt(n, decimals = 2, locale) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
```

All calls to `fmt(...)` in Dashboard should pass `locale`: e.g. `fmt(pos.valuePLN, 2, locale)`.

Alternatively, define a local `fmt` inside the component using the hook:
```jsx
const fmt = useCallback((n, decimals = 2) => {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}, [locale]);
```

- [ ] **Step 3: Translate Dashboard strings**

In the KPI section (around line 319–360), replace:
- `label="Wartość portfela"` → `label={t('portfolio_value')}`
- `sub="dziś"` → `sub={t('today')}`
- `` sub={nextDividend ? `następna: ${nextDividend.symbol}` : 'ostatnie 12 mies.'} ``
  → `` sub={nextDividend ? `${t('next_prefix')}: ${nextDividend.symbol}` : t('last_12m')} ``
- `label="Wolne środki"` → `label={t('free_cash')}`

In the chart section (around line 363–393):
- `` `Wartość portfela · ${tf}` `` → `` `${t('portfolio_value_tf')} · ${tf}` ``
- `'Za mało danych historycznych'` → `{t('not_enough_history')}`
- `{isWeekend ? 'Giełda zamknięta' : 'Brak danych'}` → `{isWeekend ? t('market_closed') : t('no_data')}`

In the empty state (around line 443):
- `'Dodaj pozycje w zakładce Portfel'` → `{t('add_positions_hint')}`

Also fix the date subtitle (the "wtorek, 9 czerwca" line) to use `locale`:
```jsx
// Find the date subtitle line and update it:
const subtitle = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
```

- [ ] **Step 4: Verify Dashboard in both languages**

Start dev server. Toggle to English — KPI labels, InsightStrip, and date subtitle should all be in English. Numbers should use `1,234.56` format in EN and `1 234,56` in PL.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.jsx
git commit -m "feat(i18n): translate Dashboard — KPIs, InsightStrip, date, locale formatting"
```

---

### Task 8: Update Portfolio

**Files:**
- Modify: `src/pages/Portfolio.jsx`

- [ ] **Step 1: Add imports and hooks**

```jsx
import { useLanguage, useT } from '../context/LanguageContext';
```

Inside Portfolio:
```jsx
const { locale } = useLanguage();
const t = useT();
```

Fix `fmt()` in Portfolio to use `locale` (same pattern as Dashboard).

- [ ] **Step 2: Translate toolbar and table headers**

Replace toolbar strings:
- `'Filtry'` → `t('filter')`
- `'Sortuj'` → `t('sort')`
- `'Eksport'` → `t('export')`
- `'Dodaj'` → `t('add')`
- `'Grupuj sektory'` → `t('group_sectors')`
- `'Kolumny'` → `t('columns')`
- `'Wszystkie waluty'` → `t('all_currencies')`
- `'Wszystkie giełdy'` → `t('all_exchanges')`
- `'Wszystkie sektory'` → `t('all_sectors')`
- `'Giełda'` → `t('exchange')`
- `'Wyczyść filtry'` → `t('clear_filters')`
- `'Wg kosztu'` → `t('sort_by_cost')`
- `'Wg ilości'` → `t('sort_by_qty')`
- `'Wg P&L'` → `t('sort_by_pl')`

Table header `<th>` labels:
- `'Udział %'` → `{t('col_share_pct')}`
- `'Wartość'` → `{t('col_value')}`

Replace the SORT_LABELS object:
```jsx
const SORT_LABELS = {
  cost: t('sort_by_cost'),
  symbol: t('sort_az'),
  qty: t('sort_by_qty'),
  pl: t('sort_by_pl'),
};
```

- [ ] **Step 3: Translate context menu, delete confirm, empty state**

Context menu items:
- `'Kup więcej'` → `t('buy_more')`
- `'Edytuj pozycję'` → `t('edit_position')`
- `isWatched ? 'Usuń z obserwowanych' : 'Obserwuj'` → `isWatched ? t('unwatch') : t('watch')`
- `'Usuń pozycję'` → `t('delete_position')`

Toast messages:
- `` `${sym} dodano do Watchlist` `` → `` `${sym} ${t('added_watchlist')}` ``
- `` `${sym} usunięto z Watchlist` `` → `` `${sym} ${t('removed_watchlist')}` ``

Delete confirm dialog:
- `'Pozycja zostanie usunięta z portfela. Transakcji nie można cofnąć.'` → `{t('confirm_delete_pos')}`

Empty state:
- `'Dodaj pierwszą spółkę, aby zacząć śledzić portfel'` → `{t('add_first_stock_hint')}`
- `'+ Dodaj spółkę'` → `{t('add_stock_btn')}`

Rail stats labels:
- `'Wartość portfela'` → `{t('portfolio_value_rail')}`
- `'dziś'` → `{t('today')}`
- `'Za mało danych historycznych'` → `{t('not_enough_history')}`

Other assets section:
- All strings from real_estate, savings, enter_name, enter_value_err, etc. per dictionary keys above.

Export CSV headers (lines ~670–755) — translate the header arrays:
```jsx
const headers = [t('col_symbol'), t('col_qty'), t('col_avg_price'), t('col_currency'), t('col_price'), t('col_cost_pln'), t('col_value_pln'), t('col_pl_pln'), t('col_daily_chg')];
```

- [ ] **Step 4: Verify Portfolio in both languages**

Toggle language — column headers, toolbar labels, context menu, and delete confirmation should switch.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Portfolio.jsx
git commit -m "feat(i18n): translate Portfolio page — toolbar, table, actions, other assets"
```

---

### Task 9: Update AddStockModal + other modals

**Files:**
- Modify: `src/components/AddStockModal.jsx`
- Modify: `src/components/SellStockModal.jsx` (if exists)
- Modify: `src/components/EditPositionModal.jsx` (if exists)
- Modify: `src/components/AddDividendModal.jsx` (if exists)

- [ ] **Step 1: Update AddStockModal.jsx**

Add to imports:
```jsx
import { useLanguage, useT } from '../context/LanguageContext';
```

Inside component:
```jsx
const t = useT();
```

Replace error messages in `handleSave()`:
```jsx
if (!sym) { setError(t('err_enter_symbol')); return; }
if (isNaN(resolvedQty) || resolvedQty <= 0) { setError(t('err_enter_qty')); return; }
if (isNaN(resolvedPrice) || resolvedPrice <= 0) { setError(t('err_enter_price')); return; }
// ...
setError(e.message || t('save_error'));
```

Replace UI strings:
- `'Dodaj spółkę do portfela'` → `{t('add_stock_title')}`
- `'Symbol tickera *'` → `{t('ticker_symbol')}`
- `placeholder="np. AAPL, PKN.WA, MSFT"` → (keep as is — these are ticker examples, not UI text)
- `'🇵🇱 GPW: dodaj .WA (np. PKN.WA) · 🇺🇸 US: bez sufiksu (np. AAPL)'` → `{t('ticker_hint_gpw')}`
- `'Masz już'` → `{t('already_own_prefix')}`  
  Full line: `` `Masz już ${existing.qty} szt. po śr. ${existing.avgPrice}...` ``
  → `` `${t('already_own_prefix')} ${existing.qty} ${t('already_own_suffix')} ${existing.avgPrice}... ${t('will_average')}` ``
- `[['qty', 'Ilość'], ['value', 'Wartość transakcji']]` → `[['qty', t('mode_qty')], ['value', t('mode_value')]]`
- `mode === 'qty' ? 'Ilość akcji *' : 'Wartość transakcji *'` → `mode === 'qty' ? t('qty_label') : t('value_label')`
- `'Cena zakupu *'` → `{t('buy_price_label')}`
- `'Waluta'` → `{t('currency_label')}`
- `'Data zakupu'` → `{t('buy_date_label')}`
- `'Notatka (opcjonalna)'` → `{t('note_label')}`
- `placeholder="np. długoterminowo, dywidendowa…"` → `placeholder={t('note_placeholder')}`
- `'Źródło środków'` → `{t('source_of_funds')}`
- `[['topup', '💼 Dopłata'], ['cash', '💵 Odejmij od gotówki']]` → `[['topup', t('top_up')], ['cash', t('deduct_cash')]]`
- `'Anuluj'` → `{t('cancel')}`
- `saving ? 'Zapisuję…' : 'Dodaj do portfela'` → `saving ? t('saving') : t('add_to_portfolio')`

- [ ] **Step 2: Update other modals (SellStockModal, EditPositionModal, AddDividendModal)**

Apply the same useT pattern to each modal file. Key strings to replace:
- All button labels (Anuluj/Cancel, Zapisz/Save, Zapisuję…/Saving…)
- All field labels and placeholders
- All error messages

Check each file for Polish strings using:
```bash
grep -n "[ąęółńćźżśĄĘÓŁŃĆŹŻŚ]" src/components/SellStockModal.jsx src/components/EditPositionModal.jsx src/components/AddDividendModal.jsx
```

Add `t()` calls for any found strings, adding new keys to the dictionaries if needed.

- [ ] **Step 3: Commit**

```bash
git add src/components/AddStockModal.jsx src/components/SellStockModal.jsx src/components/EditPositionModal.jsx src/components/AddDividendModal.jsx
git commit -m "feat(i18n): translate AddStockModal and other modals"
```

---

### Task 10: Update History + Transactions

**Files:**
- Modify: `src/pages/History.jsx`
- Modify: `src/pages/Transactions.jsx`

- [ ] **Step 1: Update History.jsx**

Add imports + hooks:
```jsx
import { useLanguage, useT } from '../context/LanguageContext';
// Inside component:
const { locale } = useLanguage();
const t = useT();
```

Fix `fmt()` to use locale.

Replace strings:
- `'Brak'` (period option) → `t('no_data')`
- CSV export headers: `['Data', 'Wartość (PLN)', 'Zainwestowano (PLN)']` → `[t('col_date'), t('value_pln_header'), t('invested_pln_header')]`
- `'Historia pojawi się po pierwszym odświeżeniu portfela'` → `{t('history_first_refresh')}`
- `'Wartość (filtr)'` → `{t('value_filter')}`
- `'Wartość portfela'` (Card title) → `{t('portfolio_value')}`
- `'Rolling Returns — kroczące stopy zwrotu'` → `{t('rolling_returns')}`
- `{filtered.length} wpisów` → `` {filtered.length} {t('entries')} ``
- `<th className="right">Wartość</th>` → `<th className="right">{t('col_value')}</th>`
- `'Za mało danych historycznych'` → `{t('not_enough_history')}`

Also fix any `toLocaleString('pl-PL'...)` calls in History.jsx to use `locale`.

- [ ] **Step 2: Update Transactions.jsx**

Add imports + hooks:
```jsx
import { useLanguage, useT } from '../context/LanguageContext';
const { locale } = useLanguage();
const t = useT();
```

Replace strings:
- `{ value: 'SELL', label: 'Sprzedaż' }` etc. → dynamic labels using `t()`
- `const TAG_LABEL = { BUY: t('type_buy'), SELL: t('type_sell'), DIV: t('type_div'), DIVIDEND: t('type_div'), CASH: t('type_cash') }` — move inside component
- `'Dodaj transakcję'` → `{t('add_transaction_title')}`
- `'Kupno'/'Sprzedaż'/'Dywidenda'/'Gotówka'` → `t()` equivalents
- `'Ilość'` (label) → `{t('qty_short')}`
- `'Sprzedaże 30d'` → `{t('sells_30d')}`
- `'Gotówka 30d'` → `{t('cash_30d')}`
- `<th className="right">Ilość</th>` → `{t('col_qty')}`
- `<th className="right">Wartość</th>` → `{t('col_value')}`
- Error messages: `'Podaj ilość'` → `t('err_enter_qty_short')`, `'Podaj cenę'` → `t('err_enter_price_short')`, `'Błąd zapisu'` → `t('save_error')`

Fix `toLocaleString('pl-PL'...)` calls to use `locale`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/History.jsx src/pages/Transactions.jsx
git commit -m "feat(i18n): translate History and Transactions pages"
```

---

### Task 11: Update Dividends + Watchlist

**Files:**
- Modify: `src/pages/Dividends.jsx`
- Modify: `src/pages/Watchlist.jsx`

- [ ] **Step 1: Update Dividends.jsx**

Add imports + hooks:
```jsx
import { useLanguage, useT } from '../context/LanguageContext';
const { locale } = useLanguage();
const t = useT();
```

Fix `fmt()` to use `locale`.

Replace the MONTHS array:
```jsx
const MONTHS = t('months');
```

Replace all Polish strings per the dictionary keys: `last_12m_sub`, `yield_sub`, `upcoming_30d`, `set_monthly_goal`, `change_goal`, `of_monthly_goal`, `goal_achieved`, `gross`, `net`, `display_mode`, `gpw_dividends_note`, `add_dividend_gpw`, `add_manually`, `manual_source`, `auto_source`, `no_upcoming_div`, `us_no_data_note`, `upcoming_dividends`, `payment_timeline`, `div_per_company`, `payment_history`, `total_dividends`, `num_payments`, `dividend_companies`, `no_div_companies`, `no_div_hint`, `total_pln_header`, and table headers `col_company`, `col_payments`, `col_source`, `col_date`.

- [ ] **Step 2: Update Watchlist.jsx**

Add imports + hooks:
```jsx
import { useLanguage, useT } from '../context/LanguageContext';
const { locale } = useLanguage();
const t = useT();
```

Replace strings per dictionary keys: `watched_companies`, `loading_quotes`, `watched_synced`, `owned_companies`, `above_alert`, `below_alert`, `click_to_remove`, `col_day`, `col_qty`, `col_avg_price_short`.

Fix `toLocaleString('pl-PL'...)` to use `locale`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Dividends.jsx src/pages/Watchlist.jsx
git commit -m "feat(i18n): translate Dividends and Watchlist pages"
```

---

### Task 12: Update remaining pages (Calendar, Analysis, ScenarioLab, AiInsights)

**Files:**
- Modify: `src/pages/Calendar.jsx`
- Modify: `src/pages/Analysis.jsx`
- Modify: `src/pages/ScenarioLab.jsx`
- Modify: `src/pages/AiInsights.jsx`

- [ ] **Step 1: Grep each file for Polish strings**

```bash
grep -n "[ąęółńćźżśĄĘÓŁŃĆŹŻŚ]" \
  src/pages/Calendar.jsx \
  src/pages/Analysis.jsx \
  src/pages/ScenarioLab.jsx \
  src/pages/AiInsights.jsx
```

For each Polish string found, add a key to both `pl.js` and `en.js`, then replace with `t('key')`.

Common patterns to look for in each file:
- Page title / section labels
- Table headers
- Button text
- Empty states
- Form labels
- `toLocaleString('pl-PL'...)` calls

- [ ] **Step 2: Apply useT to each file**

For each file, the pattern is the same:
```jsx
import { useLanguage, useT } from '../context/LanguageContext';
// inside component:
const { locale } = useLanguage();
const t = useT();
// fix fmt() to use locale
// replace all Polish strings with t('key')
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Calendar.jsx src/pages/Analysis.jsx src/pages/ScenarioLab.jsx src/pages/AiInsights.jsx
git commit -m "feat(i18n): translate Calendar, Analysis, ScenarioLab, AiInsights pages"
```

---

### Task 13: Update AuthScreen

**Files:**
- Modify: `src/components/auth/AuthScreen.jsx`

- [ ] **Step 1: Update AuthScreen.jsx**

Note: AuthScreen may not have access to LanguageContext if the app wraps auth separately. Verify by checking if AuthGate renders AuthScreen inside or outside the LanguageProvider tree. If outside, move LanguageProvider higher in the tree — currently it wraps the whole app in main.jsx, so it should be available.

Add imports + hooks:
```jsx
import { useT } from '../context/LanguageContext';
const t = useT();
```

Replace strings:
- `placeholder="nazwa użytkownika"` → `placeholder={t('username_placeholder')}`
- Any other labels / buttons

- [ ] **Step 2: Commit**

```bash
git add src/components/auth/AuthScreen.jsx
git commit -m "feat(i18n): translate AuthScreen"
```

---

### Task 14: Audit remaining fmt() / toLocaleString calls

**Files:** All pages and components with `toLocaleString('pl-PL'...)` or `toLocaleDateString('pl-PL'...)`

- [ ] **Step 1: Find all remaining hardcoded locale strings**

```bash
grep -rn "toLocaleString('pl-PL\|toLocaleDateString('pl-PL" src/
```

- [ ] **Step 2: Replace each occurrence**

For each hit, the file needs `const { locale } = useLanguage()` and the string replaced with `locale`.

Common locations:
- `src/hooks/usePortfolioMetrics.js` — if any `'pl-PL'` calls exist, pass `locale` as parameter or use the hook
- `src/components/HistoryChart.jsx` — axis date labels
- `src/components/DividendCalendar.jsx` — date labels

For hook files that can't use React hooks directly (non-component files), pass `locale` as a parameter from the calling component.

- [ ] **Step 3: Verify number and date formatting**

In English mode:
- Numbers should show `1,234.56` (comma thousands separator, period decimal)
- Dates should show `Tuesday, June 9`

In Polish mode:
- Numbers should show `1 234,56` (space thousands separator, comma decimal)
- Dates should show `wtorek, 9 czerwca`

- [ ] **Step 4: Commit**

```bash
git add -p
git commit -m "feat(i18n): fix all remaining toLocaleString calls to use dynamic locale"
```

---

### Task 15: Deploy and verify

- [ ] **Step 1: Run build locally to catch any errors**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Deploy to Vercel**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && vercel --prod
```

- [ ] **Step 3: Verify on production**

Open `https://myfund-app.vercel.app` in browser:
1. Confirm default language is Polish
2. Click 🇬🇧 in header — all UI switches to English
3. Reload — English persists
4. Open /settings — Language section shows two buttons
5. Click 🇵🇱 Polski — switches back to Polish
6. Check date subtitle in Dashboard is localized
7. Check number formatting (portfolio value should use correct decimal separator)
8. Open AddStockModal — all labels in correct language

- [ ] **Step 4: Final commit if any prod fixes needed**

```bash
git add .
git commit -m "fix(i18n): production fixes after deploy"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - ✅ LanguageContext with `language`, `locale`, `setLanguage`, `toggle` — Task 1
   - ✅ pl.js and en.js with ~200 keys — Task 2
   - ✅ LanguageProvider in main.jsx — Task 3
   - ✅ Flag toggle in Header — Task 3
   - ✅ Language section in Settings — Task 4
   - ✅ navItems dynamic labels — Task 5
   - ✅ InsightStrip translated — Task 6
   - ✅ All 11 pages — Tasks 7–12
   - ✅ All modals — Task 9
   - ✅ Locale-aware date/number formatting — Tasks 7–12, 14
   - ✅ localStorage persistence — Task 1 (LANG_KEY)
   - ✅ Fallback chain: en → pl → key — Task 1

2. **Type consistency:**
   - `useT()` returns `(key: string) => string` — consistent throughout
   - `getNavItems(t)` and `getNavBottom(t)` replace static exports — Sidebar updated accordingly
   - `locale` from `useLanguage()` used everywhere instead of `'pl-PL'`

3. **Scope:** Currency symbol `zł` / `PLN` stays as-is per spec — these are financial data identifiers.

4. **Missing keys:** If any page grep finds strings not covered in the dictionaries (Task 12 Step 1), add them to both pl.js and en.js before replacing.
