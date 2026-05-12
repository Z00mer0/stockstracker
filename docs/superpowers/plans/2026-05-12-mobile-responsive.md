# Mobile Responsive Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zoptymalizować StocksTracker na mobile — hamburger menu + drawer nawigacyjny, responsywny layout i tabele scrollujące poziomo.

**Architecture:** Stan `isMenuOpen` trzymany w `Layout.jsx` i przekazywany propsami do `Header` i nowego `MobileDrawer`. Sidebar chowany na `md:hidden`. Responsywność stron wyłącznie przez Tailwind breakpoints (bez nowego CSS).

**Tech Stack:** React 18, Tailwind CSS 3, React Router v7, Vite 5

---

## Mapa plików

| Plik | Akcja | Co się zmienia |
|------|-------|---------------|
| `src/components/layout/Layout.jsx` | Modyfikuj | Stan `isMenuOpen`, overlay, sidebar tylko `hidden md:flex` |
| `src/components/layout/Header.jsx` | Modyfikuj | Prop `onMenuToggle`, hamburger button `md:hidden` |
| `src/components/layout/MobileDrawer.jsx` | Utwórz | Drawer z lewej, overlay, animacja 300ms |
| `src/components/LoginForm.jsx` | Modyfikuj | `text-base` na inputach (zapobiega zoom iOS) |
| `src/pages/Dashboard.jsx` | Modyfikuj | KPI grid `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` |
| `src/pages/History.jsx` | Modyfikuj | Summary grid `grid-cols-1 sm:grid-cols-3`, table overflow |
| `src/pages/Portfolio.jsx` | Modyfikuj | Table `overflow-x-auto` wrapper |
| `src/pages/Transactions.jsx` | Modyfikuj | Table `overflow-x-auto` wrapper |
| `src/pages/Dividends.jsx` | Modyfikuj | Tables `overflow-x-auto`, KPI grid `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` |
| `src/pages/Watchlist.jsx` | Modyfikuj | Tables `overflow-x-auto` |
| `src/pages/Calendar.jsx` | Modyfikuj | Week grid `overflow-x-auto`, tables `overflow-x-auto` |
| `src/pages/Settings.jsx` | Modyfikuj | Buttons `flex-col sm:flex-row` |

**Brak zmian:** AppContext, routing, hooks, index.css, tailwind.config.js

---

## Task 1: MobileDrawer — nowy komponent

**Pliki:**
- Utwórz: `src/components/layout/MobileDrawer.jsx`

- [ ] **Krok 1: Utwórz plik MobileDrawer.jsx**

```jsx
// src/components/layout/MobileDrawer.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

const NAV_ITEMS = [
  { to: '/',             icon: '📊', label: 'Dashboard'   },
  { to: '/portfolio',    icon: '💼', label: 'Portfel'      },
  { to: '/history',      icon: '📈', label: 'Historia'     },
  { to: '/transactions', icon: '📋', label: 'Transakcje'   },
  { to: '/dividends',    icon: '💰', label: 'Dywidendy'    },
  { to: '/calendar',     icon: '📅', label: 'Kalendarz'    },
  { to: '/watchlist',    icon: '👁', label: 'Watchlist'    },
  { to: '/settings',     icon: '⚙️', label: 'Ustawienia'   },
];

export default function MobileDrawer({ isOpen, onClose }) {
  const { displayName, logout } = useApp();

  function handleNavClick() {
    onClose();
  }

  function handleLogout() {
    onClose();
    logout();
  }

  return (
    <>
      {/* Overlay — klik zamyka drawer */}
      <div
        className={`fixed inset-0 z-40 bg-slate-900/60 transition-opacity duration-300 md:hidden ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-4/5 max-w-xs flex flex-col bg-slate-950 border-r border-slate-800 transition-transform duration-300 md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Menu nawigacyjne"
      >
        {/* Nagłówek drawera */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📈</span>
            <span className="font-bold text-sm text-slate-100 tracking-wide">StocksTracker</span>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            aria-label="Zamknij menu"
          >
            ✕
          </button>
        </div>

        {/* Nawigacja */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600/20 text-indigo-400 border-r-2 border-indigo-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`
              }
            >
              <span className="text-base leading-none">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Stopka — użytkownik + wyloguj */}
        <div className="px-5 py-4 border-t border-slate-800">
          {displayName && (
            <p className="text-xs text-slate-500 mb-3 truncate">{displayName}</p>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Wyloguj →
          </button>
        </div>
      </aside>
    </>
  );
}
```

- [ ] **Krok 2: Weryfikacja statyczna — sprawdź import i składnię**

Otwórz plik, upewnij się że:
- import `NavLink` z `react-router-dom`
- import `useApp` ze ścieżki `../../context/AppContext`
- prop `isOpen: boolean`, `onClose: function`
- klasa `md:hidden` na obu elementach (overlay i aside)

---

## Task 2: Layout.jsx — stan menu + integracja MobileDrawer

**Pliki:**
- Modyfikuj: `src/components/layout/Layout.jsx`

- [ ] **Krok 1: Zastąp całą zawartość Layout.jsx**

```jsx
// src/components/layout/Layout.jsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileDrawer from './MobileDrawer';

export default function Layout() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 overflow-hidden">
      {/* Sidebar — widoczny tylko md+ */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Drawer mobile */}
      <MobileDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      {/* Główny obszar */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuToggle={() => setIsMenuOpen(prev => !prev)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Krok 2: Sprawdź w przeglądarce — desktop**

Odpal dev server: `cd frontend-react && npm start`  
Otwórz `http://localhost:3000`  
Sprawdź że sidebar jest widoczny, layout bez zmian.

---

## Task 3: Header.jsx — hamburger button

**Pliki:**
- Modyfikuj: `src/components/layout/Header.jsx`

- [ ] **Krok 1: Zastąp całą zawartość Header.jsx**

```jsx
// src/components/layout/Header.jsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

const PAGE_TITLES = {
  '/':             'Dashboard',
  '/portfolio':    'Portfel',
  '/history':      'Historia wartości',
  '/transactions': 'Transakcje',
  '/dividends':    'Dywidendy',
  '/calendar':     'Kalendarz',
  '/watchlist':    'Watchlist',
  '/settings':     'Ustawienia',
};

export default function Header({ onMenuToggle }) {
  const { pathname } = useLocation();
  const { loading, refresh } = useApp();
  const title = PAGE_TITLES[pathname] ?? 'StocksTracker';

  return (
    <header className="h-14 flex-shrink-0 flex items-center gap-3 px-4 md:px-6 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      {/* Hamburger — widoczny tylko na mobile */}
      <button
        onClick={onMenuToggle}
        className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex-shrink-0"
        aria-label="Otwórz menu"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <rect x="2" y="4" width="16" height="2" rx="1"/>
          <rect x="2" y="9" width="16" height="2" rx="1"/>
          <rect x="2" y="14" width="16" height="2" rx="1"/>
        </svg>
      </button>

      {/* Tytuł strony */}
      <h1 className="flex-1 text-base font-semibold text-slate-100 truncate">{title}</h1>

      {/* Odśwież */}
      <button
        onClick={refresh}
        disabled={loading}
        title="Odśwież dane"
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800 flex-shrink-0"
      >
        <span className={loading ? 'animate-spin' : ''}>↻</span>
        <span className="hidden sm:inline">{loading ? 'Ładowanie…' : 'Odśwież'}</span>
      </button>
    </header>
  );
}
```

- [ ] **Krok 2: Weryfikacja w przeglądarce — mobile**

W DevTools otwórz widok mobile (iPhone 14, 390×844).  
Sprawdź że:
- hamburger (3 linie) widoczny po lewej
- klik hamburger → drawer wyjeżdża z lewej
- klik overlay / X → drawer zamknięty
- klik link w drawerze → nawiguje + zamknięcie drawera
- na desktop (≥768px) hamburger niewidoczny, sidebar widoczny

- [ ] **Krok 3: Commit**

```bash
git add src/components/layout/Layout.jsx src/components/layout/Header.jsx src/components/layout/MobileDrawer.jsx
git commit -m "feat: hamburger menu + mobile drawer nawigacyjny"
```

---

## Task 4: Dashboard — responsywne KPI cards

**Pliki:**
- Modyfikuj: `src/pages/Dashboard.jsx`

- [ ] **Krok 1: Zmień grid KPI cards (linia z `grid-cols-2 xl:grid-cols-4`)**

Znajdź:
```jsx
<div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
```

Zastąp:
```jsx
<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
```

- [ ] **Krok 2: Dodaj overflow-x-auto do tabeli "Największe pozycje"**

Znajdź:
```jsx
<div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
  <div className="px-5 py-4 border-b border-slate-700">
    <h2 className="text-sm font-semibold text-slate-300">Największe pozycje (wg kosztu)</h2>
  </div>
  <table className="w-full text-sm">
```

Zastąp:
```jsx
<div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
  <div className="px-5 py-4 border-b border-slate-700">
    <h2 className="text-sm font-semibold text-slate-300">Największe pozycje (wg kosztu)</h2>
  </div>
  <div className="overflow-x-auto">
  <table className="w-full text-sm">
```

I zamknij nowy `</div>` przed `</div>` kończącym kartę (po `</table>`):
```jsx
      </tbody>
    </table>
    </div>
  </div>
```

- [ ] **Krok 3: Weryfikacja na mobile**

Na 390px — karty w jednej kolumnie, tabela scrolluje poziomo.  
Na 640px+ — 2 karty w rzędzie.  
Na 1280px+ — 4 karty w rzędzie.

- [ ] **Krok 4: Commit**

```bash
git add src/pages/Dashboard.jsx
git commit -m "feat(mobile): Dashboard — grid-cols-1 mobile, table overflow-x-auto"
```

---

## Task 5: History — responsywny grid + tabela

**Pliki:**
- Modyfikuj: `src/pages/History.jsx`

- [ ] **Krok 1: Zmień grid podsumowania (linia z `grid-cols-3`)**

Znajdź:
```jsx
<div className="grid grid-cols-3 gap-4">
```

Zastąp:
```jsx
<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
```

- [ ] **Krok 2: Dodaj overflow-x-auto do tabeli snapshots**

Znajdź:
```jsx
<div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
  <div className="px-5 py-4 border-b border-slate-700">
    <h2 className="text-sm font-semibold text-slate-300">Ostatnie 30 snapshots</h2>
  </div>
  <table className="w-full text-sm">
```

Zastąp:
```jsx
<div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
  <div className="px-5 py-4 border-b border-slate-700">
    <h2 className="text-sm font-semibold text-slate-300">Ostatnie 30 snapshots</h2>
  </div>
  <div className="overflow-x-auto">
  <table className="w-full text-sm">
```

I zamknij `</div>` przed końcowym `</div>` karty.

- [ ] **Krok 3: Weryfikacja**

Na 390px — 3 karty w jednej kolumnie (stack), tabela scrolluje.

- [ ] **Krok 4: Commit**

```bash
git add src/pages/History.jsx
git commit -m "feat(mobile): History — grid-cols-1 mobile, table overflow"
```

---

## Task 6: Portfolio — tabela overflow

**Pliki:**
- Modyfikuj: `src/pages/Portfolio.jsx`

- [ ] **Krok 1: Opakuj tabelę w div overflow-x-auto**

Znajdź:
```jsx
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
              <th className="text-left px-5 py-2.5">Symbol</th>
```

Zastąp (dodaj wrapper div przed i zamknij go po `</table>`):
```jsx
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
              <th className="text-left px-5 py-2.5">Symbol</th>
```

Po `</table>` dodaj `</div>`.

- [ ] **Krok 2: Weryfikacja**

Na 390px tabela portfolio scrolluje poziomo, nie łamie layoutu.

- [ ] **Krok 3: Commit**

```bash
git add src/pages/Portfolio.jsx
git commit -m "feat(mobile): Portfolio — table overflow-x-auto"
```

---

## Task 7: Transactions — tabela overflow + filtry touch-friendly

**Pliki:**
- Modyfikuj: `src/pages/Transactions.jsx`

- [ ] **Krok 1: Opakuj tabelę w div overflow-x-auto**

Znajdź w Transactions.jsx:
```jsx
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <table className="w-full text-sm">
```

Zastąp:
```jsx
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
```

Po `</table>` dodaj `</div>`.

- [ ] **Krok 2: Zwiększ touch target przycisków filtrów**

Znajdź:
```jsx
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
```

Zastąp:
```jsx
            className={`text-xs px-3 py-2 rounded-lg font-medium transition-colors min-h-[36px] ${
```

- [ ] **Krok 3: Weryfikacja**

Na mobile — filtry łatwe do kliknięcia, tabela scrolluje poziomo.

- [ ] **Krok 4: Commit**

```bash
git add src/pages/Transactions.jsx
git commit -m "feat(mobile): Transactions — overflow + touch targets"
```

---

## Task 8: Dividends — grid + tabele

**Pliki:**
- Modyfikuj: `src/pages/Dividends.jsx`

- [ ] **Krok 1: Zmień KPI grid**

Znajdź:
```jsx
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
```

Zastąp:
```jsx
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
```

- [ ] **Krok 2: Dodaj overflow-x-auto do obu tabel**

W Dividends.jsx są dwie tabele (per-spółka i historia). Dla każdej znajdź `<table className="w-full text-sm">` i opakuj w `<div className="overflow-x-auto">...</div>`.

Tabela 1 (ranking spółek) — opakuj:
```jsx
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* thead + tbody bez zmian */}
        </table>
        </div>
```

Tabela 2 (historia dywidend) — tak samo.

- [ ] **Krok 3: Commit**

```bash
git add src/pages/Dividends.jsx
git commit -m "feat(mobile): Dividends — grid + overflow tables"
```

---

## Task 9: Watchlist — tabele overflow

**Pliki:**
- Modyfikuj: `src/pages/Watchlist.jsx`

- [ ] **Krok 1: Opakuj obie tabele w div overflow-x-auto**

Watchlist.jsx ma dwie tabele (watchlist i portfolio). Dla każdej:

Znajdź `<table className="w-full text-sm">` i dodaj wrapper:
```jsx
<div className="overflow-x-auto">
<table className="w-full text-sm">
  {/* zawartość bez zmian */}
</table>
</div>
```

- [ ] **Krok 2: Commit**

```bash
git add src/pages/Watchlist.jsx
git commit -m "feat(mobile): Watchlist — overflow tables"
```

---

## Task 10: Calendar — week grid + tabele

**Pliki:**
- Modyfikuj: `src/pages/Calendar.jsx`

- [ ] **Krok 1: Zmień KPI grid w Calendar**

Znajdź:
```jsx
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
```

Zastąp:
```jsx
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
```

- [ ] **Krok 2: Opakuj week grid w overflow-x-auto**

Znajdź wrapper tygodniowy (szukaj `grid-cols-7`):
```jsx
<div className="rounded-xl border border-slate-700 bg-slate-800 px-...">
```

Znajdź sekcję kalendarza tygodniowego i opakuj wewnętrzny `grid-cols-7` w overflow:
```jsx
<div className="overflow-x-auto">
  <div style={{ minWidth: '480px' }}>
    {/* week header i week rows z grid-cols-7 */}
  </div>
</div>
```

- [ ] **Krok 3: Opakuj tabele events w overflow-x-auto**

Podobnie jak wcześniej — znajdź `<table className="w-full text-sm">` i opakuj.

- [ ] **Krok 4: Commit**

```bash
git add src/pages/Calendar.jsx
git commit -m "feat(mobile): Calendar — grid + week overflow + table overflow"
```

---

## Task 11: LoginForm — iOS zoom fix

**Pliki:**
- Modyfikuj: `src/components/LoginForm.jsx`

- [ ] **Krok 1: Zmień font-size inputów z text-sm na text-base**

Znajdź oba inputy (username i password). Dla każdego zmień klasę:
```jsx
className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
```

Zastąp:
```jsx
className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-indigo-500"
```

**Dlaczego:** iOS automatycznie zoom-uje formularz gdy font-size < 16px (`text-sm` = 14px). `text-base` = 16px zapobiega temu.

- [ ] **Krok 2: Zwiększ przycisk submit**

Znajdź:
```jsx
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg py-2 text-sm font-semibold transition-colors"
```

Zastąp:
```jsx
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg py-3 text-base font-semibold transition-colors"
```

- [ ] **Krok 3: Commit**

```bash
git add src/components/LoginForm.jsx
git commit -m "feat(mobile): LoginForm — text-base prevents iOS zoom, larger button"
```

---

## Task 12: Settings — responsywne przyciski

**Pliki:**
- Modyfikuj: `src/pages/Settings.jsx`

- [ ] **Krok 1: Przyciski konta w flex-col na mobile**

Znajdź:
```jsx
          <div className="pt-2 border-t border-slate-700 flex gap-3">
```

Zastąp:
```jsx
          <div className="pt-2 border-t border-slate-700 flex flex-col sm:flex-row gap-3">
```

- [ ] **Krok 2: Dodaj min-height do przycisków**

Dla obu przycisków (Odśwież i Wyloguj) dodaj `min-h-[44px]`:
```jsx
            className="text-sm px-4 py-2 min-h-[44px] rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium"
```

```jsx
            className="text-sm px-4 py-2 min-h-[44px] rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-slate-300"
```

- [ ] **Krok 3: Commit**

```bash
git add src/pages/Settings.jsx
git commit -m "feat(mobile): Settings — stacked buttons mobile, touch targets"
```

---

## Task 13: Finalny test + deploy

- [ ] **Krok 1: Uruchom dev server i przetestuj manualnie**

```bash
cd frontend-react && npm start
```

Otwórz `http://localhost:3000` w DevTools (iPhone 14 Pro, 393×852).

Checklist testów:
- [ ] Hamburger widoczny (lewy górny róg)
- [ ] Klik hamburger → drawer wyjeżdża (animacja)
- [ ] Klik poza drawer / overlay → zamknięcie
- [ ] Klik X w drawerze → zamknięcie
- [ ] Klik link w drawerze → nawigacja + zamknięcie
- [ ] Sidebar niewidoczny na mobile
- [ ] Sidebar widoczny na desktop (≥768px)
- [ ] Dashboard: 1 karta w kolumnie na 390px
- [ ] Tabele: scrollują poziomo (nie overflow hidden)
- [ ] Login: brak zoom na iOS przy kliknięciu input
- [ ] Header: tylko ikona odświeżania (tekst "Odśwież" ukryty na mobile)

- [ ] **Krok 2: Push na Render**

```bash
git push origin main
```

Auto-deploy uruchomi się na Render (~3-5 minut).

- [ ] **Krok 3: Weryfikacja na Render**

Otwórz na telefonie: `https://stockstracker.onrender.com/app`  
Zaloguj: `test123` / `test1234`  
Sprawdź hamburger, nawigację, tabele.
