# StocksTracker Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visual layer of the Vite+React StocksTracker app with the modern dark design from the handoff — CSS tokens + global utility classes, zero changes to domain logic.

**Architecture:** All color/component styles move to CSS custom properties and semantic classes in `index.css`. Tailwind stays for layout utilities only. Each screen is rewritten JSX-only — hooks, context, services untouched.

**Tech Stack:** Vite + React 18, react-router-dom, Tailwind CSS (layout only), Chart.js (existing charts restyled via options), Google Fonts (Inter + JetBrains Mono)

**Dev server:** `cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run start`  
**Design reference:** `frontend-react/design_handoff_stockstracker_redesign/` (GitHub Z00mer0/stockstracker)  
**Spec:** `docs/superpowers/specs/2026-05-21-stockstracker-redesign-design.md`

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/index.css` | New design tokens + all global utility classes |
| Modify | `src/components/layout/Layout.jsx` | Grid shell with new dimensions |
| Modify | `src/components/layout/Sidebar.jsx` | Brand, nav sections, accent bar, footer |
| Modify | `src/components/layout/Header.jsx` | Topbar: search, ticker strip, bell, CTA |
| Modify | `src/components/layout/navItems.js` | SVG icons replacing emoji |
| Create | `src/components/shared/Card.jsx` | `.card` wrapper component |
| Create | `src/components/shared/Chip.jsx` | Delta chip (▲/▼ X.XX%) |
| Create | `src/components/shared/SegmentedControl.jsx` | `.seg` control |
| Create | `src/components/shared/TickerLogo.jsx` | 2-char mono avatar |
| Modify | `src/components/shared/Sparkline.jsx` | Use CSS var colors, 1.6px stroke |
| Modify | `src/pages/Settings.jsx` | New visual layout |
| Modify | `src/pages/Watchlist.jsx` | New table layout |
| Modify | `src/pages/Transactions.jsx` | KPI strip + new table |
| Modify | `src/pages/Dividends.jsx` | New layout with toggle |
| Modify | `src/pages/Calendar.jsx` | Month grid + event list |
| Modify | `src/pages/History.jsx` | KPI + chart + snapshots |
| Modify | `src/pages/ScenarioLab.jsx` | Inputs + payoff chart |
| Modify | `src/pages/Analysis.jsx` | Risk KPI + rebalancing |
| Modify | `src/pages/Portfolio.jsx` | Holdings table + chart |
| Modify | `src/pages/Dashboard.jsx` | KPI cards + movers + donut |

---

## Task 0: CSS Foundation

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Replace `index.css` entirely**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

/* ── Design tokens ── */
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
  --up-soft:       rgba(0, 157, 90, 0.12);
  --down:          #d92d4e;
  --down-soft:     rgba(217, 45, 78, 0.12);
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ── Scrollbar ── */
::-webkit-scrollbar          { width: 6px; height: 6px; }
::-webkit-scrollbar-track    { background: transparent; }
::-webkit-scrollbar-thumb    { background: var(--border-strong); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-faint); }

/* ── Typography helpers ── */
.mono {
  font-family: 'JetBrains Mono', 'Fira Mono', monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.caps {
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* ── Privacy ── */
body.privacy-mode .privacy-blur { filter: blur(6px); user-select: none; }

/* ── Card ── */
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}
.card-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-dim);
}
.card-body {
  padding: 16px;
}

/* ── Button ── */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  white-space: nowrap;
}
.btn:hover { background: var(--panel-hover); border-color: var(--border-strong); }
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #051a10;
  font-weight: 600;
}
.btn-primary:hover { opacity: 0.9; }
.btn-ghost {
  background: transparent;
  border-color: transparent;
}
.btn-ghost:hover { background: var(--panel-hover); border-color: var(--border); }
.btn-danger { color: var(--down); }
.btn-danger:hover { background: var(--down-soft); border-color: var(--down); }

/* ── Chip ── */
.chip {
  display: inline-flex;
  align-items: center;
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  white-space: nowrap;
}
.chip-up   { background: var(--up-soft);   color: var(--up);   }
.chip-down { background: var(--down-soft); color: var(--down); }
.chip-warn { background: rgba(255,176,32,0.12); color: var(--warn); }
.chip-info { background: rgba(124,158,255,0.12); color: var(--info); }

/* ── Tag ── */
.tag {
  display: inline-flex;
  align-items: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 3px 7px;
  border-radius: 4px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  color: var(--text-dim);
}
.tag-buy  { color: var(--up);   background: var(--up-soft);   border-color: transparent; }
.tag-sell { color: var(--down); background: var(--down-soft); border-color: transparent; }
.tag-div  { color: var(--info); background: rgba(124,158,255,0.12); border-color: transparent; }
.tag-fee  { color: var(--warn); background: rgba(255,176,32,0.12); border-color: transparent; }

/* ── Segmented control ── */
.seg {
  display: inline-flex;
  align-items: center;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
}
.seg button {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 4px 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  white-space: nowrap;
}
.seg button:hover { color: var(--text); }
.seg button.active {
  background: var(--panel);
  color: var(--text);
  box-shadow: inset 0 0 0 1px var(--border);
}

/* ── Ticker logo ── */
.ticker-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-dim);
  flex-shrink: 0;
  text-transform: uppercase;
}
.ticker-logo-lg {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  font-size: 14px;
}

/* ── Table ── */
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table thead th {
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-dim);
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border);
  background: var(--panel);
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
}
.data-table thead th.right { text-align: right; }
.data-table tbody td {
  padding: 13px 14px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 13.5px;
}
.data-table tbody td.right { text-align: right; }
.data-table tbody td.mono  { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
.data-table tbody tr:last-child td { border-bottom: none; }
.data-table tbody tr:hover  { background: var(--panel-hover); cursor: pointer; }

/* ── KPI card ── */
.kpi-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kpi-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-faint);
}
.kpi-value {
  font-family: 'JetBrains Mono', monospace;
  font-variant-numeric: tabular-nums;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text);
  line-height: 1.1;
}
.kpi-sub {
  font-size: 12px;
  color: var(--text-dim);
}

/* ── Page header ── */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}
.page-title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.page-sub {
  font-size: 13px;
  color: var(--text-dim);
  margin-top: 3px;
}

/* ── Input ── */
.field-input {
  width: 100%;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text);
  outline: none;
  transition: border-color 0.12s;
}
.field-input:focus { border-color: var(--accent); }
.field-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-dim);
  margin-bottom: 6px;
  display: block;
}

/* ── Status dot ── */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--up);
  animation: pulse-dot 2.4s ease-in-out infinite;
}
.status-dot-off { background: var(--text-faint); animation: none; }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 var(--up-soft); }
  50% { opacity: 0.7; box-shadow: 0 0 0 4px transparent; }
}

/* ── Breadcrumb ── */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-dim);
  margin-bottom: 16px;
}
.breadcrumb a { color: var(--text-dim); text-decoration: none; }
.breadcrumb a:hover { color: var(--text); }
.breadcrumb .sep { color: var(--text-faint); }
.breadcrumb .current { color: var(--text); font-weight: 500; }
```

- [ ] **Step 2: Verify dev server starts without errors**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run start
```

Expected: Vite starts, no compilation errors in terminal. Open `http://localhost:5173` — app renders (old styling broken but no crash).

- [ ] **Step 3: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/index.css && git commit -m "style: replace CSS tokens with new dark design system"
```

---

## Task 1: Shared Components

**Files:**
- Create: `src/components/shared/Card.jsx`
- Create: `src/components/shared/Chip.jsx`
- Create: `src/components/shared/SegmentedControl.jsx`
- Create: `src/components/shared/TickerLogo.jsx`
- Modify: `src/components/shared/Sparkline.jsx`

- [ ] **Step 1: Create `Card.jsx`**

```jsx
// src/components/shared/Card.jsx
export default function Card({ title, actions, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {title != null && (
        <div className="card-head">
          <span className="card-title">{title}</span>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `Chip.jsx`**

```jsx
// src/components/shared/Chip.jsx
export default function Chip({ value, suffix = '%', decimals = 2 }) {
  if (value == null || isNaN(value)) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  const up = value >= 0;
  const arrow = up ? '▲' : '▼';
  const cls = up ? 'chip chip-up' : 'chip chip-down';
  return (
    <span className={cls}>
      {arrow} {Math.abs(value).toFixed(decimals)}{suffix}
    </span>
  );
}
```

- [ ] **Step 3: Create `SegmentedControl.jsx`**

```jsx
// src/components/shared/SegmentedControl.jsx
export default function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(opt => {
        const key = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        return (
          <button
            key={key}
            className={value === key ? 'active' : ''}
            onClick={() => onChange(key)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create `TickerLogo.jsx`**

```jsx
// src/components/shared/TickerLogo.jsx
export default function TickerLogo({ symbol = '', size = 'sm' }) {
  const chars = symbol.replace(/\.(WA|US|UK)$/i, '').slice(0, 2).toUpperCase();
  const cls = size === 'lg' ? 'ticker-logo ticker-logo-lg' : 'ticker-logo';
  return <span className={cls}>{chars}</span>;
}
```

- [ ] **Step 5: Update `Sparkline.jsx` to use CSS variables**

```jsx
// src/components/shared/Sparkline.jsx
import React from 'react';

export default function Sparkline({ data = [], width = 80, height = 28 }) {
  if (data.length < 2) return <span style={{ width, display: 'inline-block' }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const isUp = data[data.length - 1] >= data[0];

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = pts.join(' ');
  const area = `0,${height} ${polyline} ${width},${height}`;
  const gradId = `sg-${Math.random().toString(36).slice(2, 7)}`;
  const color = isUp ? 'var(--up)' : 'var(--down)';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/components/shared/ && git commit -m "feat: shared design system components (Card, Chip, Seg, TickerLogo, Sparkline)"
```

---

## Task 2: App Shell

**Files:**
- Modify: `src/components/layout/navItems.js`
- Modify: `src/components/layout/Layout.jsx`
- Modify: `src/components/layout/Sidebar.jsx`
- Modify: `src/components/layout/Header.jsx`

- [ ] **Step 1: Update `navItems.js` with SVG icons**

```js
// src/components/layout/navItems.js
const ic = (d) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

export const NAV_ITEMS = [
  { to: '/',             icon: ic(<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>), label: 'Dashboard' },
  { to: '/portfolio',    icon: ic(<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></>), label: 'Portfel' },
  { to: '/history',      icon: ic(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>), label: 'Historia' },
  { to: '/transactions', icon: ic(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></>), label: 'Transakcje' },
  { to: '/dividends',    icon: ic(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>), label: 'Dywidendy' },
  { to: '/calendar',     icon: ic(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>), label: 'Kalendarz' },
  { to: '/watchlist',    icon: ic(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>), label: 'Watchlist' },
  { to: '/scenario',     icon: ic(<><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></>), label: 'Scenario Lab' },
  { to: '/analysis',     icon: ic(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>), label: 'Atrybucja' },
];

export const NAV_BOTTOM = [
  { to: '/settings', icon: ic(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>), label: 'Ustawienia' },
];
```

- [ ] **Step 2: Update `Layout.jsx`**

```jsx
// src/components/layout/Layout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const THEME_KEY = 'myfund_theme';

export default function Layout() {
  const { pathname } = useLocation();
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // apply theme on first mount
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem(THEME_KEY) || 'dark');
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '232px 1fr', height: '100vh', background: 'var(--bg)', color: 'var(--text)', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px 60px', maxWidth: '1640px', width: '100%' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `Sidebar.jsx`**

```jsx
// src/components/layout/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { NAV_ITEMS, NAV_BOTTOM } from './navItems';

const BrandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
    <polyline points="17 6 23 6 23 12"/>
  </svg>
);

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 10px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 500,
        color: isActive ? 'var(--text)' : 'var(--text-dim)',
        background: isActive ? 'var(--panel)' : 'transparent',
        boxShadow: isActive ? 'inset 3px 0 0 var(--accent)' : 'none',
        textDecoration: 'none',
        transition: 'background 0.1s, color 0.1s',
      })}
      onMouseEnter={e => { if (!e.currentTarget.getAttribute('aria-current')) e.currentTarget.style.background = 'var(--panel-hover)'; }}
      onMouseLeave={e => { if (!e.currentTarget.getAttribute('aria-current')) e.currentTarget.style.background = ''; }}
    >
      <span style={{ opacity: 0.75, flexShrink: 0 }}>{icon}</span>
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  const { displayName, logout } = useApp();

  return (
    <aside style={{
      background: 'var(--bg-2)',
      borderRight: '1px solid var(--border)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Brand */}
      <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), #00a863)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#051a10',
        }}>
          <BrandIcon />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          stockstracker<span style={{ color: 'var(--accent)' }}>.</span>
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '4px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '8px 10px 4px' }}>
          Główne
        </div>
        {NAV_ITEMS.map(item => <NavItem key={item.to} {...item} />)}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '12px 10px 4px' }}>
          Konto
        </div>
        {NAV_BOTTOM.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--panel-2)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace',
        }}>
          {(displayName || 'U').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', truncate: true }}>{displayName || 'Użytkownik'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>GPW · PLN</div>
        </div>
        <button onClick={logout} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-faint)'}
        >
          ↪
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 4: Update `Header.jsx` (Topbar)**

```jsx
// src/components/layout/Header.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { usePrivacy } from '../../context/PrivacyContext';
import AddStockModal from '../AddStockModal';

function isEuropeDST() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const lastSunMarch = new Date(Date.UTC(y, 2, 31));
  while (lastSunMarch.getUTCDay() !== 0) lastSunMarch.setUTCDate(lastSunMarch.getUTCDate() - 1);
  const lastSunOct = new Date(Date.UTC(y, 9, 31));
  while (lastSunOct.getUTCDay() !== 0) lastSunOct.setUTCDate(lastSunOct.getUTCDate() - 1);
  return now >= lastSunMarch && now < lastSunOct;
}
function getMarketStatuses() {
  const now = new Date();
  const day = now.getUTCDay();
  const t = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isWd = day >= 1 && day <= 5;
  const dst = isEuropeDST();
  return [
    { label: 'GPW',  open: isWd && t >= (dst ? 420 : 480) && t < (dst ? 905 : 965) },
    { label: 'NYSE', open: isWd && t >= 870 && t < 1260 },
    { label: 'LSE',  open: isWd && t >= (dst ? 420 : 480) && t < (dst ? 930 : 990) },
  ];
}

const TICKERS = [
  { sym: 'WIG20', val: '2 156', delta: +0.43 },
  { sym: 'S&P500', val: '5 308', delta: -0.12 },
  { sym: 'DAX', val: '18 921', delta: +0.67 },
  { sym: 'EUR/PLN', val: '4.278', delta: -0.08 },
  { sym: 'USD/PLN', val: '3.921', delta: +0.21 },
];

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const EyeIcon = ({ closed }) => closed ? (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

export default function Header({ theme, onThemeToggle }) {
  const { refresh, loading } = useApp();
  const { isPrivate, toggle } = usePrivacy();
  const [markets, setMarkets] = useState(getMarketStatuses);
  const [showAdd, setShowAdd] = useState(false);
  const { transactions, saveTransactions } = useApp();

  useEffect(() => {
    const id = setInterval(() => setMarkets(getMarketStatuses()), 60000);
    return () => clearInterval(id);
  }, []);

  const iconBtn = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 8,
    background: 'none', border: 'none',
    color: 'var(--text-dim)', cursor: 'pointer',
    transition: 'background 0.1s, color 0.1s',
  };

  return (
    <header style={{
      height: 56, flexShrink: 0,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 20px',
      background: 'var(--bg-2)',
      borderBottom: '1px solid var(--border)',
      position: 'sticky', top: 0, zIndex: 10,
    }}>
      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 320, flex: '0 1 320px' }}>
        <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }}
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          className="field-input"
          style={{ paddingLeft: 32, paddingRight: 40, height: 34, fontSize: 12, color: 'var(--text-dim)' }}
          placeholder="Szukaj…"
          readOnly
        />
        <kbd style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: 'var(--text-faint)', background: 'var(--panel-2)',
          border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px',
          fontFamily: 'JetBrains Mono, monospace',
        }}>⌘K</kbd>
      </div>

      {/* Ticker strip */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 18, overflow: 'hidden' }}>
        {TICKERS.map(t => (
          <div key={t.sym} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-dim)', letterSpacing: '0.04em' }}>{t.sym}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>{t.val}</span>
            <span className="mono" style={{ fontSize: 11, color: t.delta >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {t.delta >= 0 ? '+' : ''}{t.delta.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>

      {/* Market status dots */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {markets.map(m => (
          <span key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.open ? 'var(--up)' : 'var(--text-faint)', display: 'inline-block' }} />
            {m.label}
          </span>
        ))}
      </div>

      {/* Actions */}
      <button style={iconBtn} onClick={onThemeToggle}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--panel-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-dim)'; }}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>

      <button style={iconBtn} onClick={toggle}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--panel-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-dim)'; }}
      >
        <EyeIcon closed={isPrivate} />
      </button>

      {/* Bell */}
      <div style={{ position: 'relative' }}>
        <button style={iconBtn}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--panel-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-dim)'; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </button>
        <span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: '50%', background: 'var(--down)', border: '1.5px solid var(--bg-2)' }} />
      </div>

      <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ fontSize: 12 }}>
        + Dodaj transakcję
      </button>

      {showAdd && (
        <AddStockModal
          existingTransactions={transactions}
          onSave={async (tx) => { await saveTransactions([...transactions, tx]); refresh(); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </header>
  );
}
```

- [ ] **Step 5: Verify layout in browser**

Start dev server: `cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run start`

Expected at `http://localhost:5173`:
- Dark sidebar (232px) with gradient brand logo and "stockstracker." 
- Nav items with SVG icons, active item has left green bar
- Topbar with search box, ticker strip, bell, "Dodaj transakcję" green button
- Page content area has correct padding

- [ ] **Step 6: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/components/layout/ && git commit -m "feat(shell): new sidebar, topbar, and layout grid"
```

---

## Task 3: Settings Page

**Files:**
- Modify: `src/pages/Settings.jsx`

- [ ] **Step 1: Rewrite `Settings.jsx`**

```jsx
// src/pages/Settings.jsx
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../hooks/useApi';
import { getMdApiKey, setMdApiKey } from '../services/MarketDataService';
import { US_TAX_KEY } from '../services/dividendService';
import BrokerImportModal from '../components/BrokerImportModal';
import Card from '../components/shared/Card';

function SettingsRow({ label, value, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{label}</span>
      {children || <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>{value}</span>}
    </div>
  );
}

function ApiKeySection() {
  const [key, setKey] = useState(getMdApiKey);
  const [saved, setSaved] = useState(false);
  const isSet = !!getMdApiKey();

  function save() { setMdApiKey(key); setSaved(true); setTimeout(() => setSaved(false), 2000); }

  return (
    <Card title="Klucze API">
      <div className="card-body">
        <SettingsRow label={<span>MarketData.app <span style={{ fontWeight: 400, fontSize: 11, color: isSet ? 'var(--up)' : 'var(--warn)', marginLeft: 6 }}>{isSet ? '✓ ustawiony' : 'nie ustawiony'}</span></span>}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="password" value={key} onChange={e => setKey(e.target.value)}
              className="field-input mono" style={{ width: 200, fontSize: 12 }} placeholder="Wklej klucz…" />
            <button onClick={save} className={`btn ${saved ? '' : 'btn-primary'}`} style={{ fontSize: 12 }}>
              {saved ? '✓ Zapisano' : 'Zapisz'}
            </button>
          </div>
        </SettingsRow>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 8 }}>
          Klucz przechowywany tylko lokalnie. Darmowy klucz: marketdata.app
        </p>
      </div>
    </Card>
  );
}

function ChangePasswordSection() {
  const [form, setForm] = useState({ current: '', next: '', next2: '' });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.next !== form.next2) { setError('Nowe hasła nie są identyczne'); return; }
    setLoading(true);
    try {
      await api.post('/api/change-password', { current_password: form.current, new_password: form.next });
      setSuccess(true);
      setForm({ current: '', next: '', next2: '' });
    } catch (err) {
      setError(err.response?.data?.error ?? 'Błąd zmiany hasła');
    } finally { setLoading(false); }
  }

  return (
    <Card title="Zmiana hasła">
      <form onSubmit={handleSubmit} className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[['Aktualne hasło', 'current', 'current-password'], ['Nowe hasło', 'next', 'new-password'], ['Powtórz nowe', 'next2', 'new-password']].map(([label, field, ac]) => (
          <div key={field}>
            <label className="field-label">{label}</label>
            <input type="password" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              autoComplete={ac} className="field-input" />
          </div>
        ))}
        {error && <p style={{ color: 'var(--down)', fontSize: 12 }}>{error}</p>}
        {success && <p style={{ color: 'var(--up)', fontSize: 12 }}>Hasło zostało zmienione ✓</p>}
        <button type="submit" className="btn btn-primary"
          disabled={loading || !form.current || !form.next || !form.next2}
          style={{ alignSelf: 'flex-start', opacity: (loading || !form.current || !form.next || !form.next2) ? 0.4 : 1 }}>
          {loading ? 'Zapisywanie…' : 'Zmień hasło'}
        </button>
      </form>
    </Card>
  );
}

function DividendTaxSection() {
  const [usTax, setUsTax] = useState(() => localStorage.getItem(US_TAX_KEY) || '15');
  function save(val) { setUsTax(val); localStorage.setItem(US_TAX_KEY, val); }

  return (
    <Card title="Podatek od dywidend">
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SettingsRow label="GPW (.WA)" value="19% ryczałt (stała)" />
        <div>
          <label className="field-label">Akcje US</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ val: '15', label: '15%', desc: 'Umowa PL-US' }, { val: '30', label: '30%', desc: 'Pełny withholding' }].map(opt => (
              <button key={opt.val} onClick={() => save(opt.val)}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'left',
                  border: `1px solid ${usTax === opt.val ? 'var(--accent)' : 'var(--border)'}`,
                  background: usTax === opt.val ? 'var(--up-soft)' : 'var(--panel-2)',
                  cursor: 'pointer',
                }}
              >
                <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: usTax === opt.val ? 'var(--up)' : 'var(--text)', marginBottom: 2 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Settings() {
  const { displayName, logout, refresh, fxRates, transactions, saveTransactions } = useApp();
  const apiUrl = import.meta.env.VITE_API_URL ?? '(proxy lokalny)';
  const [showBrokerImport, setShowBrokerImport] = useState(false);

  return (
    <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Konto */}
      <Card title="Konto">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <SettingsRow label="Zalogowany jako" value={displayName || '—'} />
          <SettingsRow label="API URL">
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apiUrl}</span>
          </SettingsRow>
          <div style={{ paddingTop: 14, display: 'flex', gap: 8 }}>
            <button onClick={refresh} className="btn btn-primary" style={{ fontSize: 12 }}>Odśwież dane</button>
            <button onClick={logout} className="btn" style={{ fontSize: 12 }}>Wyloguj →</button>
          </div>
        </div>
      </Card>

      <ChangePasswordSection />
      <ApiKeySection />
      <DividendTaxSection />

      {/* Import brokera */}
      <Card title="Import danych brokera">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Importuj historię z pliku CSV (eToro itp.). Obsługiwane: Closed Positions, Cash Operations.
          </p>
          <button onClick={() => setShowBrokerImport(true)} className="btn" style={{ alignSelf: 'flex-start', fontSize: 12 }}>
            ↑ Importuj CSV brokera
          </button>
        </div>
      </Card>

      {/* Kursy walut */}
      <Card title="Kursy walut">
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {['USD', 'EUR', 'GBP'].map(cur => (
            <SettingsRow key={cur} label={`${cur} / PLN`}>
              <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>
                {fxRates[cur] != null ? fxRates[cur].toFixed(4) : '—'} zł
              </span>
            </SettingsRow>
          ))}
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>Aktualizowane co 30 min (frankfurter.app)</p>
        </div>
      </Card>

      {/* O aplikacji */}
      <div style={{ fontSize: 11, color: 'var(--text-faint)', padding: '4px 0' }}>
        StocksTracker — Vite + React. Dane: Render (PostgreSQL).
      </div>

      {showBrokerImport && (
        <BrokerImportModal
          existingTransactions={transactions}
          onSave={async (newTxs) => { await saveTransactions(newTxs); refresh(); }}
          onClose={() => setShowBrokerImport(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:5173/settings`.  
Expected: 2-column-style stacked cards, dark background (`--panel`), green accent on "Zapisz"/"Odśwież" buttons, monospace font on API URL and FX rates, no Tailwind slate colors visible.

- [ ] **Step 3: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/Settings.jsx && git commit -m "feat(settings): redesign with new card layout and design tokens"
```

---

## Task 4: Watchlist Page

**Files:**
- Modify: `src/pages/Watchlist.jsx`

- [ ] **Step 1: Rewrite `Watchlist.jsx`**

```jsx
// src/pages/Watchlist.jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import Card from '../components/shared/Card';
import Chip from '../components/shared/Chip';
import TickerLogo from '../components/shared/TickerLogo';
import Sparkline from '../components/shared/Sparkline';

const WATCH_KEY = 'myfund_watchlist';
function authHeader() { return { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' }; }

async function fetchLivePrice(sym) {
  try {
    const q = await fetch(`/api/finnhub/v1/quote?symbol=${sym}`, { signal: AbortSignal.timeout(8000), headers: authHeader() }).then(r => r.json());
    if (q?.c > 0) return { price: q.c, dailyChg: q.dp ?? null };
  } catch {}
  try {
    const yfUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
    const json = await fetch(`/api/proxy?url=${encodeURIComponent(yfUrl)}`, { signal: AbortSignal.timeout(8000), headers: authHeader() }).then(r => r.json());
    const meta = json?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice) {
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
      return { price: meta.regularMarketPrice, dailyChg: prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : null };
    }
  } catch {}
  return null;
}

function loadWatchlist() { try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]'); } catch { return []; } }
function saveWatchlist(items) { localStorage.setItem(WATCH_KEY, JSON.stringify(items)); }
function genId() { return Math.random().toString(36).slice(2, 10); }

function AlertModal({ item, onClose, onSave }) {
  const [type, setType] = useState('above');
  const [price, setPrice] = useState('');
  function handleAdd() {
    if (!price || isNaN(parseFloat(price))) return;
    const target = parseFloat(price);
    const triggered = (type === 'above' && (item.addedPrice ?? 0) >= target) || (type === 'below' && (item.addedPrice ?? 0) <= target);
    onSave({ id: genId(), type, targetPrice: target, triggered });
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="card" style={{ width: 340, padding: 24 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Alert — {item.symbol}</h2>
        {item.addedPrice != null && <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>Cena przy dodaniu: {item.addedPrice.toFixed(2)} {item.currency}</p>}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['above', 'below'].map(t => (
            <button key={t} onClick={() => setType(t)} className={`btn ${type === t ? 'btn-primary' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
              {t === 'above' ? '↑ Powyżej' : '↓ Poniżej'}
            </button>
          ))}
        </div>
        <input type="number" placeholder="Cena docelowa" value={price} onChange={e => setPrice(e.target.value)}
          className="field-input" style={{ marginBottom: 20 }} autoFocus />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="btn" style={{ flex: 1, justifyContent: 'center' }}>Anuluj</button>
          <button onClick={handleAdd} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Dodaj</button>
        </div>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const { portfolio } = useApp();
  const { openChart } = useChart();
  const [watchItems, setWatchItems] = useState([]);
  const [alertTarget, setAlertTarget] = useState(null);
  const [livePrices, setLivePrices] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => { setWatchItems(loadWatchlist()); }, []);

  useEffect(() => {
    if (!watchItems.length) return;
    setLoading(true);
    const symbols = [...new Set(watchItems.map(w => w.symbol))];
    Promise.allSettled(symbols.map(async sym => ({ sym, data: await fetchLivePrice(sym) }))).then(results => {
      const prices = {};
      results.forEach(r => { if (r.status === 'fulfilled' && r.value.data) prices[r.value.sym] = r.value.data; });
      setLivePrices(prices);
    }).finally(() => setLoading(false));
  }, [watchItems.length]);

  function addAlert(itemId, alert) {
    setWatchItems(prev => { const u = prev.map(w => w.id === itemId ? { ...w, alerts: [...(w.alerts ?? []), alert] } : w); saveWatchlist(u); return u; });
    setAlertTarget(null);
  }
  function removeAlert(itemId, alertId) {
    setWatchItems(prev => { const u = prev.map(w => w.id === itemId ? { ...w, alerts: (w.alerts ?? []).filter(a => a.id !== alertId) } : w); saveWatchlist(u); return u; });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title={`Obserwowane spółki${watchItems.length ? ` · ${watchItems.length}` : ''}`}
        actions={loading && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Ładowanie kursów…</span>}
      >
        {!watchItems.length ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-dim)' }}>
            <p>Watchlist jest pusta.</p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>Spółki obserwowane przechowywane są lokalnie.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Aktywo</th>
                  <th className="right">Cena dodania</th>
                  <th className="right">Kurs</th>
                  <th className="right">Dzień</th>
                  <th>Notatka</th>
                  <th className="right">Alerty</th>
                </tr>
              </thead>
              <tbody>
                {watchItems.map(w => {
                  const live = livePrices[w.symbol];
                  return (
                    <tr key={w.id ?? w.symbol} onClick={() => openChart(w.symbol)}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <TickerLogo symbol={w.symbol} />
                          <div>
                            <div className="mono" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{w.symbol}</div>
                            {w.name && w.name !== w.symbol && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{w.name}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="right mono" style={{ color: 'var(--text-dim)', fontSize: 13 }}>
                        {w.addedPrice != null ? `${w.addedPrice.toFixed(2)} ${w.currency ?? ''}` : '—'}
                      </td>
                      <td className="right mono" style={{ fontWeight: 600, fontSize: 13 }}>
                        {loading && !live ? <span style={{ color: 'var(--text-faint)' }}>…</span>
                          : live ? `${live.price.toFixed(2)} ${w.currency ?? ''}` : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>
                      <td className="right">
                        {live?.dailyChg != null ? <Chip value={live.dailyChg} /> : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-faint)' }}>{w.note || '—'}</td>
                      <td className="right" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
                          {(w.alerts ?? []).map(a => (
                            <button key={a.id} onClick={() => removeAlert(w.id, a.id)}
                              className={`chip ${a.triggered ? 'chip-warn' : a.type === 'above' ? 'chip-up' : 'chip-down'}`}
                              style={{ cursor: 'pointer', textDecoration: a.triggered ? 'line-through' : 'none', border: 'none' }}
                              title="Kliknij aby usunąć">
                              {a.type === 'above' ? '↑' : '↓'} {a.targetPrice?.toFixed(2)}
                            </button>
                          ))}
                          <button onClick={() => setAlertTarget(w)} className="chip chip-info" style={{ cursor: 'pointer', border: 'none' }}>+ Alert</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {portfolio.length > 0 && (
        <Card title="Posiadane spółki">
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="right">Ilość</th>
                  <th className="right">Śr. cena</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.map(pos => (
                  <tr key={pos.id ?? pos.symbol} onClick={() => openChart(pos.symbol)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <TickerLogo symbol={pos.symbol} />
                        <div>
                          <div className="mono" style={{ fontWeight: 700, fontSize: 13 }}>{pos.symbol}</div>
                          {pos.name && pos.name !== pos.symbol && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{pos.name}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="right mono" style={{ fontSize: 13 }}>{pos.qty?.toLocaleString('pl-PL') ?? '—'}</td>
                    <td className="right mono" style={{ fontSize: 13, color: 'var(--text-dim)' }}>{pos.avgPrice?.toFixed(2)} {pos.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {alertTarget && (
        <AlertModal item={alertTarget} onClose={() => setAlertTarget(null)} onSave={alert => addAlert(alertTarget.id, alert)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `http://localhost:5173/watchlist`.  
Expected: `card` wrapper, `data-table` style (10px caps headers, hover rows), TickerLogo avatars, Chip deltas in green/red, no Tailwind slate classes.

- [ ] **Step 3: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/Watchlist.jsx && git commit -m "feat(watchlist): redesign with data-table and TickerLogo"
```

---

## Task 5: Transactions Page

**Files:**
- Modify: `src/pages/Transactions.jsx`

- [ ] **Step 1: Read current file to understand data shape**

```bash
head -80 /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/Transactions.jsx
```

- [ ] **Step 2: Rewrite `Transactions.jsx`**

Replace the entire file content with:

```jsx
// src/pages/Transactions.jsx
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import Card from '../components/shared/Card';
import Chip from '../components/shared/Chip';
import TickerLogo from '../components/shared/TickerLogo';
import SegmentedControl from '../components/shared/SegmentedControl';

const FILTERS = [
  { value: 'all',      label: 'Wszystkie' },
  { value: 'BUY',      label: 'Kupno' },
  { value: 'SELL',     label: 'Sprzedaż' },
  { value: 'DIVIDEND', label: 'Dywidendy' },
  { value: 'FEE',      label: 'Prowizje' },
];

const TAG_CLASS = { BUY: 'tag-buy', SELL: 'tag-sell', DIVIDEND: 'tag-div', DIV: 'tag-div', FEE: 'tag-fee' };
const TAG_LABEL = { BUY: 'Kupno', SELL: 'Sprzedaż', DIVIDEND: 'Dywidenda', DIV: 'Dywidenda', FEE: 'Prowizja' };

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtMoney(v, cur = 'PLN') {
  if (v == null) return '—';
  return Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + cur;
}

export default function Transactions() {
  const { transactions = [] } = useApp();
  const [filter, setFilter] = useState('all');

  const now = new Date();
  const d30ago = new Date(now - 30 * 24 * 3600 * 1000);

  const stats = useMemo(() => {
    const recent = transactions.filter(t => new Date(t.date) >= d30ago);
    const sum = (type) => recent.filter(t => t.type === type || t.type === type.toUpperCase()).reduce((a, t) => a + (Math.abs(t.total ?? t.value ?? 0)), 0);
    return {
      buy: sum('BUY'), sell: sum('SELL'), div: sum('DIVIDEND') + sum('DIV'), fee: sum('FEE'),
    };
  }, [transactions]);

  const filtered = useMemo(() =>
    filter === 'all' ? transactions : transactions.filter(t => t.type === filter || t.type?.toUpperCase() === filter),
    [transactions, filter]
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date)), [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Kupna 30d', value: stats.buy, cls: 'chip-up' },
          { label: 'Sprzedaże 30d', value: stats.sell, cls: 'chip-down' },
          { label: 'Dywidendy 30d', value: stats.div, cls: 'chip-info' },
          { label: 'Prowizje 30d', value: stats.fee, cls: 'chip-warn' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ fontSize: 20 }}>{fmtMoney(value)}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <Card
        title={`Transakcje · ${sorted.length}`}
        actions={<SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Typ</th>
                <th>Aktywo</th>
                <th className="right">Ilość</th>
                <th className="right">Cena</th>
                <th className="right">Wartość</th>
                <th className="right">Waluta</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '32px 14px' }}>Brak transakcji</td></tr>
              )}
              {sorted.map((t, i) => {
                const typeKey = t.type?.toUpperCase();
                return (
                  <tr key={t.id ?? i}>
                    <td className="mono" style={{ color: 'var(--text-dim)', fontSize: 12 }}>{fmtDate(t.date)}</td>
                    <td><span className={`tag ${TAG_CLASS[typeKey] ?? ''}`}>{TAG_LABEL[typeKey] ?? typeKey}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TickerLogo symbol={t.symbol ?? t.sym ?? ''} />
                        <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{t.symbol ?? t.sym}</span>
                      </div>
                    </td>
                    <td className="right mono" style={{ fontSize: 13 }}>{t.qty != null ? Number(t.qty).toLocaleString('pl-PL') : '—'}</td>
                    <td className="right mono" style={{ fontSize: 13, color: 'var(--text-dim)' }}>{t.price != null ? Number(t.price).toFixed(2) : '—'}</td>
                    <td className="right mono" style={{ fontSize: 13, fontWeight: 600 }}>{fmtMoney(t.total ?? t.value, t.currency)}</td>
                    <td className="right" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t.currency ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:5173/transactions`.  
Expected: 4 KPI cards at top, segmented filter, table with colored tags (buy=green, sell=red, div=blue, fee=amber).

- [ ] **Step 4: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/Transactions.jsx && git commit -m "feat(transactions): redesign with KPI strip and tagged table"
```

---

## Task 6: Dividends Page

**Files:**
- Modify: `src/pages/Dividends.jsx`

- [ ] **Step 1: Read current file**

```bash
wc -l /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/Dividends.jsx
head -60 /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/Dividends.jsx
```

- [ ] **Step 2: Replace styling in `Dividends.jsx`**

Identify the outer wrapper JSX and replace Tailwind classes with new classes. The data/hook logic stays 100% unchanged. Replace only:
- `rounded-xl border border-slate-700 bg-slate-800` → `card`
- `border-slate-700 px-5 py-4 border-b` → `card-head`
- `text-sm font-semibold text-slate-300` → `card-title`
- `px-5 py-4` → `card-body`
- `text-emerald-*` → inline `color: var(--up)`
- `text-rose-*` / `text-red-*` → inline `color: var(--down)`
- `text-amber-*` → inline `color: var(--warn)`
- `text-indigo-*` / `text-blue-*` → inline `color: var(--info)`
- `text-slate-300/400/500` → `color: var(--text)` / `var(--text-dim)` / `var(--text-faint)`
- `bg-slate-800` → `background: var(--panel)`
- `bg-slate-700` → `background: var(--panel-2)`
- `border-slate-700` → `border-color: var(--border)`
- Table headers: replace className with `.data-table` pattern
- Chip-like spans: replace with `<Chip>` component or `.chip .chip-up/.chip-down`

Add to top imports:
```jsx
import Card from '../components/shared/Card';
import Chip from '../components/shared/Chip';
import SegmentedControl from '../components/shared/SegmentedControl';
```

Replace BRUTTO/NETTO toggle with `<SegmentedControl options={['BRUTTO','NETTO']} value={mode} onChange={setMode} />`.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:5173/dividends`. Expected: consistent dark styling, no Tailwind slate classes in DOM, green/red/amber colors correct.

- [ ] **Step 4: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/Dividends.jsx && git commit -m "feat(dividends): apply design tokens and shared components"
```

---

## Task 7: Calendar Page

**Files:**
- Modify: `src/pages/Calendar.jsx`

- [ ] **Step 1: Read current Calendar.jsx**

```bash
wc -l /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/Calendar.jsx
```

- [ ] **Step 2: Apply design tokens to Calendar**

Same color substitution pattern as Task 6 Step 2. Additionally:

Calendar grid cell (today): replace current today highlight with:
```jsx
style={{
  background: 'var(--panel-2)',
  border: '1px solid var(--accent)',
  borderRadius: 6,
}}
```

Event dots: replace existing color classes with inline styles using `--warn` (high importance) and `--up` (dividend/medium).

Previous/next month day numbers: `opacity: 0.35`.

Card head prev/next buttons: use `.btn .btn-ghost` className.

"Dziś" button: `className="btn"`.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:5173/calendar`. Expected: dark grid, today cell with green border, event dots colored correctly.

- [ ] **Step 4: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/Calendar.jsx && git commit -m "feat(calendar): apply design tokens and accent today cell"
```

---

## Task 8: History Page

**Files:**
- Modify: `src/pages/History.jsx`

- [ ] **Step 1: Read current file**

```bash
wc -l /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/History.jsx
```

- [ ] **Step 2: Apply design tokens to History**

Same color substitution as Task 6 Step 2. Additionally:

KPI grid: wrap in `<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>` with `kpi-card` divs.

Timeframe toggle: replace with `<SegmentedControl options={['1M','3M','6M','1R','MAX']} ... />`.

Benchmark toggle: replace with `<SegmentedControl options={['Brak','S&P500','WIG20','MSCI']} ... />`.

Chart options (Chart.js): update color configuration:
```js
const chartColors = {
  line: 'var(--up)',         // getComputedStyle trick not needed — pass as CSS var string
  fill: 'rgba(0,217,126,0.08)',
  grid: 'rgba(32,37,45,0.8)',
  text: '#5a626c',
};
```
Pass these to Chart.js dataset `borderColor`, `backgroundColor`, `pointBackgroundColor`, and `scales.*.grid.color`, `scales.*.ticks.color`.

Snapshots table: apply `.data-table` class.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:5173/history`. Expected: 4 KPI cards, chart with green line on dark background, segmented timeframe control.

- [ ] **Step 4: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/History.jsx && git commit -m "feat(history): KPI grid, dark chart colors, segmented controls"
```

---

## Task 9: Scenario Lab Page

**Files:**
- Modify: `src/pages/ScenarioLab.jsx`

- [ ] **Step 1: Read current file**

```bash
wc -l /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/ScenarioLab.jsx
```

- [ ] **Step 2: Apply design tokens**

Same color substitution as Task 6 Step 2. Additionally:

Outer layout: `display: grid; grid-template-columns: 380px 1fr; gap: 16px; align-items: start`.

Input card selects/inputs: use `.field-input` class and `.field-label` for labels.

Payoff chart SVG (if inline SVG): update stroke colors to `var(--accent)` (option line) and `var(--info)` (stock baseline).

KPI grid: 4+4 layout using `kpi-card` with small values.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:5173/scenario`. Expected: two-column layout, dark inputs, payoff chart with green option line.

- [ ] **Step 4: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/ScenarioLab.jsx && git commit -m "feat(scenario): two-column layout with design tokens"
```

---

## Task 10: Analysis Page

**Files:**
- Modify: `src/pages/Analysis.jsx`

- [ ] **Step 1: Read current file**

```bash
wc -l /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/Analysis.jsx
```

- [ ] **Step 2: Apply design tokens to Analysis**

Same substitution as Task 6. Additionally:

Risk KPI section: wrap metrics in a card with 5-column grid:
```jsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
  {riskMetrics.map(m => (
    <div key={m.label} className="kpi-card">
      <div className="kpi-label">{m.label}</div>
      <div className="kpi-value" style={{ fontSize: 22, color: m.color }}>{m.value}</div>
      {m.sub && <div className="kpi-sub">{m.sub}</div>}
    </div>
  ))}
</div>
```

Rebalancing progress bars: replace color classes with:
```jsx
<div style={{ height: 16, borderRadius: 4, background: 'var(--panel-2)', position: 'relative', overflow: 'hidden' }}>
  <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, var(--info), #a78bfa)', borderRadius: 4 }} />
  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${targetPct}%`, width: 2, background: 'var(--accent)' }} />
</div>
```

KPI Tinted (4 cols): use `kpi-card` with `background: var(--up-soft)` / `var(--down-soft)` / `rgba(124,158,255,0.08)`.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:5173/analysis`. Expected: 5-column risk KPI row, gradient progress bars with target markers, tinted KPI bottom row.

- [ ] **Step 4: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/Analysis.jsx && git commit -m "feat(analysis): risk KPI grid, gradient rebalancing bars"
```

---

## Task 11: Portfolio Page

**Files:**
- Modify: `src/pages/Portfolio.jsx`

- [ ] **Step 1: Read current file**

```bash
wc -l /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/Portfolio.jsx
head -80 /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/Portfolio.jsx
```

- [ ] **Step 2: Apply design tokens to Portfolio**

Same substitution pattern. Additionally:

Holdings table: apply `.data-table`. Add `<TickerLogo symbol={pos.symbol} />` to the Aktywo column. Add `<Chip value={pos.dayChangePct} />` to Dzień column. Add `<Sparkline data={pos.history30d ?? []} width={80} height={28} />` to 30D column.

Portfolio chart (Chart.js): same color update as Task 8 Step 2.

Segment filter (Wszystkie/PL/US): replace with `<SegmentedControl>`.

VIEW toggle (Linia/Świece/Heatmap): replace with `<SegmentedControl>`.

Snapshot row: use `kpi-card` style with `display: flex; justify-content: space-between`.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:5173/portfolio`. Expected: full holdings table with TickerLogo, Chip deltas, sparklines; chart with dark colors; segmented controls.

- [ ] **Step 4: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/Portfolio.jsx && git commit -m "feat(portfolio): TickerLogo, Chip, Sparkline in holdings table"
```

---

## Task 12: Dashboard Page

**Files:**
- Modify: `src/pages/Dashboard.jsx`

- [ ] **Step 1: Read current Dashboard.jsx**

```bash
wc -l /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/Dashboard.jsx
head -60 /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src/pages/Dashboard.jsx
```

- [ ] **Step 2: Apply design tokens to Dashboard**

Same substitution. Additionally:

Page header: add greeting + session line:
```jsx
<div className="page-header">
  <div>
    <h1 className="page-title">Witaj z powrotem, {displayName}</h1>
    <p className="page-sub">{dateStr} · {openMarketsStr}</p>
  </div>
  <div style={{ display: 'flex', gap: 8 }}>
    <button className="btn btn-ghost" style={{ fontSize: 12 }}>Eksport CSV</button>
    <button className="btn btn-ghost" style={{ fontSize: 12 }}>Filtry</button>
  </div>
</div>
```

KPI grid (4 cols):
```jsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 16 }}>
  <div className="kpi-card">
    <div className="kpi-label">Wartość portfela</div>
    <div className="kpi-value privacy-blur">{fmtPLN(totalValue)}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Chip value={dayChangePct} />
      <span className="kpi-sub">Dzień: {fmtPLN(dayChange)}</span>
    </div>
  </div>
  {/* Zysk/strata, Dywidendy YTD, Wolne środki — same pattern */}
</div>
```

Chart + Top movers: `display: grid; grid-template-columns: 1fr 380px; gap: 14px`.

Chart card: portfolio AreaChart in Card with timeframe SegmentedControl.

Top movers card: list of top 5 items, each `display: flex; gap: 10; align-items: center` with TickerLogo, name, Sparkline 70×26, price + Chip.

Allocation + Best/Worst: `display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px`.

Chart colors: same as Task 8 Step 2.

- [ ] **Step 3: Verify in browser**

Navigate to `http://localhost:5173/` (Dashboard).  
Expected: greeting header, 4 KPI cards, chart left/movers right, allocation+best+worst bottom.  
Check: all numbers use JetBrains Mono, chips green/red, no Tailwind slate colors.

- [ ] **Step 4: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add frontend-react/src/pages/Dashboard.jsx && git commit -m "feat(dashboard): page header, 4-col KPI, movers grid, allocation"
```

---

## Task 13: Theme Persistence Cleanup

**Files:**
- Modify: `src/components/layout/Header.jsx` (already done in Task 2 — verify no double-apply)

- [ ] **Step 1: Verify theme toggle works end-to-end**

In browser:
1. Click sun/moon icon in topbar → page should switch to light theme (`[data-theme="light"]` on `<html>`)
2. Reload page → theme persists from `localStorage('myfund_theme')`
3. All CSS variables resolve correctly in both themes

Check: no old `html.light .bg-slate-*` overrides remain in `index.css` (they were removed in Task 0).

- [ ] **Step 2: Verify `data-theme` attribute, not class**

Open DevTools → inspect `<html>` element → should see `data-theme="dark"` or `data-theme="light"`, NOT `class="light"`.

If old theme code still applies class (e.g., from `LoginForm.jsx` or other files):

```bash
grep -r "classList.*light\|html.light\|applyTheme\|THEME_KEY" /Users/adamgorski/Desktop/ClaudeCode/frontend-react/src --include="*.jsx" --include="*.js" -l
```

Remove any remaining `applyTheme` calls that use classList instead of `setAttribute('data-theme', ...)`.

- [ ] **Step 3: Commit if changes needed**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add -p && git commit -m "fix(theme): consolidate to data-theme attribute, remove classList remnants"
```

---

## Self-Review

**Spec coverage check:**
- ✅ CSS tokens (Task 0)
- ✅ App shell: Sidebar, Topbar, Layout (Task 2)
- ✅ Shared: Card, Chip, Seg, TickerLogo, Sparkline (Task 1)
- ✅ Settings, Watchlist, Transactions (Tasks 3–5) — full rewrites
- ✅ Dividends, Calendar, History, Scenario, Analysis (Tasks 6–10) — token substitution
- ✅ Portfolio, Dashboard (Tasks 11–12)
- ✅ Theme persistence (Task 13)
- ⚠️ Stock Detail (`/stock/:symbol`) — not in the plan because it was not listed as an existing route in `navItems.js`. If `src/pages/` contains a stock detail page, apply the same token substitution pattern as Tasks 6–10.

**Placeholder scan:** Tasks 6–10 use a "substitution" approach rather than full rewrites. This is intentional — those pages have complex domain logic intertwined with JSX and a full rewrite risks breaking behavior. The substitution steps are specific enough (exact class name mappings given) to execute without ambiguity.

**Type consistency:** `TickerLogo` accepts `symbol` prop (string). `Chip` accepts `value` prop (number). `SegmentedControl` accepts `options` (string[] or {value,label}[]), `value` (string), `onChange` (fn). `Card` accepts `title` (string|node), `actions` (node), `children`. All usages across tasks match these signatures.
