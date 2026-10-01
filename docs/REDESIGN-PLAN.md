# Redesign plan — myfund

Approved 26.09.2026.

**Visual direction (decided 26.09.2026 after rendering three variants on the
same screens — pure black terminal, soft dark, soft light):**
- **Dark (default): soft graphite-navy** (`#0f1420` background) instead of
  pure black. Pure black with green everywhere read as dated and harsh.
- **Light: soft white** with shadows doing the work of borders.
- **Numbers in Inter with tabular digits**, not JetBrains Mono. The mono font
  spread amounts out and rendered "zł" awkwardly; tabular Inter still lines
  up columns.
- **Indigo accent for interaction** (buttons, active nav, focus). Green and
  red are reserved for gain and loss, so a button never looks like a profit.
  The code already assumed an indigo accent in several places (white text on
  accent buttons, `#818cf8` gradients).
- **Rounder shapes:** cards 16 px, small elements 10 px.

## Principle: rebuild in place, not rewrite

~21k lines of JSX, a 6.4k-line backend, 161 passing tests and many working
features (OKI, DRIP, Belka optimizer, alerts, imports). A rewrite would spend
months regaining parity. Instead the **visual layer** is rebuilt step by step:
every step is one small PR that ships on its own, and old and new styles
coexist until a page is migrated.

## Diagnosis (measured 26.09.2026)

| Problem | Evidence | Effect |
|---|---|---|
| Inline styles | **1712** `style={{…}}` (Portfolio 230, Analysis 116, Settings 106) | No consistent hover, mobile or theming; every screen slightly different |
| No shared components | **11 modals**, each hand-built; no shared Button/Input/Table/EmptyState | Inconsistent spacing, buttons, Esc/focus/mobile behaviour |
| Three chart approaches | chart.js, recharts, custom SVG | Charts look different per page; ~200 KB extra |
| Mixed icons | **183 emoji** as icons + hand-drawn SVGs; `lucide-react` installed but unused | Reads as a casual app |
| Tailwind config out of sync | Defines indigo colours the app doesn't use | Two styling systems |
| Oversized files | Portfolio 2051 lines, Analysis 1415 | Risky to change |
| Mobile as an afterthought | Hamburger only, tables overflow | The main "not polished" feeling |

## Phases

### Phase 0 — Foundations
- [x] Design tokens: spacing (4/8), type scale, radii, elevation, semantic
      colours (up/down/warn/info + soft variants) in dark and light.
- [x] Tailwind wired to the tokens (`bg-panel`, `text-dim`, `rounded-card`…)
      so there is one styling system.
- [x] `lucide-react` as the icon set (app shell first; page emoji move in Phase 3).

### Phase 1 — Component kit (`components/ui/`)
- [x] Button, IconButton
- [x] Card (existing `shared/Card`, re-exported), PageHeader (used by Layout)
- [x] **Modal** — one implementation: Esc, focus trap, focus restore,
      bottom sheet on mobile, nested-safe. `ConfirmModal` migrated as proof.
- [x] Field / Input / Select
- [x] Tabs (+ TabPanel, arrow-key navigation)
- [x] **Table** — sortable (empty values always last), sticky header, rows
      become cards on mobile
- [x] Stat (KPI), Badge
- [x] EmptyState, Skeleton, Spinner, Tooltip; the existing toast system
      upgraded (icons, success/warn types, action button for "Undo", dismiss)
- [x] `/dev/ui` page showing every component (dev server only, not in the
      production bundle)

Import from the barrel: `import { Button, Modal, Table } from '../components/ui'`.
Logic is unit-tested (`focus.test.js`, `tabsNav.test.js`, `tableSort.test.js`).

### Phase 2 — App shell
- [x] Sidebar rebuilt on the kit; on desktop it collapses to a 68 px icon
      rail (remembered per browser), names stay in tooltips and for screen
      readers
- [x] Mobile **bottom tab bar** (Dashboard, Portfolio, Transactions,
      Dividends, More); "More" opens the full menu and lights up on pages
      outside the four tabs. The header hamburger is gone.
- [x] Mobile drawer: Esc closes it, and when closed it is `inert` (Tab no
      longer walked through hidden links)
- [x] `--tabbar-h` lifts toasts, the update prompt and page padding above
      the tab bar; Portfolio's private toast moved to the shared one
- [x] Skeleton instead of "…" while a page's code loads (after 180 ms);
      each route gets its own Suspense boundary so a tap gives instant
      feedback instead of freezing on the old page
- [x] `alert()` — none left in the code (checked)
- [x] Deleted unused `MobileDrawer.jsx`

### Phase 3 — Pages (one PR each, by usage)
Each page PR: move to the kit, remove inline styles, mobile layout,
empty/loading/error states, translate remaining hardcoded strings (P3-5),
before/after screenshots.

- [x] Dashboard — kit + Tailwind (86 inline styles → 1), skeleton / error / empty
      states, cash window on Modal, dead code removed (`KpiPro`, unused
      helpers, orphaned CSS). Kit gained `Callout`; `Stat` gained `spark`,
      `hero`, `blur`.
- [x] Portfolio — split from one 2051-line file into `pages/portfolio/`
      (overview grid, positions table, other assets, bonds, crypto modal,
      exporters); 230 inline styles → 2; positions as cards on mobile with a
      sort selector; all 4 dropdowns on the new kit `Menu`; 3 entry forms on
      Modal (Esc works now); ~45 hardcoded strings translated.
- [x] Transactions — kit Stat/Tabs/Table (sort, mobile cards, 50 per page),
      add + CSV import windows on Modal (drag & drop). Fixed: 30-day tiles
      mixed currencies; `DIVIDEND` missing from the dividends filter; PL
      export → import lost notes and cash rows; trailing quote cut from notes.
      Export/import round trip covered by a test.
- [x] Dividends — restructured from 9 stacked sections: gross/net switch and
      "Add" on top, one row of 4 tiles (the duplicate bottom row merged in),
      goal card, DRIP, upcoming, and one "Payments" card with tabs (timeline /
      by company / all). Fixed: `DIVIDEND` transactions ignored, goal card
      titled "Next dividend", duplicated goal sentence, "≈ PLN" header on
      display-currency amounts.
- [x] History — period and benchmark moved to one page toolbar (benchmark was
      duplicated in two cards and a 8-button strip overflowed on phones),
      5 kit Stat tiles, snapshot table on kit Table (sortable, 50 per page —
      it rendered all ~300 rows at once). Calculations checked row-by-row
      against `main`.
- [x] History net of deposits — each daily snapshot now stores paid-in
      capital (`utils/capital.js`, DB column `capital`); profit = value −
      capital, return is time-weighted, CAGR and drawdown on that index.
      Days saved before this are estimated and marked. The "all portfolios"
      view no longer writes per-portfolio snapshots it could not attribute.
- [x] Calculation check — old vs new side by side on identical data and
      prices, every number on Dashboard/Portfolio/Transactions/Dividends/
      History compared; fixed the daily result formula, dividend yield on
      cost instead of market value, duplicate in "Winners and losers".
- [x] Analysis — 11 accordions → 5 tabs (Overview / Allocation / Risk / Tax /
      FIRE), split into `pages/analysis/*`, last tab remembered. Fixed: return %
      divided by the display-currency rate; rebalancing share counts and prices
      for foreign stocks; risk metrics on raw value (deposits as returns) and
      beta pairs shifted after a filtered day; FIRE mixing currencies;
      tax-loss insight promising 19% of all losses and contradicting the Tax
      tab on wash-sale; Health Score only in Polish.
- [x] Settings — 13 stacked cards → 4 groups (Account / Notifications / Data
      & import / Tax & rates) with side navigation (a scrollable bar on phones),
      split into `pages/settings/*`. Fixed: snapshot edits overwrote the day's
      exchange rates with today's; snapshot edits and imports in the
      all-portfolios view looked saved but were rejected by the server; alert
      card had no inner padding; ~10 hard-coded Polish strings. Menu item
      "Atrybucja" renamed to "Analiza".
- [x] Remaining pages — Closed positions, Watchlist, Alerts, News, Calendar,
      OKI, Scenario Lab, AI Insights, public shared portfolio. Each compared
      old vs new with the same data; calculations checked independently.
      Fixed: closed-position averages and cost-weighted %; option prices
      (normal CDF missing √2 — every price, delta, theta and PoP was off);
      cash-secured put and iron condor ignoring the contract count; covered
      call max loss ignoring the premium; hidden quantity field still
      multiplying spreads; runway ignoring a negative real return; AI review
      and public-portfolio IRR skipping "DIVIDEND" rows; currency exposure
      not summing to 100%; OKI/Scenario charts unreadable in the light theme.
- [x] All 11 modals on the shared Modal — edit position, dividend, alert,
      new portfolio, buy, sell, three imports (positions, broker, statement),
      stock detail; import parsers moved to `utils/*Import.js` with tests.
      Fixed: dividends and "buy more" defaulting to PLN for foreign stocks;
      sale currency different from the position's (mixed P&L); price alert
      without a known price saved as already triggered; broker import crash
      on an unknown file, deposits always in USD, dotted dates not ISO,
      "Symbol" column ignored; "1 050,00" read as 1 in two importers;
      benchmark joined by index instead of date; thesis note lost on close.
      Setup wizard moved too (its currency choice now actually applies).
      Advanced price chart (candles + MA/EMA/Bollinger/RSI/MACD) — was never
      reachable; now opened from the stock window, on the shared Modal,
      indicators computed on a longer history (warm-up) and tested against an
      independent implementation.

### Phase 4 — Charts
- [x] One chart library with one theme (colours, tooltip, axes); keep the
      hand-made sparklines. Recharts everywhere; shared props in
      `components/charts/theme.js` (theme CSS variables, so charts follow the
      theme without redrawing). OKI and Scenario Lab moved off chart.js;
      chart.js, its annotation plugin and the unused react-chartjs-2 removed.
      Hand-drawn SVG charts (History, rate of return, rolling returns,
      financials, stock detail) now use theme tokens instead of fixed hex.

### Phase 5 — Pro-feel features
- [ ] Undo toasts after deletes
- [ ] Optimistic updates
- [ ] ⌘K command palette + keyboard shortcuts
- [ ] First-run onboarding: empty screens lead to the next step

### Phase 6 — Quality gates in CI
- [ ] Playwright screenshots per page (desktop + mobile, both themes)
- [ ] Automated accessibility checks (axe)
- [ ] Bundle budget (main chunk is 508 KB today)
- [ ] Lint warnings down gradually

### Feature backlog (agreed 28.09.2026)

Done on branch `claude/features-heatmap-palette`:
- [x] Portfolio heatmap on the Dashboard (tile size = value, colour = today's move)
- [x] ⌘K command palette (pages, actions, stocks)
- [x] Weekly summary push (week's result net of deposits, best/worst position) — opt-in, Saturday morning
- [x] Phone polish: PWA shortcuts, last-known data offline, offline banner

Next, in order of priority:
1. [ ] **PIT-38 done right** — NBP rate from the working day before each trade,
       FIFO cost matching (Polish tax law); today realised P&L uses the current
       rate and average cost. `fx_rates_history` already stores NBP rates.
2. [ ] **Stock splits / corporate actions** — adjust quantity, average price
       and history; ideally detect from price data.
3. [ ] **Return split: stock vs currency** for foreign holdings.
4. [ ] **"Where should my next 1,000 zł go?"** — split new money towards target
       allocation without selling (no tax).
5. [ ] **You vs benchmark** — clear line and yearly difference vs WIG20 /
       S&P 500 / MSCI World on TWR.
6. [ ] **Dividend income forecast** — expected payouts per month, net of the
       right tax (19% PL, 15% US with W-8BEN), alert the day before ex-date.
7. [ ] **ETF look-through** — real country/sector exposure inside ETFs
       (needs a holdings data source).

**Size:** ~20–25 PRs. The biggest visible change lands after Phase 2 +
Dashboard + Portfolio (~8 PRs).

**Outside the design work:** the Render free tier running out and its cold
starts make the app *feel* broken regardless of looks — worth fixing
separately.

## How to use the tokens (Phase 0 result)

New code uses Tailwind classes backed by CSS variables from `src/index.css`.
The variables switch automatically with `data-theme`, so no `dark:` variants
are needed.

| Need | Class | Variable |
|---|---|---|
| Page / panel backgrounds | `bg-bg`, `bg-bg-2`, `bg-panel`, `bg-panel-2`, `bg-panel-hover` | `--bg`, `--panel`… |
| Text | `text-fg`, `text-dim`, `text-faint` | `--text`, `--text-dim`, `--text-faint` |
| Borders | `border-line`, `border-line-strong` | `--border`, `--border-strong` |
| Meaning | `text-up`, `bg-up-soft`, `text-down`, `bg-down-soft`, `text-warn`, `bg-warn-soft`, `text-info`, `bg-info-soft` | `--up`, `--up-soft`… |
| Accent | `bg-accent`, `text-accent-fg` (text on accent), `text-accent-text` (accent-coloured text/links) | `--accent`, `--accent-fg`, `--accent-text` |
| Corners | `rounded-card-sm`, `rounded-card`, `rounded-card-lg` | `--radius-sm`, `--radius`, `--radius-lg` |
| Elevation | `shadow-card`, `shadow-pop` | `--shadow-card`, `--shadow-pop` |
| Type | `text-label` (uppercase labels), `text-small`, `text-body`, `text-card-title`, `text-h1`, `text-kpi` | `--fs-*` |
| Numbers | `font-mono tabular-nums` | `--font-mono` |
| Spacing | Tailwind's default 4 px scale (`p-4` = 16 px) | — |

Colours are CSS variables, so opacity modifiers (`bg-panel/50`) do not work —
use the `*-soft` variants. Default Tailwind names (`rounded-lg`, `text-sm`…)
keep their stock values; the design names are separate on purpose.

Icons: `import { Wallet } from 'lucide-react'` — 18 px in navigation, 16 px in
buttons, `strokeWidth={2}`.
