# StocksTracker — Modern Dark Redesign

**Date:** 2026-05-21  
**Source:** `frontend-react/design_handoff_stockstracker_redesign/README.md` (GitHub: Z00mer0/stockstracker)  
**Scope:** Visual layer only — domain logic (FX, P&L, snapshots, API) unchanged.  
**Stack:** Vite + React 18 + react-router-dom + Tailwind CSS (existing)  
**Approach:** Option A — CSS tokens + global utility classes

---

## 1. Constraints

- No changes to hooks, context, services, utils, or API logic.
- All existing routing paths preserved (`/dashboard`, `/portfolio`, `/history`, `/transactions`, `/dividends`, `/calendar`, `/watchlist`, `/scenario`, `/analysis`, `/settings`, `/stock/:symbol`).
- Tailwind stays for layout utilities (`flex`, `grid`, `gap-*`, `p-*`). Colors and component styles move to CSS custom properties + semantic classes.
- Desktop-first (1280px+). Mobile is out of scope.
- No real company logos — 2-char mono ticker placeholders.
- Tweaks panel is out of scope for this round.

---

## 2. CSS Layer (`src/index.css`)

### Design tokens — replace existing `:root`

```css
:root {
  --bg:            #0a0b0d;
  --bg-2:          #0f1115;
  --panel:         #13161b;
  --panel-2:       #181c22;
  --panel-hover:   #1c2028;
  --border:        #20252d;
  --border-strong: #2a313b;
  --text:          #e8ebef;
  --text-dim:      #8a929d;
  --text-faint:    #5a626c;
  --up:            #00d97e;
  --up-soft:       rgba(0, 217, 126, 0.12);
  --down:          #ff4d6d;
  --down-soft:     rgba(255, 77, 109, 0.12);
  --accent:        #00d97e;
  --warn:          #ffb020;
  --info:          #7c9eff;
  --radius:        10px;
}

[data-theme="light"] {
  --bg:            #f6f7f9;
  --bg-2:          #ffffff;
  --panel:         #ffffff;
  --panel-2:       #fafbfc;
  --panel-hover:   #f1f3f6;
  --border:        #e6e9ed;
  --border-strong: #d1d6dc;
  --text:          #0e1116;
  --text-dim:      #5a626c;
  --text-faint:    #8a929d;
  --up:            #009d5a;
  --down:          #d92d4e;
}
```

Theme toggle: `document.documentElement.setAttribute('data-theme', 'light'|'dark')` + `localStorage('theme')`.  
Accent override: `document.documentElement.style.setProperty('--accent', hex)` + also set `--up` and `--up-soft`.

### Typography

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

body { font-family: 'Inter', sans-serif; }
.mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
```

### Global utility classes

| Class | Purpose |
|---|---|
| `.card` | `bg: --panel; border: 1px solid --border; border-radius: 10px` |
| `.card-head` | `flex between; padding 14px 16px; border-bottom: 1px solid --border` |
| `.card-title` | `caps 13px 600; color: --text-dim; letter-spacing: 0.02em` |
| `.card-body` | `padding: 16px` |
| `.btn` | `height 34px; padding 0 14px; radius 8px; border 1px --border; bg --panel; color --text` |
| `.btn-primary` | `bg: --accent; color: #051a10; font-weight 600` |
| `.btn-ghost` | `transparent bg; hover gains border` |
| `.btn-danger` | `color: --down` |
| `.chip` | `inline-flex; mono 11.5px 600; padding 2px 7px; radius 4px` |
| `.chip.up` | `bg: --up-soft; color: --up` |
| `.chip.down` | `bg: --down-soft; color: --down` |
| `.tag` | `mono 10.5px uppercase; padding 3px 7px; radius 4px; bg --panel-2; border 1px --border` |
| `.tag.buy` | `color: --up` |
| `.tag.sell` | `color: --down` |
| `.tag.div` | `color: --info` |
| `.tag.fee` | `color: --warn` |
| `.seg` | `inline-flex; bg --panel-2; border 1px --border; padding 2px; gap 2px` |
| `.seg button` | `mono 11.5px 600 uppercase; padding 4px 10px; radius 6px` |
| `.seg button.active` | `bg: --panel; color: --text; box-shadow: inset 0 0 0 1px --border` |
| `.table` | standard table styles |
| `.table th` | `caps 10.5px 600; padding 12px 14px; border-bottom; sticky; bg --panel; color --text-dim` |
| `.table td` | `padding 14px; border-bottom 1px --border; color --text` |
| `.table td.right` | `text-align: right` |
| `.table tr:hover` | `bg: --panel-hover` |
| `.ticker-logo` | `32×32; radius 8; mono 11px 700; bg --panel-2; border 1px --border` |

---

## 3. App Shell

### Layout (`src/components/layout/Layout.jsx`)

```
<html data-theme="dark">
  <div style="display:grid; grid-template-columns:232px 1fr; height:100vh; bg:--bg">
    <Sidebar />                          /* bg: --bg-2, border-right: 1px --border */
    <div style="display:flex; flex-col; overflow:hidden">
      <Topbar />                         /* h:56px; sticky; border-bottom: 1px --border */
      <main style="flex:1; overflow-y:auto; padding:24px 28px 60px; max-width:1640px">
        <Outlet />
      </main>
    </div>
  </div>
```

MobileDrawer stays but is lower priority (desktop-first scope).

### Sidebar (`src/components/layout/Sidebar.jsx`)

- Brand: 30×30 square with `linear-gradient(135deg, --accent, color-mix(in oklab, --accent, #000 25%))`, inline SVG trending-up icon, "stockstracker." text (dot in `--accent`)
- Section labels: "GŁÓWNE" / "KONTO" — 10px caps, `--text-faint`, `letter-spacing: 0.12em`
- Nav item: `padding: 9px 10px; border-radius: 8px`
  - Active: `background: --panel; box-shadow: inset 3px 0 0 --accent`
  - Hover: `background: --panel-hover`
- Footer: avatar circle + "Adam · GPW" text
- Nav items (icons inline SVG 20×20, stroke 2, currentColor):
  - GŁÓWNE: Dashboard, Portfel, Historia, Transakcje, Dywidendy, Kalendarz, Watchlist, Scenario Lab, Atrybucja
  - KONTO: Ustawienia

### Topbar (`src/components/layout/Header.jsx` → rename display to Topbar)

- `height: 56px; background: --bg-2; border-bottom: 1px --border; position: sticky; top:0; z-index:10`
- Search: `max-width: 420px; bg --panel; border 1px --border; radius 8px; padding 0 12px` with `⌘K` kbd badge
- Ticker strip: WIG20, WIG30, mWIG40, S&P500, DAX, EUR/PLN, USD/PLN — each: sym (caps 11px `--text-dim`) + value (mono 12px) + chip delta. Gap 18px. Sourced from existing `tickerStrip` data.
- Right actions: bell icon with red dot + `.btn-primary` "Dodaj transakcję" → opens existing `AddStockModal` (or `AddDividendModal` depending on context)

---

## 4. Shared Components

| File | Change |
|---|---|
| `src/components/shared/Card.jsx` | New — wrapper using `.card`, `.card-head`, `.card-title`, `.card-body` |
| `src/components/shared/Chip.jsx` | New — renders `▲/▼ X.XX%` with `.chip.up/.down` |
| `src/components/shared/SegmentedControl.jsx` | New — `.seg` with active state |
| `src/components/shared/TickerLogo.jsx` | New — 2-char mono avatar |
| `src/components/shared/Sparkline.jsx` | Update — use `--up`/`--down` tokens, stroke 1.6px, 80×28 |
| `src/components/shared/Badge.jsx` | Update — align with `.tag` styles |
| `src/components/shared/Spinner.jsx` | Update — use `--accent` color |

---

## 5. Screens (implementation order)

### Phase 1 — Simple (no charts)

**Settings (`/settings`)**
- Grid 2 columns
- Card "Połączone konta brokerskie": list rows — status dot (green pulse animation) + broker name + status text + `.btn-ghost` "Rozłącz"
- Card "Profil podatkowy": Rezydencja, Stawka (19% Belka), Strata przeniesiona, Należny podatek YTD
- Domain logic: uses existing `AppContext` broker/tax settings

**Watchlist (`/watchlist`)**
- Table: Aktywo (TickerLogo + sym + name) | Kurs (mono) | Dzień % (Chip) | Trend 30D (Sparkline 120×32) | Akcje (btn-ghost "Kup")
- Row click → `/stock/:symbol`

### Phase 2 — Tables with chips

**Transactions (`/transactions`)**
- KPI strip: Kupna 30d | Sprzedaże 30d | Dywidendy 30d | Prowizje 30d
- Table: Data | Typ (`.tag.buy/.sell/.div/.fee`) | Aktywo (TickerLogo + sym) | Ilość | Cena | Wartość | Waluta | `···`
- Filter segmented: Wszystkie / Kupno / Sprzedaż / Dywidendy / Prowizje
- Domain: existing `transactions` from AppContext

**Dividends (`/dividends`)**
- Toggle BRUTTO/NETTO
- KPI (3 cols): Dywidendy 12m | Yield proj. | Nadchodzące 30d
- Table: Spółka | Dzień wypłaty | Status (`.tag`) | Stawka/szt | Yield | Twoja wypłata
- Grid 2 cols: Yield on Cost per spółka | Historia wypłat

### Phase 3 — Charts

**Calendar (`/calendar`)**
- Card head: prev/next buttons + "Maj 2026" + legend + "Dziś" button
- 7-column grid (Pn–Nd), min-height 88px cells
- Event dots: 5px colored circle + short title, max 2 + "+N"
- Today: `--panel-2` bg + `--accent` border
- Previous/next month days: opacity 0.35
- Event list below with importance/type filters

**History (`/history`)**
- KPI (4 cols): Wartość | Zainwestowano | Zmiana od początku | ATH
- AreaChart: portfolio value (green line + gradient) + "zainwestowano" (dashed faint)
- Benchmark toggle: Brak / S&P500 / WIG20 / MSCI World
- Timeframe: 1M / 3M / 6M / 1R / MAX
- Snapshots table

**Scenario Lab (`/scenario`)**
- Grid 380px / 1fr
- Left: inputs cards (Konfiguracja + Parametry)
- Right: PayoffChart (SVG, accent line + info dashed line) + 8 KPI metrics

### Phase 4 — Complex

**Analysis (`/analysis`)**
- Risk KPI card (5 metrics: Zmienność, Max Drawdown, Sharpe, Sortino, Beta)
- Rebalancing card: progress bars with target marker
- KPI Tinted (4 cols): Pozycje | Zyskowne | Stratne | Śr. zwrot

**Portfolio (`/portfolio`)**
- Snapshot KPI row
- Portfolio chart with LINE/CANDLES/HEATMAP toggle
- Holdings table: all columns from design (sortable, row click → stock detail)
- Segment filter: Wszystkie / PL / US
- Heatmap view: auto-fill grid, oklch-based color scaling by d1%

**Stock Detail (`/stock/:symbol`)**
- Breadcrumb
- Header: TickerLogo 56×56 + name + tags + price (mono 28px) + Chip + actions
- Grid 1fr / 360px: chart left, position/stats/transactions right

**Dashboard (`/dashboard`)**
- Page head: greeting + session status + ghost action buttons
- KPI grid 4 cols: Wartość portfela | Zysk/strata | Dywidendy YTD | Wolne środki
- Chart + Top movers (1fr / 380px): AreaChart + top 5 list
- Allocation + Best/Worst (3 cols): Donut + top 4 + bottom 3

---

## 6. Chart Styling (existing chart components)

All chart components (`AdvancedPriceChart`, `HistoryChart`, `CandlestickChart`) receive visual updates only:
- Grid lines: dashed `2 4`, opacity 0.6, color `--border`
- Axis labels: mono 10px, `--text-faint`, right-aligned Y axis
- Line: `--up` color, 2px stroke
- Area fill: gradient 32% → 0% opacity under line
- Tooltip: `--panel-2` bg, mono 11px, `1px solid --border`
- Candles: `--up` / `--down` colors

---

## 7. Theme & Accent State

`src/context/AppContext.jsx` (or new `ThemeContext`):
- `theme: 'dark' | 'light'` — persisted in `localStorage('theme')`, applied as `data-theme` on `<html>`
- `accent: string` — persisted in `localStorage('accent')`, applied via `setProperty('--accent', ...)` + `--up` + `--up-soft`
- Settings page exposes theme toggle + accent swatches (5 presets: green, blue, purple, amber, red)

---

## 8. Out of Scope

- Mobile responsive layout
- Real company logo API integration
- Tweaks floating panel
- News section in Stock Detail (placeholder only)
- Broker API integration (status dots are static for now)
