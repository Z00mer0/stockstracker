# Tabs Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Odtworzyć wizualny redesign Dashboard (Wariant A · Refined) i Portfel (Wariant B · Bold) z `tabs_handoff/prototype/` 1:1 w aplikacji myfund.

**Architecture:** Nowy plik `src/tabs.css` (CSS z prototypu), 4 nowe komponenty shared (KpiPro, InsightStrip, StackedAllocation, WinnersLosers), pełne przepisanie JSX return w Dashboard.jsx, chirurgiczne rozszerzenie Portfolio.jsx (chart+rail, filter chips, sector grouping, tfoot). Wyłącznie warstwa wizualna — cała logika danych bez zmian.

**Tech Stack:** React, Vite (`npm start`), CSS (design tokens z `index.css`), `HistoryChart` (własny SVG chart), `SegmentedControl` (istniejący), AppContext data hooks.

**Spec:** `docs/superpowers/specs/2026-06-06-tabs-redesign-design.md`
**Prototyp:** `tabs_handoff/prototype/` — CSS: `tabs.css`, komponenty: `tabs-dashboard.jsx`, `tabs-portfolio.jsx`

---

## Mapowanie plików

| Akcja | Plik | Odpowiedzialność |
|---|---|---|
| Utwórz | `src/tabs.css` | Style z prototypu: kpi-pro, insight-strip, stack-alloc, wl-*, chip-filter, rail-stats, tfoot, sector-group |
| Modyfikuj | `src/main.jsx` | Dodaj `import './tabs.css'` po `import './index.css'` |
| Modyfikuj | `src/components/layout/Layout.jsx` | Dodaj `containerType: 'inline-size'` na `<main>` |
| Utwórz | `src/components/shared/KpiPro.jsx` | KPI kafel z sparkline, chip, ikoną, wariant hero |
| Utwórz | `src/components/shared/InsightStrip.jsx` | 4-kafelkowy pasek auto-wniosków |
| Utwórz | `src/components/shared/StackedAllocation.jsx` | Poziomy stacked bar + legenda sektorów |
| Utwórz | `src/components/shared/WinnersLosers.jsx` | Rozbieżne słupki top/bottom pozycji |
| Przepisz | `src/pages/Dashboard.jsx` | Pełny nowy JSX return (dane bez zmian) |
| Modyfikuj | `src/pages/Portfolio.jsx` | Nowa sekcja chart+rail nad tabelą, filter chips, tfoot, sector grouping |

---

## Task 1: CSS Foundation

**Files:**
- Create: `src/tabs.css`
- Modify: `src/main.jsx` (line 4, after index.css import)
- Modify: `src/components/layout/Layout.jsx` (line 64, `<main>` element)

- [ ] **Step 1: Create `src/tabs.css`**

```css
/* ============================================================
   tabs.css — Dashboard + Portfolio redesign
   Extends index.css (same tokens: --bg, --panel, --accent, etc.)
   ============================================================ */

.btn { white-space: nowrap; }

/* ---- KPI PRO ---- */
.kpi-pro {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 15px 16px 13px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  position: relative;
  overflow: hidden;
}
.kpi-pro .kp-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.kpi-pro .kp-label {
  font-size: 10.5px;
  color: var(--text-faint);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
}
.kpi-pro .kp-ico {
  width: 26px; height: 26px;
  border-radius: 7px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  display: grid; place-items: center;
  color: var(--text-dim);
  flex-shrink: 0;
}
.kpi-pro .kp-value {
  font-family: var(--font-mono);
  font-size: 25px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.05;
  white-space: nowrap;
}
.kpi-pro .kp-value.up   { color: var(--up); }
.kpi-pro .kp-value.down { color: var(--down); }
.kpi-pro .kp-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.kpi-pro .kp-sub {
  font-size: 11.5px;
  color: var(--text-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi-pro.hero {
  background: linear-gradient(160deg,
    color-mix(in oklab, var(--accent), transparent 92%),
    var(--panel) 55%);
  border-color: color-mix(in oklab, var(--accent), transparent 70%);
}

/* chip-sm */
.chip-sm {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.chip-sm.up      { background: var(--up-soft);   color: var(--up); }
.chip-sm.down    { background: var(--down-soft);  color: var(--down); }
.chip-sm.neutral { background: var(--panel-2);    color: var(--text-dim); border: 1px solid var(--border); }

/* ---- INSIGHT STRIP ---- */
.insight-strip {
  display: flex;
  align-items: stretch;
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 18px;
}
.insight {
  flex: 1;
  background: var(--panel);
  padding: 11px 15px;
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}
.insight .ins-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.insight .ins-body  { min-width: 0; }
.insight .ins-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-faint);
  font-weight: 600;
}
.insight .ins-text {
  font-size: 12.5px;
  color: var(--text);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.insight .ins-text .num { font-weight: 600; font-family: var(--font-mono); }
.num.up   { color: var(--up); }
.num.down { color: var(--down); }

/* ---- STACKED ALLOCATION ---- */
.stack-alloc  { display: flex; flex-direction: column; gap: 14px; }
.stack-bar {
  display: flex;
  height: 34px;
  border-radius: 8px;
  overflow: hidden;
  gap: 2px;
  background: var(--bg);
}
.stack-seg {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: rgba(0,0,0,0.78);
  min-width: 0;
  cursor: default;
  transition: filter 0.12s;
}
.stack-seg:hover { filter: brightness(1.12); }
.stack-legend {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 22px;
}
.stack-legend .lg {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 12.5px;
}
.stack-legend .lg .sw  { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }
.stack-legend .lg .lg-name { color: var(--text-dim); flex: 1; }
.stack-legend .lg .lg-val  { font-family: var(--font-mono); font-weight: 600; }
.stack-legend .lg .lg-pct  { font-family: var(--font-mono); color: var(--text-faint); font-size: 11.5px; min-width: 42px; text-align: right; }

/* ---- WINNERS / LOSERS ---- */
.wl-list { display: flex; flex-direction: column; gap: 9px; }
.wl-row {
  display: grid;
  grid-template-columns: 92px 1fr 64px;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}
.wl-sym {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 12.5px;
}
.wl-track {
  position: relative;
  height: 22px;
  background: var(--panel-2);
  border-radius: 5px;
  overflow: hidden;
}
.wl-track .mid {
  position: absolute;
  left: 50%; top: 0; bottom: 0;
  width: 1px;
  background: var(--border-strong);
}
.wl-fill {
  position: absolute;
  top: 3px; bottom: 3px;
  border-radius: 4px;
}
.wl-fill.up   { left: 50%;  background: var(--up); }
.wl-fill.down { right: 50%; background: var(--down); }
.wl-pct {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 600;
  text-align: right;
}

/* ---- CHIP FILTER (Portfel tabela) ---- */
.chip-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px;
  border-radius: 7px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.chip-filter:hover { border-color: var(--border-strong); color: var(--text); }
.chip-filter.active {
  background: var(--up-soft);
  border-color: color-mix(in oklab, var(--accent), transparent 55%);
  color: var(--accent);
}

/* ---- SECTION LABEL ---- */
.sec-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-faint);
  font-weight: 600;
  margin: 4px 2px 12px;
}

/* ---- RAIL STATS (Portfel side) ---- */
.rail-stats { display: flex; flex-direction: column; }
.rail-stat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.rail-stat:last-child { border-bottom: none; }
.rail-stat .rs-lbl { color: var(--text-dim); }
.rail-stat .rs-val { font-family: var(--font-mono); font-weight: 600; white-space: nowrap; }

/* ---- TABLE TOTALS + SECTOR GROUP ---- */
.table-pro tfoot td {
  padding: 13px 14px;
  border-top: 1px solid var(--border-strong);
  font-family: var(--font-mono);
  font-weight: 700;
  background: var(--panel-2);
}
.table-pro tfoot td.lbl {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 600;
  font-family: var(--font-sans);
}
.sector-group td {
  background: var(--bg-2);
  padding: 8px 14px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-faint);
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}
.sector-group .sg-inner { display: flex; align-items: center; gap: 10px; }
.sector-group .sg-count { color: var(--text-dim); }
.sector-group .sg-val   { margin-left: auto; font-family: var(--font-mono); color: var(--text-dim); }

/* ---- HERO SIDE (Portfel right rail) ---- */
.hero-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---- DETAIL GRID helper ---- */
.detail-grid {
  display: grid;
  gap: 16px;
}
```

- [ ] **Step 2: Import tabs.css in `src/main.jsx`**

In `src/main.jsx`, add `import './tabs.css';` after `import './index.css';`:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './tabs.css';
import { PrivacyProvider } from './context/PrivacyContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivacyProvider>
      <App />
    </PrivacyProvider>
  </React.StrictMode>
);
```

- [ ] **Step 3: Add container-type to `<main>` in Layout.jsx (line 64)**

Change the `<main>` style to include `containerType: 'inline-size'` and `containerName: 'app'`:

```jsx
<main style={{
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: isMobile ? '16px 16px 60px' : '24px 28px 60px',
  maxWidth: '1640px',
  width: '100%',
  margin: '0 auto',
  containerType: 'inline-size',
  containerName: 'app',
}}>
  <Outlet />
</main>
```

- [ ] **Step 4: Verify — start dev server**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm start
```

Open http://localhost:5173 — app should load without errors. No visual change expected yet.

- [ ] **Step 5: Commit**

```bash
git add src/tabs.css src/main.jsx src/components/layout/Layout.jsx
git commit -m "feat: add tabs.css + container-type on main"
```

---

## Task 2: KpiPro Component

**Files:**
- Create: `src/components/shared/KpiPro.jsx`

Accepts: `{ label, value, chip, chipUp, sub, icon, spark, sparkUp, hero, tone }`
- `chip`: string z procentem lub tekstem, np. "+1.47%" 
- `chipUp`: boolean (true=green, false=red, undefined=neutral)
- `tone`: `'up' | 'down' | null` — koloruje `.kp-value`
- `hero`: boolean — dodaje gradient tła
- `spark`: `number[]` — dane do mini sparkline (rysowane inline SVG)
- `sparkUp`: boolean — kolor sparkline (up/down)
- `icon`: JSX element wyświetlany w `.kp-ico`

- [ ] **Step 1: Create `src/components/shared/KpiPro.jsx`**

```jsx
import React from 'react';

function MiniSparkline({ data, width = 62, height = 24, up = true }) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const range = mx - mn || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - mn) / range) * height;
    return `${x},${y}`;
  });
  const color = up ? 'var(--up)' : 'var(--down)';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ flexShrink: 0 }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

export default function KpiPro({ label, value, chip, chipUp, sub, icon, spark, sparkUp, hero, tone }) {
  const chipClass = chipUp === true ? 'up' : chipUp === false ? 'down' : 'neutral';
  const valueClass = tone === 'up' ? ' up' : tone === 'down' ? ' down' : '';
  return (
    <div className={'kpi-pro' + (hero ? ' hero' : '')}>
      <div className="kp-top">
        <span className="kp-label">{label}</span>
        {icon && <span className="kp-ico">{icon}</span>}
      </div>
      <div className={'kp-value' + valueClass}>{value}</div>
      <div className="kp-foot">
        <div className="kp-sub" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {chip != null && (
            <span className={'chip-sm ' + chipClass}>{chip}</span>
          )}
          {sub && <span>{sub}</span>}
        </div>
        {spark && spark.length >= 2 && (
          <MiniSparkline data={spark} up={sparkUp !== false} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify — import KpiPro in Dashboard.jsx temporarily**

At the top of `src/pages/Dashboard.jsx`, add a temporary import and render one KpiPro anywhere visible:

```jsx
import KpiPro from '../components/shared/KpiPro';
// ... inside JSX return, before the closing </div>:
<KpiPro hero label="Test KPI" value="123 456 zł" chip="+2.34%" chipUp sub="dziś" spark={[100,105,98,112,108,115]} sparkUp />
```

Start dev server (`npm start`), verify KpiPro renders with correct styling (hero gradient, chip green, mini sparkline visible).

- [ ] **Step 3: Remove the temporary import/render from Dashboard.jsx**

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/KpiPro.jsx
git commit -m "feat: add KpiPro shared component"
```

---

## Task 3: InsightStrip Component

**Files:**
- Create: `src/components/shared/InsightStrip.jsx`

Przyjmuje `positions` (enriched — każda pozycja ma `symbol`, `plPLN`, `costPLN`, `dailyChg`) i `dailyChangePLN` (number).

- [ ] **Step 1: Create `src/components/shared/InsightStrip.jsx`**

```jsx
import React from 'react';

function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}
function fmtPLN(n) {
  if (n == null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('pl-PL') + ' zł';
}

export default function InsightStrip({ positions = [], dailyChangePLN = 0 }) {
  const withPl = positions.filter(p => p.plPLN != null && p.costPLN > 0);
  const withDay = positions.filter(p => p.dailyChg != null);

  const best  = [...withPl].sort((a, b) => (b.plPLN / b.costPLN) - (a.plPLN / a.costPLN))[0];
  const worst = [...withPl].sort((a, b) => (a.plPLN / a.costPLN) - (b.plPLN / b.costPLN))[0];
  const mover = [...withDay].sort((a, b) => Math.abs(b.dailyChg) - Math.abs(a.dailyChg))[0];

  if (!best && !worst && !mover) return null;

  const bestPct   = best  ? (best.plPLN  / best.costPLN)  * 100 : null;
  const worstPct  = worst ? (worst.plPLN / worst.costPLN) * 100 : null;
  const dayUp     = dailyChangePLN >= 0;

  return (
    <div className="insight-strip">
      {best && (
        <div className="insight">
          <span className="ins-dot" style={{ background: 'var(--up)' }} />
          <div className="ins-body">
            <div className="ins-label">Najlepsza pozycja</div>
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
            <div className="ins-label">Pod presją</div>
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
            <div className="ins-label">Największy ruch dziś</div>
            <div className="ins-text">
              {mover.symbol.replace('.WA', '')}
              {' · '}
              <span className={'num ' + (mover.dailyChg >= 0 ? 'up' : 'down')}>{fmtPct(mover.dailyChg)}</span>
            </div>
          </div>
        </div>
      )}
      <div className="insight">
        <span className="ins-dot" style={{ background: dayUp ? 'var(--up)' : 'var(--down)' }} />
        <div className="ins-body">
          <div className="ins-label">Wynik dnia</div>
          <div className="ins-text">
            <span className={'num ' + (dayUp ? 'up' : 'down')}>{fmtPLN(dailyChangePLN)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/InsightStrip.jsx
git commit -m "feat: add InsightStrip shared component"
```

---

## Task 4: StackedAllocation Component

**Files:**
- Create: `src/components/shared/StackedAllocation.jsx`

Przyjmuje `positions` (enriched, każda ma `sector` i `valuePLN`) i `totalValue` (number).

- [ ] **Step 1: Create `src/components/shared/StackedAllocation.jsx`**

```jsx
import React from 'react';

const SECTOR_COLORS = {
  Technology: '#7c9eff', Tech: '#7c9eff',
  Gaming: '#a78bfa',
  Energy: '#ffb020',
  'Consumer Cyclical': '#34d399', Retail: '#34d399',
  'Consumer Defensive': '#34d399',
  Auto: '#ff4d6d', Automotive: '#ff4d6d',
  Finance: '#22d3ee', Financials: '#22d3ee', 'Financial Services': '#22d3ee',
  Healthcare: '#f472b6', Health: '#f472b6',
  'Basic Materials': '#fb923c', Construction: '#fb923c',
  Food: '#facc15', 'Consumer Staples': '#facc15',
  Communication: '#60a5fa', 'Communication Services': '#60a5fa',
  Utilities: '#a3e635',
  'Real Estate': '#f87171',
  Industrials: '#fbbf24',
  Inne: '#8a929d',
};

function getColor(sector) {
  return SECTOR_COLORS[sector] || '#8a929d';
}

function fmtK(n) {
  if (n == null) return '—';
  return (n / 1000).toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'k';
}

export default function StackedAllocation({ positions = [], totalValue }) {
  const bySector = {};
  positions.forEach(p => {
    const sec = p.sector || 'Inne';
    bySector[sec] = (bySector[sec] || 0) + (p.valuePLN ?? 0);
  });

  const total = totalValue || Object.values(bySector).reduce((a, b) => a + b, 0) || 1;
  const slices = Object.entries(bySector)
    .map(([label, value]) => ({ label, value, color: getColor(label) }))
    .sort((a, b) => b.value - a.value);

  if (!slices.length) return null;

  return (
    <div className="stack-alloc">
      <div className="stack-bar">
        {slices.map((s, i) => {
          const pct = (s.value / total) * 100;
          return (
            <div
              key={i}
              className="stack-seg"
              style={{ flex: s.value, background: s.color }}
              title={`${s.label}: ${pct.toFixed(1)}%`}
            >
              {pct > 8 ? Math.round(pct) + '%' : ''}
            </div>
          );
        })}
      </div>
      <div className="stack-legend">
        {slices.map((s, i) => (
          <div className="lg" key={i}>
            <span className="sw" style={{ background: s.color }} />
            <span className="lg-name">{s.label}</span>
            <span className="lg-val">{fmtK(s.value)}</span>
            <span className="lg-pct">{((s.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/StackedAllocation.jsx
git commit -m "feat: add StackedAllocation shared component"
```

---

## Task 5: WinnersLosers Component

**Files:**
- Create: `src/components/shared/WinnersLosers.jsx`

Przyjmuje `positions` (enriched, każda ma `symbol`, `plPLN`, `costPLN`).

- [ ] **Step 1: Create `src/components/shared/WinnersLosers.jsx`**

```jsx
import React from 'react';
import TickerLogo from './TickerLogo';

function getPlPct(p) {
  if (p.plPLN == null || !p.costPLN) return null;
  return (p.plPLN / p.costPLN) * 100;
}

export default function WinnersLosers({ positions = [] }) {
  const withPl = positions
    .map(p => ({ ...p, _plPct: getPlPct(p) }))
    .filter(p => p._plPct != null);

  if (withPl.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 0' }}>Brak danych P&L</p>;
  }

  const sorted = [...withPl].sort((a, b) => b._plPct - a._plPct);
  const top    = sorted.slice(0, 4);
  const bottom = sorted.slice(-3).filter(p => p._plPct < 0);
  const display = [...top, ...bottom];

  const max = Math.max(...display.map(p => Math.abs(p._plPct)));

  return (
    <div className="wl-list">
      {display.map(p => {
        const up = p._plPct >= 0;
        const w = max > 0 ? (Math.abs(p._plPct) / max) * 50 : 0;
        return (
          <div className="wl-row" key={p.symbol ?? p.id}>
            <div className="wl-sym">
              <TickerLogo symbol={p.symbol} size={24} />
              {p.symbol?.replace('.WA', '')}
            </div>
            <div className="wl-track">
              <div className="mid" />
              <div
                className={'wl-fill ' + (up ? 'up' : 'down')}
                style={{ width: w + '%' }}
              />
            </div>
            <div
              className="wl-pct"
              style={{ color: up ? 'var(--up)' : 'var(--down)' }}
            >
              {(p._plPct >= 0 ? '+' : '') + p._plPct.toFixed(1)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/shared/WinnersLosers.jsx
git commit -m "feat: add WinnersLosers shared component"
```

---

## Task 6: Dashboard Rewrite (Variant A · Refined)

**Files:**
- Modify: `src/pages/Dashboard.jsx`

Przepisz tylko JSX return (od `return (` do końca pliku). Cała logika danych (hooks, kpi, dailyChange, etc.) bez zmian.

**Dane dostępne po `useMemo`/`useEffect` w obecnym Dashboard:**
- `kpi.totalValue`, `kpi.unrealPLN`, `kpi.unrealPct`, `kpi.annualDivPLN`, `kpi.cashValue`, `kpi.sparkValues`
- `dailyChange.pln`, `dailyChange.pct`
- `allPositions[]` — enriched positions
- `topMovers.gainers[]`, `topMovers.losers[]`
- `portfolioIrr`, `snapshots[]`, `nextDividend`
- `displayName`, `currLabel`, `isPrivate`, `loading`

- [ ] **Step 1: Add imports at top of Dashboard.jsx**

Add after existing imports:

```jsx
import KpiPro from '../components/shared/KpiPro';
import InsightStrip from '../components/shared/InsightStrip';
import StackedAllocation from '../components/shared/StackedAllocation';
import WinnersLosers from '../components/shared/WinnersLosers';
import SegmentedControl from '../components/shared/SegmentedControl';
import HistoryChart from '../components/HistoryChart';
```

- [ ] **Step 2: Add timeframe state inside Dashboard function**

After the existing `const [cols] = useState(loadColumnConfig);` line, add:

```jsx
const [tf, setTf] = useState('MAX');
```

And add `snapshotsFiltered` computation after `dailyChange` useMemo:

```jsx
const snapshotsFiltered = useMemo(() => {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  if (tf === 'MAX') return sorted;
  const days = { '1T': 7, '1M': 30, '3M': 90, '6M': 180, '1R': 365 }[tf] || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return sorted.filter(s => s.date >= cutoff);
}, [snapshots, tf]);
```

- [ ] **Step 3: Replace the JSX return block**

Find `return (` (line ~478 in current file) and replace everything from there to end of file with:

```jsx
  if (loading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  const fmtVal = (n, d = 0) => n == null || isNaN(n)
    ? '—'
    : n.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });

  const dayChipVal = dailyChange.pct != null
    ? (dailyChange.pct >= 0 ? '+' : '') + fmtVal(dailyChange.pct, 2) + '%'
    : null;
  const unrealChipVal = kpi.unrealPct != null
    ? (kpi.unrealPct >= 0 ? '+' : '') + fmtVal(kpi.unrealPct, 2) + '%'
    : null;
  const irrChipVal = portfolioIrr != null
    ? (portfolioIrr * 100).toFixed(1) + '%/r'
    : null;

  const TF_OPTIONS = ['1T', '1M', '3M', '6M', '1R', 'MAX'];

  return (
    <div>
      {/* page-head */}
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Witaj, {displayName ?? 'Inwestorze'}</h1>
          <p className="page-sub">
            {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* InsightStrip */}
      {allPositions.length > 0 && (
        <InsightStrip positions={allPositions} dailyChangePLN={dailyChange.pln} />
      )}

      {/* KPI grid */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <KpiPro
          hero
          label="Wartość portfela"
          value={`${fmtVal(kpi.totalValue)} ${currLabel}`}
          chip={dayChipVal}
          chipUp={dailyChange.pln >= 0}
          sub="dziś"
          spark={kpi.sparkValues.slice(-24)}
          sparkUp={dailyChange.pln >= 0}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>}
        />
        <KpiPro
          label="Zysk / strata"
          tone={kpi.unrealPLN >= 0 ? 'up' : 'down'}
          value={`${kpi.unrealPLN >= 0 ? '+' : ''}${fmtVal(kpi.unrealPLN)} ${currLabel}`}
          chip={unrealChipVal}
          chipUp={kpi.unrealPLN >= 0}
          sub="niezrealizowany"
          spark={kpi.sparkValues.slice(-24)}
          sparkUp={kpi.unrealPLN >= 0}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
        />
        <KpiPro
          label="Dywidendy YTD"
          value={`${fmtVal(kpi.annualDivPLN)} ${currLabel}`}
          sub={nextDividend ? `następna: ${nextDividend.symbol}` : 'ostatnie 12 mies.'}
          spark={kpi.sparkValues.slice(-24)}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>}
        />
        <KpiPro
          label="Wolne środki"
          value={`${fmtVal(kpi.cashValue)} ${currLabel}`}
          chip={irrChipVal}
          chipUp={portfolioIrr != null && portfolioIrr >= 0}
          sub="konto · PLN"
          spark={kpi.sparkValues.slice(-24)}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>}
        />
      </div>

      {/* Chart + Top movers */}
      <div className="detail-grid" style={{ gridTemplateColumns: '1fr 380px', gap: 16, marginBottom: 18 }}>
        <div className="card chart-card">
          <div style={{ padding: '18px 20px 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', fontWeight: 600, marginBottom: 4 }}>
                Wartość portfela · {tf}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {fmtVal(kpi.totalValue)} {currLabel}
              </div>
            </div>
            <SegmentedControl
              options={TF_OPTIONS}
              value={tf}
              onChange={setTf}
            />
          </div>
          <div style={{ padding: '4px 12px 18px' }}>
            {snapshotsFiltered.length >= 2
              ? <HistoryChart data={snapshotsFiltered} />
              : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>Za mało danych historycznych</div>
            }
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Top ruchy dzisiaj</div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="dot-status" />
              live
            </span>
          </div>
          <div>
            {[...topMovers.gainers, ...topMovers.losers].length === 0
              ? <p style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-faint)' }}>Brak danych</p>
              : [...topMovers.gainers, ...topMovers.losers].map(pos => (
                <div key={pos.symbol} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
                  <TickerLogo symbol={pos.symbol} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>{pos.symbol.replace('.WA', '')}</div>
                    {pos.name && <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.name}</div>}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 58 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: pos.dailyChg >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      {pos.dailyChg >= 0 ? '+' : ''}{pos.dailyChg?.toFixed(2)}%
                    </div>
                    {pos.price != null && (
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{fmt(pos.price)}</div>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Allocation + Winners/Losers */}
      {allPositions.length > 0 && (
        <div className="detail-grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 18 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Alokacja sektorowa</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <StackedAllocation positions={allPositions} totalValue={kpi.positionsValue} />
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Wygrani i przegrani</div>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>zwrot %</span>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <WinnersLosers positions={allPositions} />
            </div>
          </div>
        </div>
      )}

      {!portfolio.length && !loading && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-faint)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <p style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Brak danych portfela</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>Dodaj pozycje w zakładce Portfel</p>
        </div>
      )}
    </div>
  );
}
```

> **Uwaga:** `fmt` jest już zdefiniowane w Dashboard.jsx (linia ~42). Nie dodawaj nowej definicji. `fmtVal` używamy lokalnie w return.

- [ ] **Step 4: Verify — open Dashboard**

```bash
npm start
```

Otwórz http://localhost:5173. Sprawdź:
- InsightStrip widoczny pod nagłówkiem (4 kolumny z kropkami)
- 4 kafle KpiPro (pierwsza z gradientem hero)
- Wykres historii + Top ruchy obok siebie
- Alokacja sektorowa + Wygrani i przegrani na dole
- Żadnych JS errors w konsoli

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.jsx
git commit -m "feat: rewrite Dashboard to Variant A Refined"
```

---

## Task 7: Portfolio — Chart + Rail Section

**Files:**
- Modify: `src/pages/Portfolio.jsx`

Dodaj nową sekcję nad istniejącą tabelą. Tabela zostaje bez zmian w tym kroku.

- [ ] **Step 1: Add imports at top of Portfolio.jsx**

Dodaj po istniejących importach:

```jsx
import HistoryChart from '../components/HistoryChart';
import StackedAllocation from '../components/shared/StackedAllocation';
import SegmentedControl from '../components/shared/SegmentedControl';
```

- [ ] **Step 2: Add state variables inside Portfolio function**

Po linii `const [sortBy, setSortBy] = useState('cost');` (ok. linia 357), dodaj:

```jsx
const [tfPortfolio, setTfPortfolio] = useState('MAX');
```

- [ ] **Step 3: Add computed values inside Portfolio function**

Po `const totalValuePLN = enriched.reduce(...)` (ok. linia 413), dodaj:

```jsx
const dailyChangePLN = enriched.reduce((sum, pos) => {
  if (pos.valuePLN != null && pos.dailyChg != null) {
    return sum + pos.valuePLN * pos.dailyChg / 100;
  }
  return sum;
}, 0);

const cashValuePLN = (() => {
  const { cash = {}, fxRates: fx = {} } = (typeof rawData === 'object' && rawData) ? {} : {};
  return 0;
})();

const snapshotsSorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
const snapshotsForPortfolio = (() => {
  if (tfPortfolio === 'MAX') return snapshotsSorted;
  const days = { '1T': 7, '1M': 30, '3M': 90, '6M': 180, '1R': 365 }[tfPortfolio] || 30;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return snapshotsSorted.filter(s => s.date >= cutoff);
})();
```

> Uwaga: `rawData` i `fxRates` są dostępne z `useApp()` na linii 302. `snapshots` też jest destructured.

- [ ] **Step 4: Insert chart+rail section in JSX return**

Znajdź `{/* Summary */}` (ok. linia 584) — to jest obecna karta z kosztem.  
Zastąp ją nową sekcją:

```jsx
      {/* Chart + rail */}
      <div className="detail-grid" style={{ gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ padding: '18px 20px 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', fontWeight: 600, marginBottom: 4 }}>
                Wartość portfela
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {fmt(totalValuePLN)} zł
              </div>
              {dailyChangePLN !== 0 && (
                <div style={{ fontSize: 12, marginTop: 4, color: dailyChangePLN >= 0 ? 'var(--up)' : 'var(--down)', fontFamily: 'var(--font-mono)' }}>
                  {dailyChangePLN >= 0 ? '+' : ''}{fmt(dailyChangePLN)} zł dziś
                </div>
              )}
            </div>
            <SegmentedControl
              options={['1T', '1M', '3M', '6M', '1R', 'MAX']}
              value={tfPortfolio}
              onChange={setTfPortfolio}
            />
          </div>
          <div style={{ padding: '4px 12px 18px' }}>
            {snapshotsForPortfolio.length >= 2
              ? <HistoryChart data={snapshotsForPortfolio} />
              : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>Za mało danych historycznych</div>
            }
          </div>
        </div>

        <div className="hero-side">
          <div className="card">
            <div className="card-head">
              <div className="card-title">Statystyki</div>
            </div>
            <div style={{ padding: '4px 20px 4px' }}>
              <div className="rail-stats">
                <div className="rail-stat">
                  <span className="rs-lbl">Koszt zakupu</span>
                  <span className="rs-val">{fmt(totalCostPLN)} zł</span>
                </div>
                <div className="rail-stat">
                  <span className="rs-lbl">Wynik dnia</span>
                  <span className="rs-val" style={{ color: dailyChangePLN >= 0 ? 'var(--up)' : 'var(--down)' }}>
                    {dailyChangePLN >= 0 ? '+' : ''}{fmt(dailyChangePLN)} zł
                  </span>
                </div>
                <div className="rail-stat">
                  <span className="rs-lbl">Beta portfela</span>
                  <span className="rs-val" style={{ color: 'var(--text-faint)' }}>N/A</span>
                </div>
                <div className="rail-stat">
                  <span className="rs-lbl">Pozycji</span>
                  <span className="rs-val">{portfolio.length}</span>
                </div>
              </div>
            </div>
          </div>
          {enriched.length > 0 && (
            <div className="card" style={{ flex: 1 }}>
              <div className="card-head">
                <div className="card-title">Alokacja</div>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <StackedAllocation positions={enriched} totalValue={totalValuePLN} />
              </div>
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 5: Verify**

`npm start` → otwórz zakładkę Portfel. Sprawdź:
- Wykres historii + prawa kolumna ze statystykami i alokacją widoczne
- Tabela pozycji nadal działa

- [ ] **Step 6: Commit**

```bash
git add src/pages/Portfolio.jsx
git commit -m "feat: add chart+rail section to Portfolio (Variant B)"
```

---

## Task 8: Portfolio — Filter Chips, Sector Grouping, Tfoot

**Files:**
- Modify: `src/pages/Portfolio.jsx`

- [ ] **Step 1: Add filter state inside Portfolio function**

Po `const [tfPortfolio, setTfPortfolio] = useState('MAX');`, dodaj:

```jsx
const [filterChip, setFilterChip] = useState('all');
const [grouped, setGrouped] = useState(false);
```

- [ ] **Step 2: Add filtered/grouped positions**

Po `const sorted = useMemo(...)` (ok. linia 415), dodaj nowy `useMemo`:

```jsx
const filteredSorted = useMemo(() => {
  let base = sorted;
  if (filterChip === 'win')  base = sorted.filter(p => (p.plPLN ?? 0) >= 0);
  if (filterChip === 'lose') base = sorted.filter(p => (p.plPLN ?? 0) < 0);
  if (filterChip === 'gpw')  base = sorted.filter(p => p.symbol?.endsWith('.WA'));
  return base;
}, [sorted, filterChip]);

const groupedPositions = useMemo(() => {
  if (!grouped) return null;
  const bySector = {};
  filteredSorted.forEach(p => {
    const sec = p.sector || 'Inne';
    (bySector[sec] = bySector[sec] || []).push(p);
  });
  return Object.entries(bySector).sort((a, b) =>
    b[1].reduce((s, p) => s + (p.valuePLN ?? 0), 0) - a[1].reduce((s, p) => s + (p.valuePLN ?? 0), 0)
  );
}, [filteredSorted, grouped]);

const SECTOR_COLORS_P = {
  Technology: '#7c9eff', Tech: '#7c9eff',
  Gaming: '#a78bfa', Energy: '#ffb020',
  'Consumer Cyclical': '#34d399', Retail: '#34d399',
  'Consumer Defensive': '#34d399',
  Auto: '#ff4d6d', Automotive: '#ff4d6d',
  Finance: '#22d3ee', Financials: '#22d3ee', 'Financial Services': '#22d3ee',
  Healthcare: '#f472b6', Health: '#f472b6',
  'Basic Materials': '#fb923c', Construction: '#fb923c',
  Food: '#facc15', 'Consumer Staples': '#facc15',
  Communication: '#60a5fa', 'Communication Services': '#60a5fa',
  Utilities: '#a3e635', 'Real Estate': '#f87171',
  Industrials: '#fbbf24', Inne: '#8a929d',
};
```

- [ ] **Step 3: Add filter chips and group toggle to card-head**

Znajdź istniejący toolbar (koło linii 595):
```jsx
<div className="card-head" style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', ... }}>
  {[
    ['cost',   'Wg kosztu'],
    ...
  ].map(...)
```

Dodaj PRZED pętlą sortowania (ale wewnątrz `card-head`) nowe chip-filtry i toggle grupowania:

```jsx
          {/* Filter chips */}
          {[
            ['all',  'Wszystkie', null],
            ['win',  'Zyskowne',  'var(--up)'],
            ['lose', 'Stratne',   'var(--down)'],
            ['gpw',  'GPW',       null],
          ].map(([id, lbl, c]) => (
            <button
              key={id}
              className={'chip-filter' + (filterChip === id ? ' active' : '')}
              onClick={() => setFilterChip(id)}
            >
              {c && <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block' }} />}
              {lbl}
            </button>
          ))}
          <button
            className={'chip-filter' + (grouped ? ' active' : '')}
            onClick={() => setGrouped(g => !g)}
            style={{ marginLeft: 4 }}
          >
            Sektory
          </button>
          <div style={{ flex: '0 0 8px' }} />
```

- [ ] **Step 4: Replace table body with filtered/grouped rendering**

Znajdź `{sorted.map(pos => {` wewnątrz `<tbody>` i zastąp:

```jsx
              {grouped && groupedPositions
                ? groupedPositions.map(([sec, list]) => {
                    const sv = list.reduce((s, p) => s + (p.valuePLN ?? 0), 0);
                    const color = SECTOR_COLORS_P[sec] || '#8a929d';
                    return (
                      <React.Fragment key={sec}>
                        <tr className="sector-group">
                          <td colSpan={cols.length + 3}>
                            <div className="sg-inner">
                              <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }} />
                              {sec}
                              <span className="sg-count">· {list.length}</span>
                              <span className="sg-val">
                                {(sv / 1000).toFixed(1)}k · {totalValuePLN > 0 ? ((sv / totalValuePLN) * 100).toFixed(1) : 0}%
                              </span>
                            </div>
                          </td>
                        </tr>
                        {list.map(pos => renderPositionRow(pos))}
                      </React.Fragment>
                    );
                  })
                : filteredSorted.map(pos => renderPositionRow(pos))
              }
```

Wyodrębnij istniejący kod renderowania wiersza do funkcji `renderPositionRow(pos)` przed `return (`:

```jsx
  function renderPositionRow(pos) {
    const share = totalCostPLN > 0 ? ((pos.costPLN ?? 0) / totalCostPLN) * 100 : 0;
    const menuOpen = menuSym === pos.symbol;
    return (
      // ... EXACTLY the existing <React.Fragment key={pos.id ?? pos.symbol}> block
      // from the current sorted.map — move it here unchanged
    );
  }
```

> **Ważne:** Skopiuj istniejący kod renderowania wiersza (od `<React.Fragment key={pos.id ?? pos.symbol}>` do zamykającego `</React.Fragment>`) bez żadnych zmian. Tylko przenieś do funkcji.

- [ ] **Step 5: Add tfoot after tbody**

Po zamknięciu `</tbody>`, dodaj:

```jsx
            {filteredSorted.length > 0 && (() => {
              const tot = filteredSorted.reduce((a, p) => ({
                value: a.value + (p.valuePLN ?? 0),
                pl:    a.pl    + (p.plPLN ?? 0),
                cost:  a.cost  + (p.costPLN ?? 0),
              }), { value: 0, pl: 0, cost: 0 });
              const totRetPct = tot.cost > 0 ? (tot.pl / tot.cost) * 100 : null;
              return (
                <tfoot className="table-pro">
                  <tr>
                    <td className="lbl" style={{ position: 'sticky', left: 0, background: 'var(--panel-2)' }}>
                      Razem · {filteredSorted.length}
                    </td>
                    {cols.map((key, i) => {
                      if (key === 'valuePLN') return <td key={key} className="right">{fmt(tot.value)} zł</td>;
                      if (key === 'plPLN')    return <td key={key} className="right" style={{ color: tot.pl >= 0 ? 'var(--up)' : 'var(--down)' }}>{tot.pl >= 0 ? '+' : ''}{fmt(tot.pl)} zł</td>;
                      if (key === 'costPLN')  return <td key={key} className="right">{fmt(tot.cost)} zł</td>;
                      return <td key={key} />;
                    })}
                    <td className="right">{totRetPct != null ? ((totRetPct >= 0 ? '+' : '') + totRetPct.toFixed(1) + '%') : '—'}</td>
                    <td />
                  </tr>
                </tfoot>
              );
            })()}
```

- [ ] **Step 6: Verify**

`npm start` → Portfel:
- Filter chips (Wszystkie / Zyskowne / Stratne / GPW) widoczne w nagłówku karty
- Przycisk "Sektory" — po kliknięciu wiersze grupowane sektorowo
- Wiersz "Razem" w stopce tabeli
- Sortowanie nadal działa (w trybie niegrupowanym)

- [ ] **Step 7: Commit**

```bash
git add src/pages/Portfolio.jsx
git commit -m "feat: add filter chips, sector grouping, tfoot to Portfolio"
```

---

## Task 9: Deploy

**Files:** brak zmian kodu

- [ ] **Step 1: Build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build
```

Oczekiwane: build zakończy się bez błędów.

- [ ] **Step 2: Deploy**

```bash
vercel --prod
```

> Pamiętaj: deploy zawsze z katalogu `frontend-react` przez `vercel --prod`.

- [ ] **Step 3: Verify on https://myfund-app.vercel.app**

Otwórz aplikację w przeglądarce:
- Dashboard: InsightStrip, 4x KpiPro hero+normal, wykres, top ruchy, alokacja, wygrani/przegrani
- Portfel: wykres + rail stats + alokacja, filter chips, tabela z sektoring toggle, tfoot
- Brak JS errors w konsoli

---

## Self-Review

**Spec coverage:**
- ✅ `src/tabs.css` — Task 1
- ✅ `containerType: inline-size` na Layout.jsx — Task 1
- ✅ KpiPro — Task 2
- ✅ InsightStrip — Task 3
- ✅ StackedAllocation — Task 4
- ✅ WinnersLosers — Task 5
- ✅ Dashboard Variant A layout — Task 6
- ✅ Portfolio chart + rail — Task 7
- ✅ Portfolio filter chips + tfoot + sector grouping — Task 8
- ✅ Deploy — Task 9

**Sprawdzenie konsistencji typów:**
- `positions` we wszystkich 4 komponentach = enriched array z `{ symbol, plPLN, costPLN, dailyChg, sector, valuePLN }`
- `WinnersLosers` używa `TickerLogo` z `components/shared/TickerLogo` — import dodany
- `filteredSorted` w Task 8 zastępuje `sorted` w renderingu — `sorted` nadal używany jako baza
- `totalValuePLN` (linia 413) dostępny dla tfoot
- `groupedPositions` używa `filteredSorted` — ta sama zmienna w Step 4

**Potential gotchas:**
- Task 8 Step 4: `renderPositionRow` musi zachować dostęp do `menuSym`, `menuRef`, `openChart` etc. Zdefiniuj ją jako `function` wewnątrz `Portfolio` komponentu (ma closure na stan).
- `cols.length + 3` w sector-group colspan: cols to tablica kluczy (np. 5 kolumn) + Symbol (1) + Udział% (1) + menu (1) = cols.length + 3. Sprawdź czy zgadza się z aktualną liczbą `<th>` w tabeli.
