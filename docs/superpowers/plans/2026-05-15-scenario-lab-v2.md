# Scenario Lab v2 — Spreads + Probability + React Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Scenario Lab to the React app and expand both React and myfund.html with multi-leg spread strategies, probability cone, Buying Power Effect, MOIC, and 2-sigma X-axis centering.

**Architecture:** A shared math utility `scenarioLab.js` contains all BS/payoff/Greek/probability logic; `ScenarioLab.jsx` is a self-contained React page using Chart.js 4 directly via canvas ref (same approach as myfund.html); `myfund.html` is updated separately with new HTML inputs and JS.

**Tech Stack:** React 18, Chart.js 4 (npm), chartjs-plugin-annotation 3 (npm + CDN for myfund.html), Tailwind CSS, vanilla JS (myfund.html).

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend-react/src/utils/scenarioLab.js` | **Create** | All math: normCDF, BS, payoff, Greeks, PoP, BPE, MOIC, sigma |
| `frontend-react/src/pages/ScenarioLab.jsx` | **Create** | React page: form + Chart.js canvas + KPI cards + Greeks panel |
| `frontend-react/src/App.jsx` | **Modify** | Add `/scenario` route |
| `frontend-react/src/components/layout/navItems.js` | **Modify** | Add `🧪 Lab` nav item |
| `myfund.html` | **Modify** | New `<select>` options, `sl-wing-wrap` div, annotation CDN, updated `renderScenarioLab` |

---

## Task 1: Math utility module

**Files:**
- Create: `frontend-react/src/utils/scenarioLab.js`

- [ ] **Step 1: Create the file with all math exports**

```js
// frontend-react/src/utils/scenarioLab.js

export const CONTRACT_SIZE = 100;
const R = 0.05; // risk-free rate

// ── Black-Scholes helpers ────────────────────────────────────────────────────

export function normCDF(x) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y = 1 - (t*(a1+t*(a2+t*(a3+t*(a4+t*a5))))) * Math.exp(-ax*ax);
  return 0.5 * (1 + sign * y);
}

export function normPDF(x) {
  return Math.exp(-0.5*x*x) / Math.sqrt(2*Math.PI);
}

export function bsPrice(S, K, T, r, sigma, type) {
  if (T <= 0) return type === 'call' ? Math.max(0, S-K) : Math.max(0, K-S);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + (r + 0.5*sigma*sigma)*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  if (type === 'call') return S*normCDF(d1) - K*Math.exp(-r*T)*normCDF(d2);
  return K*Math.exp(-r*T)*normCDF(-d2) - S*normCDF(-d1);
}

export function bsDelta(S, K, T, r, sigma, type) {
  if (T <= 0) return type==='call' ? (S>K?1:0) : (S<K?-1:0);
  const d1 = (Math.log(S/K) + (r+0.5*sigma*sigma)*T) / (sigma*Math.sqrt(T));
  return type === 'call' ? normCDF(d1) : normCDF(d1) - 1;
}

export function bsTheta(S, K, T, r, sigma, type) {
  if (T <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + (r+0.5*sigma*sigma)*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  const base = -(S * normPDF(d1) * sigma) / (2*sqrtT);
  if (type === 'call') return (base - r*K*Math.exp(-r*T)*normCDF(d2)) / 365;
  return (base + r*K*Math.exp(-r*T)*normCDF(-d2)) / 365;
}

// ── Probability ──────────────────────────────────────────────────────────────

// P(S_T > target) using log-normal model (no drift)
function probAbove(S, target, iv, T) {
  if (T <= 0 || iv <= 0 || target <= 0) return target <= S ? 1 : 0;
  return 1 - normCDF(Math.log(target/S) / (iv * Math.sqrt(T)));
}

// ── Sigma bounds ─────────────────────────────────────────────────────────────

export function calcSigma(entry, iv, dte) {
  return entry * iv * Math.sqrt(dte / 365);
}

// Price array centered on entry ± 2 sigma
export function makePrices(entry, iv, dte, steps = 60) {
  const sigma = calcSigma(entry, iv, dte);
  const lo = Math.max(0.01, entry - 2*sigma);
  const hi = entry + 2*sigma;
  return Array.from({length: steps+1}, (_, i) => lo + (hi-lo)*i/steps);
}

// ── Payoff ───────────────────────────────────────────────────────────────────

export function calcPayoff(strategy, prices, params) {
  const { entry, qty, strike, strike2 = strike + 5, premium, T, iv, wing = 5 } = params;
  const C = CONTRACT_SIZE;
  const nC = qty / C;
  const r = R;

  const expiry = prices.map(p => {
    switch (strategy) {
      case 'long-call':        return (Math.max(0, p-strike) - premium) * C * qty;
      case 'long-put':         return (Math.max(0, strike-p) - premium) * C * qty;
      case 'covered-call':     return (p-entry)*qty + (Math.min(0, strike-p) + premium)*C*nC;
      case 'protective-put':   return (p-entry)*qty + (Math.max(0, strike-p) - premium)*C*nC;
      case 'csp':              return (Math.min(0, p-strike) + premium) * C;
      case 'bull-call-spread': return (Math.max(0,p-strike) - Math.max(0,p-strike2) - premium) * C * qty;
      case 'bear-put-spread':  return (Math.max(0,strike-p) - Math.max(0,strike2-p) - premium) * C * qty;
      case 'iron-condor': {
        const K1b = strike - wing, K2b = strike2 + wing;
        return (Math.max(0,K1b-p) - Math.max(0,strike-p) - Math.max(0,p-strike2) + Math.max(0,p-K2b) + premium) * C;
      }
      default: return 0;
    }
  });

  const t0 = prices.map(p => {
    const r2 = r;
    switch (strategy) {
      case 'long-call':
        return (bsPrice(p, strike, T, r2, iv, 'call') - premium) * C * qty;
      case 'long-put':
        return (bsPrice(p, strike, T, r2, iv, 'put') - premium) * C * qty;
      case 'covered-call':
        return (p-entry)*qty + (premium - bsPrice(p, strike, T, r2, iv, 'call'))*C*nC;
      case 'protective-put':
        return (p-entry)*qty + (bsPrice(p, strike, T, r2, iv, 'put') - premium)*C*nC;
      case 'csp':
        return (premium - bsPrice(p, strike, T, r2, iv, 'put')) * C;
      case 'bull-call-spread':
        return (bsPrice(p,strike,T,r2,iv,'call') - bsPrice(p,strike2,T,r2,iv,'call') - premium) * C * qty;
      case 'bear-put-spread':
        return (bsPrice(p,strike,T,r2,iv,'put') - bsPrice(p,strike2,T,r2,iv,'put') - premium) * C * qty;
      case 'iron-condor': {
        const K1b = strike - wing, K2b = strike2 + wing;
        return (bsPrice(p,K1b,T,r2,iv,'put') - bsPrice(p,strike,T,r2,iv,'put')
               - bsPrice(p,strike2,T,r2,iv,'call') + bsPrice(p,K2b,T,r2,iv,'call') + premium) * C;
      }
      default: return 0;
    }
  });

  const stock = prices.map(p => (p - entry) * qty);
  return { expiry, t0, stock };
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export function calcKPIs(strategy, params) {
  const { entry, qty, strike, strike2 = strike + 5, premium, T, iv, wing = 5 } = params;
  const C = CONTRACT_SIZE;
  const nC = qty / C;

  switch (strategy) {
    case 'long-call': {
      const be = strike + premium;
      const cost = premium * C * qty;
      return {
        breakevens: [be],
        maxProfit: Infinity,
        maxLoss: -cost,
        bpe: cost,
        moic: null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'long-put': {
      const be = strike - premium;
      const cost = premium * C * qty;
      return {
        breakevens: [be],
        maxProfit: (strike - premium) * C * qty,
        maxLoss: -cost,
        bpe: cost,
        moic: null,
        pop: 1 - probAbove(entry, be, iv, T),
      };
    }
    case 'covered-call': {
      const be = entry - premium;
      const maxProfit = (strike - entry + premium) * qty;
      const bpe = (entry - premium) * qty;
      return {
        breakevens: [be],
        maxProfit,
        maxLoss: -entry * qty, // stock goes to 0
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'protective-put': {
      const be = entry + premium;
      const maxLoss = -(entry - strike + premium) * qty;
      const bpe = (entry + premium) * qty;
      return {
        breakevens: [be],
        maxProfit: Infinity,
        maxLoss,
        bpe,
        moic: null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'csp': {
      const be = strike - premium;
      const maxProfit = premium * C;
      const maxLoss = -(strike - premium) * C;
      const bpe = strike * C;
      return {
        breakevens: [be],
        maxProfit,
        maxLoss,
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'bull-call-spread': {
      const be = strike + premium;
      const maxProfit = (strike2 - strike - premium) * C * qty;
      const maxLoss = -premium * C * qty;
      const bpe = premium * C * qty;
      return {
        breakevens: [be],
        maxProfit,
        maxLoss,
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: probAbove(entry, be, iv, T),
      };
    }
    case 'bear-put-spread': {
      // strike = long put (higher), strike2 = short put (lower)
      const be = strike - premium;
      const maxProfit = (strike - strike2 - premium) * C * qty;
      const maxLoss = -premium * C * qty;
      const bpe = premium * C * qty;
      return {
        breakevens: [be],
        maxProfit,
        maxLoss,
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: 1 - probAbove(entry, be, iv, T),
      };
    }
    case 'iron-condor': {
      const beLo = strike - premium;
      const beHi = strike2 + premium;
      const maxProfit = premium * C;
      const maxLoss = -(wing - premium) * C;
      const bpe = (wing - premium) * C;
      const popHi = probAbove(entry, beHi, iv, T);
      const popLo = probAbove(entry, beLo, iv, T);
      return {
        breakevens: [beLo, beHi],
        maxProfit,
        maxLoss,
        bpe,
        moic: bpe > 0 ? maxProfit / bpe : null,
        pop: popLo - popHi,
      };
    }
    default:
      return { breakevens: [], maxProfit: 0, maxLoss: 0, bpe: 0, moic: null, pop: 0 };
  }
}

// ── Greeks ───────────────────────────────────────────────────────────────────

export function calcGreeks(strategy, params) {
  const { entry, strike, strike2 = strike + 5, T, iv, wing = 5 } = params;
  const r = R;

  function d(S, K, type) { return bsDelta(S, K, T, r, iv, type); }
  function th(S, K, type) { return bsTheta(S, K, T, r, iv, type); }

  switch (strategy) {
    case 'long-call':
      return { posDelta: d(entry,strike,'call'), posTheta: th(entry,strike,'call') };
    case 'long-put':
      return { posDelta: d(entry,strike,'put'), posTheta: th(entry,strike,'put') };
    case 'covered-call':
      return { posDelta: 1 - d(entry,strike,'call'), posTheta: -th(entry,strike,'call') };
    case 'protective-put':
      return { posDelta: 1 + d(entry,strike,'put'), posTheta: th(entry,strike,'put') };
    case 'csp':
      return { posDelta: -d(entry,strike,'put'), posTheta: -th(entry,strike,'put') };
    case 'bull-call-spread':
      return {
        posDelta: d(entry,strike,'call') - d(entry,strike2,'call'),
        posTheta: th(entry,strike,'call') - th(entry,strike2,'call'),
      };
    case 'bear-put-spread':
      return {
        posDelta: d(entry,strike,'put') - d(entry,strike2,'put'),
        posTheta: th(entry,strike,'put') - th(entry,strike2,'put'),
      };
    case 'iron-condor': {
      const K1b = strike - wing, K2b = strike2 + wing;
      return {
        posDelta: d(entry,K1b,'put') - d(entry,strike,'put') - d(entry,strike2,'call') + d(entry,K2b,'call'),
        posTheta: th(entry,K1b,'put') - th(entry,strike,'put') - th(entry,strike2,'call') + th(entry,K2b,'call'),
      };
    }
    default:
      return { posDelta: 0, posTheta: 0 };
  }
}
```

- [ ] **Step 2: Verify syntax by running build check**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -5
```
Expected: build succeeds (or fails only on missing imports, not syntax errors in this file).

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/utils/scenarioLab.js
git commit -m "feat(scenario-lab): math utility module — BS, payoffs, Greeks, PoP, BPE, MOIC"
```

---

## Task 2: Install Chart.js and create ScenarioLab React page

**Files:**
- Modify: `frontend-react/package.json` (via npm install)
- Create: `frontend-react/src/pages/ScenarioLab.jsx`

- [ ] **Step 1: Install chart.js and annotation plugin**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm install chart.js chartjs-plugin-annotation
```
Expected: `chart.js` and `chartjs-plugin-annotation` appear in `package.json` dependencies.

- [ ] **Step 2: Create ScenarioLab.jsx**

```jsx
// frontend-react/src/pages/ScenarioLab.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import Annotation from 'chartjs-plugin-annotation';
import {
  CONTRACT_SIZE, calcSigma, makePrices, calcPayoff, calcKPIs, calcGreeks,
} from '../utils/scenarioLab';

Chart.register(...registerables, Annotation);

const STRATEGIES = [
  { value: 'long-call',        label: 'Long Call' },
  { value: 'long-put',         label: 'Long Put' },
  { value: 'covered-call',     label: 'Covered Call' },
  { value: 'protective-put',   label: 'Protective Put' },
  { value: 'csp',              label: 'Cash-Secured Put' },
  { value: 'bull-call-spread', label: 'Bull Call Spread' },
  { value: 'bear-put-spread',  label: 'Bear Put Spread' },
  { value: 'iron-condor',      label: 'Iron Condor' },
];

const SPREAD_STRATEGIES = new Set(['bull-call-spread','bear-put-spread','iron-condor']);
const WING_STRATEGIES   = new Set(['iron-condor']);
const HEDGED_STRATEGIES = new Set(['covered-call','protective-put']);

const STRIKE_LABELS = {
  'long-call':        'STRIKE CALL ($)',
  'long-put':         'STRIKE PUT ($)',
  'covered-call':     'STRIKE CALL ($)',
  'protective-put':   'STRIKE PUT ($)',
  'csp':              'STRIKE PUT ($)',
  'bull-call-spread': 'LONG CALL STRIKE ($)',
  'bear-put-spread':  'LONG PUT STRIKE ($)',
  'iron-condor':      'SHORT PUT STRIKE ($)',
};

const STRIKE2_LABELS = {
  'bull-call-spread': 'SHORT CALL STRIKE ($)',
  'bear-put-spread':  'SHORT PUT STRIKE ($)',
  'iron-condor':      'SHORT CALL STRIKE ($)',
};

const PREMIUM_LABELS = {
  'bull-call-spread': 'NET DEBIT ($)',
  'bear-put-spread':  'NET DEBIT ($)',
  'iron-condor':      'NET CREDIT ($)',
};

function fmtDollar(n, forceSign = false) {
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (forceSign) return (n >= 0 ? '+$' : '-$') + s;
  return (n < 0 ? '-$' : '$') + s;
}

function StatCard({ label, value, color }) {
  const colorMap = {
    blue:   'text-blue-400',
    green:  'text-emerald-400',
    red:    'text-rose-400',
    yellow: 'text-amber-400',
    muted:  'text-slate-400',
  };
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
      <div className="text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-bold ${colorMap[color] || 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

function InputField({ label, id, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-slate-400 font-semibold uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls = "bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-slate-100 text-sm w-full outline-none focus:border-indigo-500";

export default function ScenarioLab() {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const [strategy, setStrategy] = useState('long-call');
  const [entry,    setEntry]    = useState(100);
  const [qty,      setQty]      = useState(1);
  const [strike,   setStrike]   = useState(105);
  const [strike2,  setStrike2]  = useState(110);
  const [premium,  setPremium]  = useState(3.50);
  const [dte,      setDte]      = useState(30);
  const [iv,       setIv]       = useState(30);
  const [wing,     setWing]     = useState(5);
  const [hideStock, setHideStock] = useState(false);

  const isSpread = SPREAD_STRATEGIES.has(strategy);
  const isWing   = WING_STRATEGIES.has(strategy);
  const isHedged = HEDGED_STRATEGIES.has(strategy);

  const render = useCallback(() => {
    const ivDec = iv / 100;
    const T     = dte / 365;
    const sigma = calcSigma(entry, ivDec, dte);
    const prices = makePrices(entry, ivDec, dte);

    const params = { entry, qty, strike, strike2, premium, T, iv: ivDec, wing };
    const { expiry, t0, stock } = calcPayoff(strategy, prices, params);
    const kpis = calcKPIs(strategy, params);
    const greeks = calcGreeks(strategy, params);

    // Annotation: vertical lines at ±1σ
    const findIdx = (target) => prices.reduce((best, p, i) =>
      Math.abs(p - target) < Math.abs(prices[best] - target) ? i : best, 0);
    const s1LoIdx = findIdx(entry - sigma);
    const s1HiIdx = findIdx(entry + sigma);
    const entryIdx = findIdx(entry);

    const labels = prices.map(p => '$' + p.toFixed(0));

    const datasets = [];
    if ((isHedged || isSpread) && !hideStock) {
      datasets.push({
        label: 'Tylko Akcje',
        data: stock,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,.05)',
        borderWidth: 2,
        borderDash: [5,4],
        pointRadius: 0,
        tension: 0.1,
      });
    }
    datasets.push({
      label: STRATEGIES.find(s => s.value === strategy)?.label || strategy,
      data: expiry,
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139,92,246,.08)',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.1,
    });
    datasets.push({
      label: 'Dzisiaj (T+0)',
      data: t0,
      borderColor: '#c084fc',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [4,3],
      pointRadius: 0,
      tension: 0.3,
    });

    const annotations = {
      entryLine: {
        type: 'line', xMin: entryIdx, xMax: entryIdx,
        borderColor: 'rgba(248,250,252,0.25)', borderWidth: 1, borderDash: [2,4],
        label: { content: 'Entry', display: true, color: '#94a3b8', font: { size: 10 }, position: 'start' },
      },
      sigma1Lo: {
        type: 'line', xMin: s1LoIdx, xMax: s1LoIdx,
        borderColor: 'rgba(99,102,241,0.45)', borderWidth: 1, borderDash: [4,4],
        label: { content: '-1σ', display: true, color: '#818cf8', font: { size: 10 }, position: 'start' },
      },
      sigma1Hi: {
        type: 'line', xMin: s1HiIdx, xMax: s1HiIdx,
        borderColor: 'rgba(99,102,241,0.45)', borderWidth: 1, borderDash: [4,4],
        label: { content: '+1σ', display: true, color: '#818cf8', font: { size: 10 }, position: 'start' },
      },
    };

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: { color: '#e2e8f0', font: { size: 12, weight: '600' } },
          },
          tooltip: {
            callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmtDollar(ctx.parsed.y) },
          },
          annotation: { annotations },
        },
        scales: {
          x: {
            ticks: { color: '#8892a4', maxTicksLimit: 10 },
            grid: { color: 'rgba(255,255,255,.04)' },
          },
          y: {
            ticks: { color: '#8892a4', callback: v => fmtDollar(v) },
            grid: { color: 'rgba(255,255,255,.04)' },
            title: { display: true, text: 'Zysk / Strata ($)', color: '#8892a4', font: { size: 11 } },
          },
        },
      },
    });

    return { kpis, greeks, sigma };
  }, [strategy, entry, qty, strike, strike2, premium, dte, iv, wing, hideStock, isHedged, isSpread]);

  const [display, setDisplay] = useState(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const result = render();
    setDisplay(result);
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [render]);

  const kpis = display?.kpis;
  const greeks = display?.greeks;
  const sigma = display?.sigma;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h2 className="text-lg font-bold text-slate-100">🧪 Scenario Lab — Akcje vs Opcje</h2>

      {/* Form */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left panel */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
          <InputField label="Strategia">
            <select
              value={strategy}
              onChange={e => setStrategy(e.target.value)}
              className={inputCls}
            >
              {STRATEGIES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </InputField>
          <InputField label="Cena wejścia ($)">
            <input type="number" value={entry} min="0.01" step="0.01"
              onChange={e => setEntry(parseFloat(e.target.value)||100)} className={inputCls} />
          </InputField>
          {!isSpread && (
            <InputField label="Ilość akcji / kontraktów">
              <input type="number" value={qty} min="1" step="1"
                onChange={e => setQty(parseInt(e.target.value)||1)} className={inputCls} />
            </InputField>
          )}
        </div>

        {/* Right panel */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
          <InputField label={STRIKE_LABELS[strategy] || 'Strike ($)'}>
            <input type="number" value={strike} min="0.01" step="0.01"
              onChange={e => setStrike(parseFloat(e.target.value)||100)} className={inputCls} />
          </InputField>
          {isSpread && (
            <InputField label={STRIKE2_LABELS[strategy] || 'Strike 2 ($)'}>
              <input type="number" value={strike2} min="0.01" step="0.01"
                onChange={e => setStrike2(parseFloat(e.target.value)||110)} className={inputCls} />
            </InputField>
          )}
          {isWing && (
            <InputField label="Wing Width ($)">
              <input type="number" value={wing} min="0.5" step="0.5"
                onChange={e => setWing(parseFloat(e.target.value)||5)} className={inputCls} />
            </InputField>
          )}
          <InputField label={PREMIUM_LABELS[strategy] || 'Premia ($ / opcja)'}>
            <input type="number" value={premium} min="0" step="0.01"
              onChange={e => setPremium(parseFloat(e.target.value)||0)} className={inputCls} />
          </InputField>
          <InputField label="Dni do wygaśnięcia (DTE)">
            <input type="number" value={dte} min="1" step="1"
              onChange={e => setDte(parseInt(e.target.value)||30)} className={inputCls} />
          </InputField>
          <InputField label="IV — Implied Volatility (%)">
            <input type="number" value={iv} min="1" max="500" step="1"
              onChange={e => setIv(parseFloat(e.target.value)||30)} className={inputCls} />
          </InputField>
        </div>
      </div>

      {/* Checkbox */}
      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400 select-none">
        <input type="checkbox" checked={hideStock} onChange={e => setHideStock(e.target.checked)}
          className="w-4 h-4 accent-indigo-500 cursor-pointer" />
        Ukryj linię bazową akcji
      </label>

      {/* KPI cards */}
      {kpis && (
        <div className="grid grid-cols-4 gap-3">
          {kpis.breakevens.length === 1 ? (
            <StatCard label="Break-even" value={fmtDollar(kpis.breakevens[0])} color="blue" />
          ) : (
            <>
              <StatCard label="BE dolny" value={fmtDollar(kpis.breakevens[0])} color="blue" />
              <StatCard label="BE górny" value={fmtDollar(kpis.breakevens[1])} color="blue" />
            </>
          )}
          {kpis.breakevens.length === 1 && (
            <>
              <StatCard label="Max Zysk"  value={fmtDollar(kpis.maxProfit)} color="green" />
              <StatCard label="Max Strata" value={fmtDollar(kpis.maxLoss)} color="red" />
              <StatCard label="PoP" value={(kpis.pop * 100).toFixed(1) + '%'} color="yellow" />
            </>
          )}
          {kpis.breakevens.length === 2 && (
            <>
              <StatCard label="Max Zysk"   value={fmtDollar(kpis.maxProfit)} color="green" />
              <StatCard label="Max Strata" value={fmtDollar(kpis.maxLoss)} color="red" />
              <StatCard label="PoP"        value={(kpis.pop * 100).toFixed(1) + '%'} color="yellow" />
              <StatCard label="BPE (depozyt)" value={fmtDollar(kpis.bpe)} color="muted" />
              {kpis.moic != null && (
                <StatCard label="MOIC" value={kpis.moic.toFixed(2) + 'x'} color="yellow" />
              )}
            </>
          )}
          {kpis.breakevens.length === 1 && kpis.bpe > 0 && (
            <StatCard label="BPE (depozyt)" value={fmtDollar(kpis.bpe)} color="muted" />
          )}
          {kpis.breakevens.length === 1 && kpis.moic != null && (
            <StatCard label="MOIC" value={kpis.moic.toFixed(2) + 'x'} color="yellow" />
          )}
          {sigma != null && (
            <StatCard label="±1σ zakres" value={'±$' + sigma.toFixed(2)} color="muted" />
          )}
        </div>
      )}

      {/* Chart */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <canvas ref={canvasRef} height={320} />
      </div>

      {/* Greeks */}
      {greeks && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Δ Delta (pozycja)</div>
            <div className={`text-xl font-bold ${greeks.posDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {greeks.posDelta.toFixed(3)}
            </div>
            <div className="text-xs text-slate-500 mt-1">zmiana P&L na $1 ruchu akcji</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Θ Theta (dzienny, na opcję)</div>
            <div className={`text-xl font-bold ${greeks.posTheta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {greeks.posTheta.toFixed(4)}
            </div>
            <div className="text-xs text-slate-500 mt-1">dzienny upływ wartości czasowej</div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build to check for errors**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -20
```
Expected: build succeeds, no TypeScript/import errors.

If build fails with `Cannot find module 'chartjs-plugin-annotation'`: run `npm install chartjs-plugin-annotation` again.

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/pages/ScenarioLab.jsx frontend-react/package.json frontend-react/package-lock.json
git commit -m "feat(scenario-lab): React ScenarioLab page with Chart.js — spreads, PoP, BPE, MOIC, sigma"
```

---

## Task 3: Wire routing and navigation

**Files:**
- Modify: `frontend-react/src/App.jsx`
- Modify: `frontend-react/src/components/layout/navItems.js`

- [ ] **Step 1: Add route to App.jsx**

In `frontend-react/src/App.jsx`, add import and route:

```jsx
import ScenarioLab from './pages/ScenarioLab';
```

Inside the `<Routes>` block, add before the catch-all `*` route:
```jsx
<Route path="scenario" element={<ScenarioLab />} />
```

Full relevant section of App.jsx after edit:
```jsx
import Dashboard    from './pages/Dashboard';
import Portfolio    from './pages/Portfolio';
import History      from './pages/History';
import Transactions from './pages/Transactions';
import Dividends    from './pages/Dividends';
import Calendar     from './pages/Calendar';
import Watchlist    from './pages/Watchlist';
import Settings     from './pages/Settings';
import ScenarioLab  from './pages/ScenarioLab';

// ...inside <Routes>:
<Route path="scenario"    element={<ScenarioLab />} />
<Route path="*"           element={<Navigate to="/" replace />} />
```

- [ ] **Step 2: Add nav item to navItems.js**

Replace the entire `navItems.js` content:

```js
export const NAV_ITEMS = [
  { to: '/',             icon: '📊', label: 'Dashboard'   },
  { to: '/portfolio',    icon: '💼', label: 'Portfel'      },
  { to: '/history',      icon: '📈', label: 'Historia'     },
  { to: '/transactions', icon: '📋', label: 'Transakcje'   },
  { to: '/dividends',    icon: '💰', label: 'Dywidendy'    },
  { to: '/calendar',     icon: '📅', label: 'Kalendarz'    },
  { to: '/watchlist',    icon: '👁', label: 'Watchlist'    },
  { to: '/scenario',     icon: '🧪', label: 'Scenario Lab' },
  { to: '/settings',     icon: '⚙️', label: 'Ustawienia'   },
];
```

- [ ] **Step 3: Build and verify**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...`

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/App.jsx frontend-react/src/components/layout/navItems.js
git commit -m "feat(scenario-lab): wire /scenario route and nav item in React app"
```

---

## Task 4: Update myfund.html — new strategies, probability cone, BPE, MOIC, 2-sigma x-axis

**Files:**
- Modify: `myfund.html`

This task has 4 sub-parts: (a) add annotation plugin CDN, (b) add HTML inputs, (c) update strategy select, (d) replace renderScenarioLab JS.

- [ ] **Step 1: Add annotation plugin CDN script (line 8, after chart.js CDN on line 7)**

Find:
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```
Add after it:
```html
<script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3/dist/chartjs-plugin-annotation.min.js"></script>
```

- [ ] **Step 2: Add new strategy options to the `<select id="strategy-select">`**

Find:
```html
          <option value="csp">Cash-Secured Put</option>
        </select>
```
Replace with:
```html
          <option value="csp">Cash-Secured Put</option>
          <option value="bull-call-spread">Bull Call Spread</option>
          <option value="bear-put-spread">Bear Put Spread</option>
          <option value="iron-condor">Iron Condor</option>
        </select>
```

- [ ] **Step 3: Add `sl-wing-wrap` div after the existing `sl-strike2-wrap` div**

Find (in the right panel of the form):
```html
        <div id="sl-strike2-wrap" style="display:none;flex-direction:column;gap:6px">
          <label style="font-size:12px;color:var(--muted);font-weight:600">DRUGI STRIKE / SZEROKOŚĆ ($)</label>
          <input id="sl-strike2" type="number" value="110" min="0" step="0.01" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:14px;width:100%;outline:none">
        </div>
```
Replace with:
```html
        <div id="sl-strike2-wrap" style="display:none;flex-direction:column;gap:6px">
          <label id="sl-strike2-label" style="font-size:12px;color:var(--muted);font-weight:600">DRUGI STRIKE ($)</label>
          <input id="sl-strike2" type="number" value="110" min="0" step="0.01" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:14px;width:100%;outline:none">
        </div>
        <div id="sl-wing-wrap" style="display:none;flex-direction:column;gap:6px">
          <label style="font-size:12px;color:var(--muted);font-weight:600">WING WIDTH ($)</label>
          <input id="sl-wing" type="number" value="5" min="0.5" step="0.5" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:14px;width:100%;outline:none">
        </div>
```

Also update `sl-premium` label to be dynamic: change the static `PREMIA (PREMIUM, $ / opcja)` label to have an id:
Find:
```html
        <label style="font-size:12px;color:var(--muted);font-weight:600">PREMIA (PREMIUM, $ / opcja)</label>
        <input id="sl-premium"
```
Replace with:
```html
        <label id="sl-premium-label" style="font-size:12px;color:var(--muted);font-weight:600">PREMIA (PREMIUM, $ / opcja)</label>
        <input id="sl-premium"
```

- [ ] **Step 4: Replace the entire `renderScenarioLab` function JS (and BS helpers block)**

Find the block starting with `let _slChart = null;` and ending with the closing `}` of `renderScenarioLab()` (lines ~4508–4696).

Replace the entire block with:

```js
let _slChart = null;

// Black-Scholes helpers
function slNormCDF(x) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y = 1 - (t*(a1+t*(a2+t*(a3+t*(a4+t*a5))))) * Math.exp(-ax*ax);
  return 0.5 * (1 + sign * y);
}
function slNormPDF(x) { return Math.exp(-0.5*x*x) / Math.sqrt(2*Math.PI); }
function slBS(S, K, T, r, sigma, type) {
  if (T <= 0) return type === 'call' ? Math.max(0, S-K) : Math.max(0, K-S);
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + (r + 0.5*sigma*sigma)*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  if (type === 'call') return S*slNormCDF(d1) - K*Math.exp(-r*T)*slNormCDF(d2);
  return K*Math.exp(-r*T)*slNormCDF(-d2) - S*slNormCDF(-d1);
}
function slDelta(S, K, T, r, sigma, type) {
  if (T <= 0) { return type==='call' ? (S>K?1:0) : (S<K?-1:0); }
  const d1 = (Math.log(S/K) + (r+0.5*sigma*sigma)*T) / (sigma*Math.sqrt(T));
  return type === 'call' ? slNormCDF(d1) : slNormCDF(d1) - 1;
}
function slTheta(S, K, T, r, sigma, type) {
  if (T <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S/K) + (r+0.5*sigma*sigma)*T) / (sigma*sqrtT);
  const d2 = d1 - sigma*sqrtT;
  const base = -(S * slNormPDF(d1) * sigma) / (2*sqrtT);
  if (type === 'call') return (base - r*K*Math.exp(-r*T)*slNormCDF(d2)) / 365;
  return (base + r*K*Math.exp(-r*T)*slNormCDF(-d2)) / 365;
}
function slProbAbove(S, target, iv, T) {
  if (T <= 0 || iv <= 0 || target <= 0) return target <= S ? 1 : 0;
  return 1 - slNormCDF(Math.log(target/S) / (iv * Math.sqrt(T)));
}

function renderScenarioLab() {
  const CONTRACT_SIZE = 100;
  const R = 0.05;
  const strategy  = document.getElementById('strategy-select').value;
  const entry     = parseFloat(document.getElementById('sl-entry').value)   || 100;
  const qty       = parseInt(document.getElementById('sl-qty').value)       || 1;
  const strike    = parseFloat(document.getElementById('sl-strike').value)  || 105;
  const strike2   = parseFloat(document.getElementById('sl-strike2').value) || 110;
  const premium   = parseFloat(document.getElementById('sl-premium').value) || 3.50;
  const dte       = parseInt(document.getElementById('sl-dte').value)       || 30;
  const iv        = (parseFloat(document.getElementById('sl-iv').value)     || 30) / 100;
  const wing      = parseFloat(document.getElementById('sl-wing').value)    || 5;
  const hideStock = document.getElementById('sl-hide-stock').checked;

  // Dynamic label updates
  const strikeLabels = {
    'long-call': 'STRIKE CALL ($)', 'long-put': 'STRIKE PUT ($)',
    'covered-call': 'STRIKE CALL ($)', 'protective-put': 'STRIKE PUT ($)', 'csp': 'STRIKE PUT ($)',
    'bull-call-spread': 'LONG CALL STRIKE ($)', 'bear-put-spread': 'LONG PUT STRIKE ($)',
    'iron-condor': 'SHORT PUT STRIKE ($)',
  };
  const strike2Labels = {
    'bull-call-spread': 'SHORT CALL STRIKE ($)',
    'bear-put-spread': 'SHORT PUT STRIKE ($)',
    'iron-condor': 'SHORT CALL STRIKE ($)',
  };
  const premiumLabels = {
    'bull-call-spread': 'NET DEBIT ($)', 'bear-put-spread': 'NET DEBIT ($)',
    'iron-condor': 'NET CREDIT ($)',
  };
  document.getElementById('sl-strike-label').textContent = strikeLabels[strategy] || 'STRIKE ($)';
  if (document.getElementById('sl-strike2-label'))
    document.getElementById('sl-strike2-label').textContent = strike2Labels[strategy] || 'DRUGI STRIKE ($)';
  if (document.getElementById('sl-premium-label'))
    document.getElementById('sl-premium-label').textContent = premiumLabels[strategy] || 'PREMIA (PREMIUM, $ / opcja)';

  // Show/hide second strike and wing
  const isSpread = ['bull-call-spread','bear-put-spread','iron-condor'].includes(strategy);
  const isWing   = strategy === 'iron-condor';
  const s2wrap   = document.getElementById('sl-strike2-wrap');
  const wgwrap   = document.getElementById('sl-wing-wrap');
  s2wrap.style.display = isSpread ? 'flex' : 'none';
  wgwrap.style.display = isWing   ? 'flex' : 'none';

  const T = dte / 365;
  const nC = qty / CONTRACT_SIZE;

  // Price range: entry ± 2 sigma
  const sigma = entry * iv * Math.sqrt(dte / 365);
  const lo = Math.max(0.01, entry - 2*sigma);
  const hi = entry + 2*sigma;
  const steps = 60;
  const prices = Array.from({length: steps+1}, (_, i) => lo + (hi-lo)*i/steps);

  // Find index closest to target
  function findIdx(target) {
    return prices.reduce((best, p, i) => Math.abs(p-target) < Math.abs(prices[best]-target) ? i : best, 0);
  }

  const stockPnL = prices.map(p => (p - entry) * qty);

  const strategyPnL = prices.map(p => {
    switch (strategy) {
      case 'long-call':        return (Math.max(0, p-strike) - premium) * CONTRACT_SIZE * qty;
      case 'long-put':         return (Math.max(0, strike-p) - premium) * CONTRACT_SIZE * qty;
      case 'covered-call':     return (p-entry)*qty + (Math.min(0, strike-p) + premium)*CONTRACT_SIZE*nC;
      case 'protective-put':   return (p-entry)*qty + (Math.max(0, strike-p) - premium)*CONTRACT_SIZE*nC;
      case 'csp':              return (Math.min(0, p-strike) + premium) * CONTRACT_SIZE;
      case 'bull-call-spread': return (Math.max(0,p-strike) - Math.max(0,p-strike2) - premium) * CONTRACT_SIZE * qty;
      case 'bear-put-spread':  return (Math.max(0,strike-p) - Math.max(0,strike2-p) - premium) * CONTRACT_SIZE * qty;
      case 'iron-condor': {
        const K1b = strike - wing, K2b = strike2 + wing;
        return (Math.max(0,K1b-p) - Math.max(0,strike-p) - Math.max(0,p-strike2) + Math.max(0,p-K2b) + premium) * CONTRACT_SIZE;
      }
      default: return 0;
    }
  });

  const isCallLeg = strategy === 'long-call' || strategy === 'covered-call';
  const t0PnL = prices.map(p => {
    switch (strategy) {
      case 'long-call':
        return (slBS(p,strike,T,R,iv,'call') - premium) * CONTRACT_SIZE * qty;
      case 'long-put':
        return (slBS(p,strike,T,R,iv,'put') - premium) * CONTRACT_SIZE * qty;
      case 'covered-call':
        return (p-entry)*qty + (premium - slBS(p,strike,T,R,iv,'call'))*CONTRACT_SIZE*nC;
      case 'protective-put':
        return (p-entry)*qty + (slBS(p,strike,T,R,iv,'put') - premium)*CONTRACT_SIZE*nC;
      case 'csp':
        return (premium - slBS(p,strike,T,R,iv,'put')) * CONTRACT_SIZE;
      case 'bull-call-spread':
        return (slBS(p,strike,T,R,iv,'call') - slBS(p,strike2,T,R,iv,'call') - premium) * CONTRACT_SIZE * qty;
      case 'bear-put-spread':
        return (slBS(p,strike,T,R,iv,'put') - slBS(p,strike2,T,R,iv,'put') - premium) * CONTRACT_SIZE * qty;
      case 'iron-condor': {
        const K1b = strike - wing, K2b = strike2 + wing;
        return (slBS(p,K1b,T,R,iv,'put') - slBS(p,strike,T,R,iv,'put')
               - slBS(p,strike2,T,R,iv,'call') + slBS(p,K2b,T,R,iv,'call') + premium) * CONTRACT_SIZE;
      }
      default: return 0;
    }
  });

  // KPIs
  const stat = (label, val, color) =>
    `<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 14px">
      <div style="font-size:11px;color:var(--muted);font-weight:600;margin-bottom:4px">${label}</div>
      <div style="font-size:15px;font-weight:700;color:${color||'var(--text)'}">${val}</div>
    </div>`;

  function pop(be, isAbove) {
    const p = slProbAbove(entry, be, iv, T);
    return ((isAbove ? p : 1-p) * 100).toFixed(1) + '%';
  }

  let kpiHtml = '';
  switch (strategy) {
    case 'long-call': {
      const be = strike + premium;
      kpiHtml = stat('Break-even','$'+be.toFixed(2),'var(--blue)') +
                stat('Max Strata','-$'+(premium*CONTRACT_SIZE*qty).toFixed(2),'var(--red)') +
                stat('Max Zysk','∞','var(--green)') +
                stat('PoP',pop(be,true),'var(--yellow)');
      break;
    }
    case 'long-put': {
      const be = strike - premium;
      kpiHtml = stat('Break-even','$'+be.toFixed(2),'var(--blue)') +
                stat('Max Strata','-$'+(premium*CONTRACT_SIZE*qty).toFixed(2),'var(--red)') +
                stat('Max Zysk','$'+((strike-premium)*CONTRACT_SIZE*qty).toFixed(0),'var(--green)') +
                stat('PoP',pop(be,false),'var(--yellow)');
      break;
    }
    case 'covered-call': {
      const be = entry - premium;
      const maxProfit = (strike-entry+premium)*qty;
      kpiHtml = stat('Break-even','$'+be.toFixed(2),'var(--blue)') +
                stat('Max Zysk','$'+maxProfit.toFixed(2),'var(--green)') +
                stat('Premia','+$'+(premium*CONTRACT_SIZE*nC).toFixed(2),'var(--yellow)') +
                stat('PoP',pop(be,true),'var(--yellow)');
      break;
    }
    case 'protective-put': {
      const be = entry + premium;
      const maxLoss = (entry-strike+premium)*qty;
      kpiHtml = stat('Break-even','$'+be.toFixed(2),'var(--blue)') +
                stat('Max Strata','-$'+maxLoss.toFixed(2),'var(--red)') +
                stat('Floor','$'+strike.toFixed(2),'var(--muted)') +
                stat('PoP',pop(be,true),'var(--yellow)');
      break;
    }
    case 'csp': {
      const be = strike - premium;
      const bpe = strike * CONTRACT_SIZE;
      const moic = (premium * CONTRACT_SIZE / bpe * 100).toFixed(1);
      kpiHtml = stat('Break-even','$'+be.toFixed(2),'var(--blue)') +
                stat('Max Zysk','$'+(premium*CONTRACT_SIZE).toFixed(2),'var(--green)') +
                stat('PoP',pop(be,true),'var(--yellow)') +
                stat('MOIC',moic+'%','var(--yellow)');
      break;
    }
    case 'bull-call-spread': {
      const be = strike + premium;
      const maxP = (strike2-strike-premium)*CONTRACT_SIZE*qty;
      const maxL = premium*CONTRACT_SIZE*qty;
      const moic = (maxP/maxL).toFixed(2);
      kpiHtml = stat('Break-even','$'+be.toFixed(2),'var(--blue)') +
                stat('Max Zysk','$'+maxP.toFixed(2),'var(--green)') +
                stat('Max Strata','-$'+maxL.toFixed(2),'var(--red)') +
                stat('PoP / MOIC',pop(be,true)+' / '+moic+'x','var(--yellow)');
      break;
    }
    case 'bear-put-spread': {
      const be = strike - premium;
      const maxP = (strike-strike2-premium)*CONTRACT_SIZE*qty;
      const maxL = premium*CONTRACT_SIZE*qty;
      const moic = (maxP/maxL).toFixed(2);
      kpiHtml = stat('Break-even','$'+be.toFixed(2),'var(--blue)') +
                stat('Max Zysk','$'+maxP.toFixed(2),'var(--green)') +
                stat('Max Strata','-$'+maxL.toFixed(2),'var(--red)') +
                stat('PoP / MOIC',pop(be,false)+' / '+moic+'x','var(--yellow)');
      break;
    }
    case 'iron-condor': {
      const beLo = strike - premium, beHi = strike2 + premium;
      const maxP = premium * CONTRACT_SIZE;
      const bpe  = (wing - premium) * CONTRACT_SIZE;
      const moic = bpe > 0 ? (maxP/bpe).toFixed(2) : '∞';
      const popIC = ((slProbAbove(entry,beLo,iv,T) - slProbAbove(entry,beHi,iv,T))*100).toFixed(1)+'%';
      kpiHtml = stat('BE dolny / górny','$'+beLo.toFixed(2)+' / $'+beHi.toFixed(2),'var(--blue)') +
                stat('Max Zysk','$'+maxP.toFixed(2),'var(--green)') +
                stat('BPE (depozyt)','$'+bpe.toFixed(2),'var(--muted)') +
                stat('PoP / MOIC',popIC+' / '+moic+'x','var(--yellow)');
      break;
    }
  }
  document.getElementById('sl-stats').innerHTML = kpiHtml;

  // Chart datasets
  const hedged = strategy === 'covered-call' || strategy === 'protective-put';
  const isSpreadChart = isSpread;
  const stratNames = {
    'long-call': 'Long Call', 'long-put': 'Long Put', 'covered-call': 'Covered Call',
    'protective-put': 'Protective Put', 'csp': 'Cash-Secured Put',
    'bull-call-spread': 'Bull Call Spread', 'bear-put-spread': 'Bear Put Spread',
    'iron-condor': 'Iron Condor',
  };
  const datasets = [];
  if ((hedged || isSpreadChart) && !hideStock) {
    datasets.push({ label:'Tylko Akcje', data:stockPnL, borderColor:'#3b82f6',
      backgroundColor:'rgba(59,130,246,.05)', borderWidth:2, borderDash:[5,4], pointRadius:0, tension:0.1 });
  }
  datasets.push({ label:stratNames[strategy]||strategy, data:strategyPnL, borderColor:'#8b5cf6',
    backgroundColor:'rgba(139,92,246,.08)', borderWidth:2.5, pointRadius:0, tension:0.1 });
  datasets.push({ label:'Dzisiaj (T+0)', data:t0PnL, borderColor:'#c084fc',
    backgroundColor:'transparent', borderWidth:1.5, borderDash:[4,3], pointRadius:0, tension:0.3 });

  const s1LoIdx = findIdx(entry - sigma);
  const s1HiIdx = findIdx(entry + sigma);
  const entryIdx = findIdx(entry);

  const canvas = document.getElementById('sl-chart');
  if (_slChart) { _slChart.destroy(); _slChart = null; }
  _slChart = new Chart(canvas, {
    type: 'line',
    data: { labels: prices.map(p => '$'+p.toFixed(0)), datasets },
    options: {
      responsive: true, interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text').trim()||'#e2e8f0', font:{size:12,weight:'600'} } },
        tooltip: { callbacks: { label: ctx => ' '+ctx.dataset.label+': $'+ctx.parsed.y.toFixed(2) } },
        annotation: {
          annotations: {
            entryLine: { type:'line', xMin:entryIdx, xMax:entryIdx,
              borderColor:'rgba(248,250,252,0.2)', borderWidth:1, borderDash:[2,4],
              label:{ content:'Entry', display:true, color:'#94a3b8', font:{size:10}, position:'start' } },
            s1Lo: { type:'line', xMin:s1LoIdx, xMax:s1LoIdx,
              borderColor:'rgba(99,102,241,0.5)', borderWidth:1, borderDash:[4,4],
              label:{ content:'-1σ', display:true, color:'#818cf8', font:{size:10}, position:'start' } },
            s1Hi: { type:'line', xMin:s1HiIdx, xMax:s1HiIdx,
              borderColor:'rgba(99,102,241,0.5)', borderWidth:1, borderDash:[4,4],
              label:{ content:'+1σ', display:true, color:'#818cf8', font:{size:10}, position:'start' } },
          }
        }
      },
      scales: {
        x: { ticks:{color:'#8892a4',maxTicksLimit:10}, grid:{color:'rgba(255,255,255,.04)'} },
        y: { ticks:{color:'#8892a4',callback:v=>'$'+v.toFixed(0)}, grid:{color:'rgba(255,255,255,.04)'},
             title:{display:true,text:'Zysk / Strata ($)',color:'#8892a4',font:{size:11}} }
      }
    }
  });

  // Greeks
  const optTypeMain = isCallLeg ? 'call' : 'put';
  let posDelta, posTheta;
  const d = (K, type) => slDelta(entry, K, T, R, iv, type);
  const th = (K, type) => slTheta(entry, K, T, R, iv, type);
  switch (strategy) {
    case 'long-call':        posDelta=d(strike,'call');         posTheta=th(strike,'call'); break;
    case 'long-put':         posDelta=d(strike,'put');          posTheta=th(strike,'put'); break;
    case 'covered-call':     posDelta=1-d(strike,'call');       posTheta=-th(strike,'call'); break;
    case 'protective-put':   posDelta=1+d(strike,'put');        posTheta=th(strike,'put'); break;
    case 'csp':              posDelta=-d(strike,'put');         posTheta=-th(strike,'put'); break;
    case 'bull-call-spread': posDelta=d(strike,'call')-d(strike2,'call'); posTheta=th(strike,'call')-th(strike2,'call'); break;
    case 'bear-put-spread':  posDelta=d(strike,'put')-d(strike2,'put');   posTheta=th(strike,'put')-th(strike2,'put'); break;
    case 'iron-condor': {
      const K1b=strike-wing, K2b=strike2+wing;
      posDelta=d(K1b,'put')-d(strike,'put')-d(strike2,'call')+d(K2b,'call');
      posTheta=th(K1b,'put')-th(strike,'put')-th(strike2,'call')+th(K2b,'call');
      break;
    }
    default: posDelta=0; posTheta=0;
  }
  const gc = v => v >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('sl-greeks').innerHTML =
    `<div style="display:flex;gap:16px;margin-top:4px">
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 18px;flex:1">
        <div style="font-size:11px;color:var(--muted);font-weight:600;margin-bottom:4px">Δ DELTA (pozycja)</div>
        <div style="font-size:20px;font-weight:700;color:${gc(posDelta)}">${posDelta.toFixed(3)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">zmiana P&amp;L na $1 ruchu akcji</div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 18px;flex:1">
        <div style="font-size:11px;color:var(--muted);font-weight:600;margin-bottom:4px">Θ THETA (dzienny)</div>
        <div style="font-size:20px;font-weight:700;color:${gc(posTheta)}">${posTheta.toFixed(4)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">dzienny upływ wartości czasowej</div>
      </div>
    </div>`;
}
```

- [ ] **Step 5: Build frontend and commit all changes**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...`

```bash
git add myfund.html frontend-react/src/utils/scenarioLab.js frontend-react/src/pages/ScenarioLab.jsx frontend-react/src/App.jsx frontend-react/src/components/layout/navItems.js frontend-react/package.json frontend-react/package-lock.json
git commit -m "feat(scenario-lab): spreads + probability cone + PoP + BPE + MOIC + 2-sigma x-axis"
```

- [ ] **Step 6: Push to deploy**

```bash
git push origin main
```
Expected: pushed, Render auto-deploys within ~5 minutes.

---

## Self-Review

**Spec coverage check:**

| Requirement | Covered in |
|-------------|-----------|
| Odblokuj "Drugi Strike" dla spreads | Task 4 Step 2 (HTML), Task 2 (React state) |
| Bull Call Spread | calcPayoff, calcKPIs, renderScenarioLab switch |
| Bear Put Spread | calcPayoff, calcKPIs, renderScenarioLab switch |
| Iron Condor (4 nogi) | calcPayoff uses K1b/K2b wing, renderScenarioLab |
| Probability Cone (±1σ vertical lines) | Task 4 Step 4 — chartjs-plugin-annotation |
| 1_Sigma = entry * IV * sqrt(DTE/365) | calcSigma(), renderScenarioLab sigma calc |
| PoP — normCDF based | slProbAbove/probAbove in utility, KPI cards |
| Buying Power Effect | calcKPIs bpe field, renderScenarioLab KPI |
| MOIC | calcKPIs moic field, renderScenarioLab KPI |
| X-axis ±2 sigma centered | makePrices(), renderScenarioLab lo/hi from sigma |

**No placeholders:** All steps have complete code blocks.

**Type consistency:** All functions use the same param names (`strike`, `strike2`, `wing`, `premium`, `entry`, `qty`, `T`, `iv`) throughout.
