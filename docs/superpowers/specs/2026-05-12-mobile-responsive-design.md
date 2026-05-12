# Mobile Responsive Design — StocksTracker

**Data:** 2026-05-12  
**Zakres:** frontend-react/src — komponenty layout + strony  
**Priorytet:** hamburger menu (nawigacja mobile)

---

## 1. Problem

Na mobile (<640px) sidebar zajmuje ~220px z ~390px szerokości ekranu, content jest wciśnięty, przyciski za małe na dotyk, fonty nie skalują się.

---

## 2. Architektura nawigacji

**Desktop (≥ 1024px):** Sidebar widoczny, Layout bez zmian.  
**Tablet (640–1024px):** Sidebar zwinięty (tylko ikony), hamburger dostępny.  
**Mobile (< 640px):** Sidebar ukryty (`hidden md:flex`), hamburger w headerze otwiera MobileDrawer.

Stan `isMenuOpen: boolean` trzymany w `Layout.jsx`, przekazywany propsami do `Header` i `MobileDrawer`. Bez nowego kontekstu.

---

## 3. Komponenty do zmiany

### Layout.jsx
- Dodaje `useState(false)` → `isMenuOpen`
- Renderuje `<MobileDrawer>` + overlay gdy open
- Sidebar owijany `<div className="hidden md:flex">` (znika na mobile)

### Header.jsx
- Dostaje prop `onMenuToggle`
- Hamburger button (3 linie, 44×44px) widoczny tylko `md:hidden` — lewa strona
- Tytuł strony — środek
- Refresh button — prawa strona
- Height: 56px (touch-friendly)

### MobileDrawer.jsx (nowy)
- Slide-in z lewej, 80% szerokości, maks 320px
- Semi-transparent overlay za (bg-slate-900/60)
- Animacja: `translate-x-[-100%]` → `translate-x-0`, transition 300ms
- Zawiera te same `NAV_ITEMS` co Sidebar
- Zamknięcie: X button (44×44px), klik overlay, kliknięcie NavLink
- Identyczny styl nawigacji jak Sidebar

---

## 4. Responsywność stron (Tailwind breakpoints)

**Padding/spacing:**
- `p-4 md:p-6` — content area
- Karty: `px-4 py-3 md:px-5 md:py-4`

**Dashboard — KPI cards:**
- `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` (było: `grid-cols-2 xl:grid-cols-4`)

**Tabele (Portfolio, History, Transactions, Dividends):**
- Wrapper: `overflow-x-auto` — poziomy scroll na mobile
- Kolumny: bez zmian (scroll zamiast ukrywania — dane finansowe muszą być kompletne)

**History — grid nagłówkowy:**
- `grid-cols-1 sm:grid-cols-3` (było: `grid-cols-3`)

**LoginForm:**
- Input font-size: `text-base` (≥16px zapobiega zoom na iOS)
- Button: `min-h-[44px]`

**Ogólne przyciski sortowania/filtrów:**
- `min-h-[36px] min-w-[36px]` — touch targets

---

## 5. Typografia i spacing

| Element | Mobile | Desktop |
|---------|--------|---------|
| H1 (tytuł strony) | 16px (text-base) | 16px (bez zmian) |
| Body | 14px (text-sm) | 14px |
| Input font | 16px (text-base) | 14px |
| Button min-height | 44px | bez zmian |
| Content padding | 16px (p-4) | 24px (p-6) |

---

## 6. Co NIE zmienia się

- `AppContext.jsx` — brak zmian
- `index.css` — Tailwind utility klas wystarczy, brak custom CSS
- `tailwind.config.js` — domyślne breakpointy Tailwind (sm:640, md:768, lg:1024) są OK
- Routing, dane, hooks — bez zmian
- Dark mode — aplikacja już jest dark-only; system preference detection poza zakresem

---

## 7. Pliki do modyfikacji

```
src/components/layout/Layout.jsx       — stan isMenuOpen, overlay, conditional sidebar
src/components/layout/Header.jsx       — hamburger button, prop onMenuToggle
src/components/layout/MobileDrawer.jsx — NOWY: drawer komponent
src/components/LoginForm.jsx           — text-base dla inputów
src/pages/Dashboard.jsx                — grid-cols-1 sm:grid-cols-2
src/pages/History.jsx                  — grid-cols-1 sm:grid-cols-3
src/pages/Portfolio.jsx                — overflow-x-auto na tabeli
src/pages/Transactions.jsx             — overflow-x-auto na tabeli
src/pages/Dividends.jsx                — overflow-x-auto na tabeli
src/pages/Calendar.jsx                 — padding mobile
src/pages/Watchlist.jsx                — overflow-x-auto na tabeli
src/pages/Settings.jsx                 — full-width inputs/buttons
```

---

## 8. Kryteria sukcesu

- Na 390px (iPhone 14): hamburger widoczny, sidebar ukryty
- Drawer otwiera/zamyka się płynnie (300ms)
- Klik poza drawer = zamknięcie
- Wszystkie tabele scrollują poziomo, nie łamią layoutu
- Formularze nie triggerują zoom na iOS (font ≥16px)
- Desktop bez regresji
