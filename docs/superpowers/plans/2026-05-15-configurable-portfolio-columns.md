# Configurable Portfolio Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 13 configurable columns (Ilość, Śr. Zakup, Cena Teraz, Zmiana Dz., Wart. Zakupu, Wart. Teraz, Zysk/Strata, Okres, MOIC, IRR r., P/E, P/E FWD, P/B) to the Portfolio and Dashboard tabs, with a gear-icon picker to toggle visibility and reorder left/right.

**Architecture:** A `portfolioColumns.js` utility stores column definitions + localStorage persistence. A `usePortfolioMetrics` hook fetches Finnhub quotes and basic financials per symbol (5-min cache), then enriches each position with computed fields (costPLN, valuePLN, plPLN, period, moic, XIRR). A `ColumnPicker` component renders a dropdown with checkboxes + ←/→ arrows. Both `Portfolio.jsx` and `Dashboard.jsx` consume these shared utilities.

**Tech Stack:** React 18, Finnhub REST API (token already in project), Tailwind CSS dark theme, localStorage for column config + metrics cache.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend-react/src/utils/portfolioColumns.js` | **Create** | Column definitions, default list, localStorage load/save |
| `frontend-react/src/hooks/usePortfolioMetrics.js` | **Create** | Finnhub fetch (quote + basic financials), XIRR calc, enrich positions |
| `frontend-react/src/components/shared/ColumnPicker.jsx` | **Create** | Gear icon dropdown: checkboxes + ←/→ reorder, calls onChange |
| `frontend-react/src/pages/Portfolio.jsx` | **Modify** | Use dynamic columns, usePortfolioMetrics, ColumnPicker |
| `frontend-react/src/pages/Dashboard.jsx` | **Modify** | Use dynamic columns in top-positions table, shared column config |

---

## Task 1: Column config utility

**Files:**
- Create: `frontend-react/src/utils/portfolioColumns.js`

- [ ] **Step 1: Create the file**

```js
// frontend-react/src/utils/portfolioColumns.js

export const COLUMN_DEFS = [
  { key: 'qty',      label: 'Ilość',         fixed: true },
  { key: 'avgPrice', label: 'Śr. Zakup' },
  { key: 'price',    label: 'Cena Teraz' },
  { key: 'dailyChg', label: 'Zmiana Dz.' },
  { key: 'costPLN',  label: 'Wart. Zakupu' },
  { key: 'valuePLN', label: 'Wart. Teraz' },
  { key: 'plPLN',    label: 'Zysk/Strata' },
  { key: 'period',   label: 'Okres' },
  { key: 'moic',     label: 'MOIC' },
  { key: 'irr',      label: 'IRR r.' },
  { key: 'pe',       label: 'P/E' },
  { key: 'peFwd',    label: 'P/E FWD' },
  { key: 'pb',       label: 'P/B' },
];

export const DEFAULT_COLS = [
  'qty', 'avgPrice', 'price', 'dailyChg', 'costPLN', 'valuePLN', 'plPLN', 'period', 'moic',
];

const LS_KEY = 'portfolio_col_config';

export function loadColumnConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch {}
  return DEFAULT_COLS;
}

export function saveColumnConfig(cols) {
  localStorage.setItem(LS_KEY, JSON.stringify(cols));
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...`

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/utils/portfolioColumns.js
git commit -m "feat(portfolio): column config utility — definitions, defaults, localStorage"
```

---

## Task 2: usePortfolioMetrics hook

**Files:**
- Create: `frontend-react/src/hooks/usePortfolioMetrics.js`

This hook:
1. Takes `portfolio`, `transactions`, `fxRates` from `useApp()`
2. Fetches Finnhub `/quote` and `/stock/metric` for each symbol in parallel
3. Caches results in localStorage for 5 minutes
4. Returns `enrichPosition(pos)` function that computes all derived fields

The XIRR algorithm uses Newton-Raphson to find the annualised rate r where NPV of all cash flows = 0. Cash flows are: each BUY transaction (negative), each SELL (positive), and the current position value as a terminal positive flow at today.

- [ ] **Step 1: Create the file**

```js
// frontend-react/src/hooks/usePortfolioMetrics.js
import { useState, useEffect } from 'react';

const FINNHUB_TOKEN = 'd7uhj69r01qnv95nm3e0d7uhj69r01qnv95nm3eg';
const CACHE_KEY = 'portfolio_metrics_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// ── XIRR ────────────────────────────────────────────────────────────────────
// cashFlows: [{ date: 'YYYY-MM-DD', amount: number }]
// Returns annualised rate as decimal (e.g. 0.12 = 12%), or null if can't converge
function calcXIRR(cashFlows) {
  if (!cashFlows || cashFlows.length < 2) return null;
  const sorted = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date).getTime();

  function npv(r) {
    return sorted.reduce((sum, cf) => {
      const t = (new Date(cf.date).getTime() - t0) / (365.25 * 86400 * 1000);
      return sum + cf.amount / Math.pow(1 + r, t);
    }, 0);
  }

  let r = 0.1;
  for (let i = 0; i < 300; i++) {
    const f = npv(r);
    const df = (npv(r + 0.0001) - f) / 0.0001;
    if (Math.abs(df) < 1e-10) break;
    const next = r - f / df;
    if (Math.abs(next - r) < 1e-8) { r = next; break; }
    r = Math.max(-0.99, next);
  }
  return isFinite(r) && r > -0.99 ? r * 100 : null;
}

// ── Period formatter ─────────────────────────────────────────────────────────
export function fmtPeriod(days) {
  if (days == null) return '—';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30.4)}mo`;
  return `${(days / 365).toFixed(1)}yr`;
}

// ── Finnhub fetch ────────────────────────────────────────────────────────────
async function fetchAllMetrics(symbols) {
  const results = {};
  await Promise.allSettled(
    symbols.map(async (sym) => {
      try {
        const [qRes, mRes] = await Promise.allSettled([
          fetch(
            `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${FINNHUB_TOKEN}`,
            { signal: AbortSignal.timeout(8000) }
          ).then(r => r.json()),
          fetch(
            `https://finnhub.io/api/v1/stock/metric?symbol=${sym}&metric=all&token=${FINNHUB_TOKEN}`,
            { signal: AbortSignal.timeout(8000) }
          ).then(r => r.json()),
        ]);
        const q = qRes.status === 'fulfilled' ? qRes.value : null;
        const m = mRes.status === 'fulfilled' ? mRes.value?.metric : null;
        results[sym] = {
          price:    q?.c  ?? null,
          dailyChg: q?.dp ?? null,
          pe:       m?.peBasicExclExtraTTM ?? null,
          peFwd:    m?.peForwardDiluted    ?? null,
          pb:       m?.pbAnnual            ?? null,
        };
      } catch {
        results[sym] = { price: null, dailyChg: null, pe: null, peFwd: null, pb: null };
      }
    })
  );
  return results;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePortfolioMetrics(portfolio, transactions, fxRates) {
  const [marketData, setMarketData] = useState({});
  const [metricsLoading, setMetricsLoading] = useState(false);

  const symbolsKey = portfolio.map(p => p.symbol).sort().join(',');

  useEffect(() => {
    if (!portfolio.length) return;

    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached?.ts && Date.now() - cached.ts < CACHE_TTL) {
        setMarketData(cached.data);
        return;
      }
    } catch {}

    const symbols = [...new Set(portfolio.map(p => p.symbol))];
    setMetricsLoading(true);
    fetchAllMetrics(symbols)
      .then(data => {
        setMarketData(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
      })
      .finally(() => setMetricsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  function enrichPosition(pos) {
    const fx = fxRates[pos.currency] ?? 1;
    const m  = marketData[pos.symbol] ?? {};

    const currentPrice = m.price ?? null;
    const costPLN  = pos.qty * pos.avgPrice * fx;
    const valuePLN = currentPrice != null ? pos.qty * currentPrice * fx : null;
    const plPLN    = valuePLN != null ? valuePLN - costPLN : null;
    const moic     = currentPrice != null && pos.avgPrice > 0 ? currentPrice / pos.avgPrice : null;

    // Period: days since earliest BUY transaction (or holding date as fallback)
    const txs = transactions.filter(
      t => t.symbol === pos.symbol && (t.type === 'BUY' || t.type === 'SELL')
    );
    const firstDate = txs.length > 0
      ? txs.map(t => t.date).sort()[0]
      : pos.date;
    const periodDays = firstDate
      ? Math.max(0, Math.round((Date.now() - new Date(firstDate).getTime()) / 86400000))
      : null;

    // IRR via XIRR
    let irr = null;
    if (txs.length > 0 && currentPrice != null) {
      const flows = txs.map(t => ({
        date:   t.date,
        amount: t.type === 'BUY'
          ? -(t.qty * t.price * (fxRates[t.currency] ?? 1))
          : +(t.qty * t.price * (fxRates[t.currency] ?? 1)),
      }));
      flows.push({
        date:   new Date().toISOString().slice(0, 10),
        amount: +(pos.qty * currentPrice * fx),
      });
      irr = calcXIRR(flows);
    }

    return {
      ...pos,
      price:       m.price       ?? null,
      dailyChg:    m.dailyChg    ?? null,
      pe:          m.pe          ?? null,
      peFwd:       m.peFwd       ?? null,
      pb:          m.pb          ?? null,
      costPLN,
      valuePLN,
      plPLN,
      moic,
      periodDays,
      irr,
    };
  }

  return { enrichPosition, metricsLoading };
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...`

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/hooks/usePortfolioMetrics.js
git commit -m "feat(portfolio): usePortfolioMetrics — Finnhub quotes/metrics, XIRR, position enrichment"
```

---

## Task 3: ColumnPicker component

**Files:**
- Create: `frontend-react/src/components/shared/ColumnPicker.jsx`

The picker renders a gear button. On click, it opens an overlay panel with:
- A checkbox per column (fixed columns have disabled checkboxes)
- ←/→ arrow buttons on visible columns to reorder them
- Click-outside closes the panel
- All state lives in the parent (`cols` prop + `onChange` callback)

- [ ] **Step 1: Create the file**

```jsx
// frontend-react/src/components/shared/ColumnPicker.jsx
import React, { useState, useRef, useEffect } from 'react';
import { COLUMN_DEFS } from '../../utils/portfolioColumns';

export default function ColumnPicker({ cols, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle(key) {
    const def = COLUMN_DEFS.find(c => c.key === key);
    if (def?.fixed) return;
    if (cols.includes(key)) {
      onChange(cols.filter(c => c !== key));
    } else {
      // append after last visible column
      onChange([...cols, key]);
    }
  }

  function move(key, dir) { // dir: -1 = left, +1 = right
    const idx = cols.indexOf(key);
    if (idx === -1) return;
    const next = idx + dir;
    if (next < 0 || next >= cols.length) return;
    const arr = [...cols];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    onChange(arr);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors text-base"
        title="Konfiguruj kolumny"
      >
        ⚙️
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-60 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">
            Widoczne kolumny
          </div>
          <div className="space-y-0.5">
            {COLUMN_DEFS.map(({ key, label, fixed }) => {
              const visible = cols.includes(key);
              const idx = cols.indexOf(key);
              return (
                <div key={key} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-slate-700/50">
                  <input
                    type="checkbox"
                    checked={visible}
                    disabled={!!fixed}
                    onChange={() => toggle(key)}
                    className="w-3.5 h-3.5 accent-indigo-500 cursor-pointer disabled:cursor-default"
                  />
                  <span className={`flex-1 text-sm select-none ${
                    fixed ? 'text-slate-500' : visible ? 'text-slate-200' : 'text-slate-500'
                  }`}>
                    {label}
                  </span>
                  {visible && !fixed && (
                    <div className="flex gap-0.5 shrink-0">
                      <button
                        onClick={() => move(key, -1)}
                        disabled={idx === 0}
                        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-25 rounded transition-colors text-xs"
                        title="Przesuń w lewo"
                      >←</button>
                      <button
                        onClick={() => move(key, 1)}
                        disabled={idx === cols.length - 1}
                        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-white disabled:opacity-25 rounded transition-colors text-xs"
                        title="Przesuń w prawo"
                      >→</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...`

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/components/shared/ColumnPicker.jsx
git commit -m "feat(portfolio): ColumnPicker — gear dropdown, checkbox toggle, ←/→ reorder"
```

---

## Task 4: Rewrite Portfolio.jsx with dynamic columns

**Files:**
- Modify: `frontend-react/src/pages/Portfolio.jsx`

Replace the entire file. The new version:
- Loads column config from localStorage on mount; saves when changed
- Enriches each position via `enrichPosition(pos)` from the hook
- Renders a dynamic table with only the currently active columns
- Shows a gear icon (ColumnPicker) in the header bar
- Shows a small loading spinner next to the gear while Finnhub is fetching

- [ ] **Step 1: Replace `frontend-react/src/pages/Portfolio.jsx` with this complete file**

```jsx
// frontend-react/src/pages/Portfolio.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import Spinner from '../components/shared/Spinner';
import ColumnPicker from '../components/shared/ColumnPicker';
import { usePortfolioMetrics, fmtPeriod } from '../hooks/usePortfolioMetrics';
import {
  COLUMN_DEFS, loadColumnConfig, saveColumnConfig,
} from '../utils/portfolioColumns';

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const CUR_FLAG = { PLN: '🇵🇱', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };

function renderCell(key, pos, fxRates) {
  const flag = CUR_FLAG[pos.currency] ?? pos.currency;
  switch (key) {
    case 'qty':
      return (
        <span className="text-slate-300">
          {fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}
        </span>
      );
    case 'avgPrice':
      return (
        <span className="text-slate-400">
          {fmt(pos.avgPrice)} <span className="text-xs">{flag}</span>
        </span>
      );
    case 'price':
      return pos.price != null ? (
        <span className="text-slate-300">
          {fmt(pos.price)} <span className="text-xs">{flag}</span>
        </span>
      ) : <span className="text-slate-600">—</span>;
    case 'dailyChg': {
      if (pos.dailyChg == null) return <span className="text-slate-600">—</span>;
      const up = pos.dailyChg >= 0;
      return (
        <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
          {up ? '+' : ''}{fmt(pos.dailyChg, 2)}%
        </span>
      );
    }
    case 'costPLN':
      return <span className="text-slate-200 font-semibold">{fmt(pos.costPLN)} zł</span>;
    case 'valuePLN':
      return pos.valuePLN != null
        ? <span className="text-slate-200 font-semibold">{fmt(pos.valuePLN)} zł</span>
        : <span className="text-slate-600">—</span>;
    case 'plPLN': {
      if (pos.plPLN == null) return <span className="text-slate-600">—</span>;
      const up = pos.plPLN >= 0;
      return (
        <span className={up ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
          {up ? '+' : ''}{fmt(pos.plPLN)} zł
        </span>
      );
    }
    case 'period':
      return <span className="text-slate-400">{fmtPeriod(pos.periodDays)}</span>;
    case 'moic':
      return pos.moic != null
        ? <span className="text-slate-300">{fmt(pos.moic, 2)}x</span>
        : <span className="text-slate-600">—</span>;
    case 'irr': {
      if (pos.irr == null) return <span className="text-slate-600">—</span>;
      const up = pos.irr >= 0;
      return (
        <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
          {up ? '+' : ''}{fmt(pos.irr, 1)}%
        </span>
      );
    }
    case 'pe':
      return pos.pe != null
        ? <span className="text-slate-400">{fmt(pos.pe, 1)}</span>
        : <span className="text-slate-600">—</span>;
    case 'peFwd':
      return pos.peFwd != null
        ? <span className="text-slate-400">{fmt(pos.peFwd, 1)}</span>
        : <span className="text-slate-600">—</span>;
    case 'pb':
      return pos.pb != null
        ? <span className="text-slate-400">{fmt(pos.pb, 2)}</span>
        : <span className="text-slate-600">—</span>;
    default:
      return <span className="text-slate-600">—</span>;
  }
}

const COL_LABEL = Object.fromEntries(COLUMN_DEFS.map(c => [c.key, c.label]));

export default function Portfolio() {
  const { portfolio, transactions, loading, fxRates } = useApp();
  const { openChart } = useChart();
  const [sortBy, setSortBy] = useState('cost');
  const [cols, setCols] = useState(loadColumnConfig);

  const { enrichPosition, metricsLoading } = usePortfolioMetrics(portfolio, transactions, fxRates);

  function handleColChange(newCols) {
    setCols(newCols);
    saveColumnConfig(newCols);
  }

  const enriched = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const totalCostPLN = enriched.reduce((sum, p) => sum + (p.costPLN ?? 0), 0);

  const sorted = useMemo(() => {
    return [...enriched].sort((a, b) => {
      if (sortBy === 'cost')   return (b.costPLN ?? 0) - (a.costPLN ?? 0);
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol);
      if (sortBy === 'qty')    return b.qty - a.qty;
      if (sortBy === 'pl')     return (b.plPLN ?? -Infinity) - (a.plPLN ?? -Infinity);
      return 0;
    });
  }, [enriched, sortBy]);

  if (loading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!portfolio.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <div className="text-5xl mb-3">💼</div>
        <p className="text-slate-400 font-semibold">Brak pozycji w portfelu</p>
        <p className="text-sm mt-1">Dodaj spółki w głównym portalu StocksTracker</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Łączny koszt portfela</p>
          <p className="text-2xl font-bold text-slate-100">{fmt(totalCostPLN)} zł</p>
        </div>
        <div className="text-right text-sm text-slate-400">{portfolio.length} pozycji</div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2">
          {[
            ['cost',   'Wg kosztu'],
            ['symbol', 'A–Z'],
            ['qty',    'Wg ilości'],
            ['pl',     'Wg P&L'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                sortBy === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          {metricsLoading && <Spinner size="sm" />}
          <ColumnPicker cols={cols} onChange={handleColChange} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5 sticky left-0 bg-slate-900/90">Symbol</th>
                {cols.map(key => (
                  <th key={key} className="text-right px-4 py-2.5 whitespace-nowrap">
                    {COL_LABEL[key] ?? key}
                  </th>
                ))}
                <th className="text-right px-5 py-2.5">Udział %</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(pos => {
                const share = totalCostPLN > 0 ? ((pos.costPLN ?? 0) / totalCostPLN) * 100 : 0;
                return (
                  <tr
                    key={pos.id ?? pos.symbol}
                    className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors"
                  >
                    <td
                      className="px-5 py-3 cursor-pointer sticky left-0 bg-slate-800 hover:bg-slate-700/30"
                      onClick={() => openChart(pos.symbol)}
                      title={`Otwórz wykres ${pos.symbol}`}
                    >
                      <div className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                        {pos.symbol}
                      </div>
                      {pos.name && pos.name !== pos.symbol && (
                        <div className="text-xs text-slate-500 truncate max-w-[120px]">{pos.name}</div>
                      )}
                    </td>
                    {cols.map(key => (
                      <td key={key} className="px-4 py-3 text-right whitespace-nowrap">
                        {renderCell(key, pos, fxRates)}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min(share, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-10 text-right">{fmt(share, 1)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -10
```
Expected: `✓ built in ...` with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/pages/Portfolio.jsx
git commit -m "feat(portfolio): dynamic columns — Finnhub data, MOIC, IRR, P/E, period, ColumnPicker"
```

---

## Task 5: Update Dashboard.jsx top-positions table with dynamic columns

**Files:**
- Modify: `frontend-react/src/pages/Dashboard.jsx`

The Dashboard's "Największe pozycje" table uses the same `cols` config (shared localStorage key) and the same `enrichPosition` function. It does NOT render its own ColumnPicker — the user configures columns in Portfolio and both tables reflect the same choice.

Replace only the top-positions table section. Leave KPI cards and sparkline unchanged.

- [ ] **Step 1: Add imports at the top of `frontend-react/src/pages/Dashboard.jsx`**

Current imports block:
```jsx
import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import Sparkline from '../components/shared/Sparkline';
import Spinner from '../components/shared/Spinner';
```

Replace with:
```jsx
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import Sparkline from '../components/shared/Sparkline';
import Spinner from '../components/shared/Spinner';
import { usePortfolioMetrics, fmtPeriod } from '../hooks/usePortfolioMetrics';
import { COLUMN_DEFS, loadColumnConfig } from '../utils/portfolioColumns';
```

- [ ] **Step 2: Add `fmt` helpers and `renderCell` + `toPlnRate` before `KpiCard`**

The current `Dashboard.jsx` already has a `toPlnRate` function and `fmt` function. Keep them. After the existing `fmt` function, add the `renderCell` function (same as in Portfolio.jsx):

```jsx
const CUR_FLAG_DASH = { PLN: '🇵🇱', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };
const COL_LABEL_DASH = Object.fromEntries(COLUMN_DEFS.map(c => [c.key, c.label]));

function renderCellDash(key, pos, fxRates) {
  const flag = CUR_FLAG_DASH[pos.currency] ?? pos.currency;
  switch (key) {
    case 'qty':
      return <span className="text-slate-300">{fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}</span>;
    case 'avgPrice':
      return <span className="text-slate-400">{fmt(pos.avgPrice)} <span className="text-xs">{flag}</span></span>;
    case 'price':
      return pos.price != null
        ? <span className="text-slate-300">{fmt(pos.price)} <span className="text-xs">{flag}</span></span>
        : <span className="text-slate-600">—</span>;
    case 'dailyChg': {
      if (pos.dailyChg == null) return <span className="text-slate-600">—</span>;
      const up = pos.dailyChg >= 0;
      return <span className={up ? 'text-emerald-400' : 'text-rose-400'}>{up ? '+' : ''}{fmt(pos.dailyChg, 2)}%</span>;
    }
    case 'costPLN':
      return <span className="text-slate-200 font-semibold">{fmt(pos.costPLN)} zł</span>;
    case 'valuePLN':
      return pos.valuePLN != null
        ? <span className="text-slate-200 font-semibold">{fmt(pos.valuePLN)} zł</span>
        : <span className="text-slate-600">—</span>;
    case 'plPLN': {
      if (pos.plPLN == null) return <span className="text-slate-600">—</span>;
      const up = pos.plPLN >= 0;
      return <span className={up ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>{up ? '+' : ''}{fmt(pos.plPLN)} zł</span>;
    }
    case 'period':
      return <span className="text-slate-400">{fmtPeriod(pos.periodDays)}</span>;
    case 'moic':
      return pos.moic != null ? <span className="text-slate-300">{fmt(pos.moic, 2)}x</span> : <span className="text-slate-600">—</span>;
    case 'irr': {
      if (pos.irr == null) return <span className="text-slate-600">—</span>;
      const up = pos.irr >= 0;
      return <span className={up ? 'text-emerald-400' : 'text-rose-400'}>{up ? '+' : ''}{fmt(pos.irr, 1)}%</span>;
    }
    case 'pe':
      return pos.pe != null ? <span className="text-slate-400">{fmt(pos.pe, 1)}</span> : <span className="text-slate-600">—</span>;
    case 'peFwd':
      return pos.peFwd != null ? <span className="text-slate-400">{fmt(pos.peFwd, 1)}</span> : <span className="text-slate-600">—</span>;
    case 'pb':
      return pos.pb != null ? <span className="text-slate-400">{fmt(pos.pb, 2)}</span> : <span className="text-slate-600">—</span>;
    default:
      return <span className="text-slate-600">—</span>;
  }
}
```

- [ ] **Step 3: Add hook calls inside the `Dashboard` component function, after the existing `useApp` and `useChart` lines**

Current start of Dashboard function:
```jsx
export default function Dashboard() {
  const { portfolio, transactions, snapshots, loading, fxRates } = useApp();
  const { openChart } = useChart();
```

Replace with:
```jsx
export default function Dashboard() {
  const { portfolio, transactions, snapshots, loading, fxRates } = useApp();
  const { openChart } = useChart();
  const [cols] = useState(loadColumnConfig);
  const { enrichPosition } = usePortfolioMetrics(portfolio, transactions, fxRates);
```

- [ ] **Step 4: Replace the top-positions `topPositions` useMemo and the table JSX**

Find and replace the existing `topPositions` useMemo:

Old:
```jsx
  const topPositions = useMemo(
    () => [...portfolio]
      .sort((a, b) => (b.qty * b.avgPrice * toPlnRate(b.currency, fxRates)) - (a.qty * a.avgPrice * toPlnRate(a.currency, fxRates)))
      .slice(0, 7),
    [portfolio, fxRates]
  );
```

New:
```jsx
  const topPositions = useMemo(
    () => [...portfolio]
      .sort((a, b) => (b.qty * b.avgPrice * toPlnRate(b.currency, fxRates)) - (a.qty * a.avgPrice * toPlnRate(a.currency, fxRates)))
      .slice(0, 7)
      .map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );
```

- [ ] **Step 5: Replace the top-positions table JSX**

Find the table inside the `{topPositions.length > 0 && (` block. Replace the entire `<table>` element (from `<table className="w-full text-sm">` to the closing `</table>`) with:

```jsx
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5">Symbol</th>
                {cols.map(key => (
                  <th key={key} className="text-right px-4 py-2.5 whitespace-nowrap">
                    {COL_LABEL_DASH[key] ?? key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPositions.map((pos) => (
                <tr
                  key={pos.id ?? pos.symbol}
                  className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors"
                >
                  <td
                    className="px-5 py-3 font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
                    onClick={() => openChart(pos.symbol)}
                    title={`Otwórz wykres ${pos.symbol}`}
                  >
                    {pos.symbol}
                    {pos.name && pos.name !== pos.symbol && (
                      <span className="ml-2 text-xs text-slate-500 font-normal">{pos.name}</span>
                    )}
                  </td>
                  {cols.map(key => (
                    <td key={key} className="px-4 py-3 text-right whitespace-nowrap">
                      {renderCellDash(key, pos, fxRates)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
```

- [ ] **Step 6: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -10
```
Expected: `✓ built in ...`

- [ ] **Step 7: Commit**

```bash
git add frontend-react/src/pages/Dashboard.jsx
git commit -m "feat(dashboard): dynamic columns in top-positions table — shared column config with Portfolio"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| Ilość, Śr. Zakup, Cena Teraz, Zmiana Dz. | Task 2 (Finnhub quote), Task 4 renderCell |
| Wart. Zakupu, Wart. Teraz, Zysk/Strata | Task 2 (computed from price), Task 4 renderCell |
| Okres | Task 2 (periodDays from transactions) |
| MOIC | Task 2 (price / avgPrice) |
| IRR r. | Task 2 (XIRR via Newton-Raphson) |
| P/E, P/E FWD, P/B | Task 2 (Finnhub basic financials) |
| Add/remove columns | Task 3 (ColumnPicker checkboxes) |
| Move columns left/right | Task 3 (← → arrows) |
| Portfolio tab | Task 4 |
| Dashboard tab | Task 5 |
| Persist config across sessions | Task 1 (localStorage) |

**No placeholders:** All steps contain complete code.

**Type consistency:** `enrichPosition` returns `price`, `dailyChg`, `pe`, `peFwd`, `pb`, `costPLN`, `valuePLN`, `plPLN`, `moic`, `periodDays`, `irr` — same keys used in `renderCell` and `renderCellDash` throughout.
