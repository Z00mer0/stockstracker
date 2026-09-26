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
- [ ] Button, IconButton
- [ ] Card, PageHeader
- [ ] **Modal** — one implementation: Esc, focus trap, bottom sheet on mobile
- [ ] Field / Input / Select
- [ ] Tabs
- [ ] **Table** — sortable, sticky header, rows become cards on mobile
- [ ] Stat (KPI), Badge
- [ ] EmptyState (with action), Skeleton, Toast, Tooltip
- [ ] Hidden `/dev/ui` page showing every component

### Phase 2 — App shell
- [ ] Desktop sidebar collapsible to an icon rail
- [ ] Mobile **bottom tab bar** (Dashboard, Portfolio, Transactions, Dividends, More)
- [ ] Skeletons instead of spinners; toasts instead of `alert()`
- [ ] Delete unused `MobileDrawer.jsx`

### Phase 3 — Pages (one PR each, by usage)
Each page PR: move to the kit, remove inline styles, mobile layout,
empty/loading/error states, translate remaining hardcoded strings (P3-5),
before/after screenshots.

- [ ] Dashboard
- [ ] Portfolio (also split the file — P3-8)
- [ ] Transactions
- [ ] Dividends
- [ ] History
- [ ] Analysis — 11 accordions → tabs (Risk / Allocation / Tax / FIRE)
- [ ] Settings — sections with side navigation
- [ ] Remaining pages
- [ ] All 11 modals on the shared Modal

### Phase 4 — Charts
- [ ] One chart library with one theme (colours, tooltip, axes); keep the
      hand-made sparklines.

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
| Accent | `bg-accent`, `text-accent-fg` (text on accent) | `--accent`, `--accent-fg` |
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
