# Scenario Lab — Real Option Chain Integration (MarketData.app)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate MarketData.app API into Scenario Lab so users can fetch a real option chain for any ticker, then select a contract from dropdowns to auto-fill Strike, Premia, DTE, and IV.

**Architecture:** A new `MarketDataService.js` handles all API calls and 5-min localStorage caching. Settings.jsx gets an API key section. ScenarioLab.jsx gains a ticker input, "🔍 Pobierz łańcuch" button, and conditional dropdowns for expiry + strike(s) that replace manual inputs after chain load. All existing manual fields remain editable as overrides.

**Tech Stack:** React 18, MarketData.app REST API (`https://api.marketdata.app/v1/options/chain/{ticker}/`), localStorage cache, Tailwind CSS.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend-react/src/services/MarketDataService.js` | **Create** | API key management, `fetchOptionChain`, `getOptionQuote`, 5-min cache |
| `frontend-react/src/pages/Settings.jsx` | **Modify** | Add "Klucze API" section with MarketData.app key input |
| `frontend-react/src/pages/ScenarioLab.jsx` | **Modify** | Ticker input, fetch button, expiry/strike dropdowns, auto-fill logic |

---

## Task 1: MarketDataService

**Files:**
- Create: `frontend-react/src/services/MarketDataService.js`

The MarketData.app option chain endpoint returns parallel arrays. Example response:
```json
{
  "s": "ok",
  "optionSymbol": ["AAPL250117C00150000"],
  "expirationDate": ["2025-01-17"],
  "strike": [150.0],
  "side": ["call"],
  "bid": [5.50], "ask": [5.60], "mid": [5.55],
  "iv": [0.25], "delta": [0.45], "theta": [-0.05], "dte": [30]
}
```
Error response: `{ "s": "error", "errmsg": "..." }`

- [ ] **Step 1: Create the service file**

```js
// frontend-react/src/services/MarketDataService.js

// User must set this key in Settings → Klucze API
export const MD_API_KEY_LS = 'marketdata_api_key';
const CACHE_PREFIX = 'marketdata_chain_';
const CACHE_TTL    = 5 * 60 * 1000; // 5 min

export function getMdApiKey() {
  return localStorage.getItem(MD_API_KEY_LS) || '';
}

export function setMdApiKey(key) {
  localStorage.setItem(MD_API_KEY_LS, key.trim());
}

/**
 * Fetches the full option chain for a ticker from MarketData.app.
 * Results are cached in localStorage for 5 minutes.
 *
 * Returns: {
 *   expirations: string[],          // sorted 'YYYY-MM-DD' list
 *   contracts: Contract[]           // full flat list
 * }
 *
 * Contract: {
 *   optionSymbol, expiry, strike, side,
 *   bid, ask, mid, iv, delta, theta, dte
 * }
 */
export async function fetchOptionChain(ticker) {
  const token = getMdApiKey();
  if (!token) throw new Error('Brak klucza API. Ustaw go w Ustawienia → Klucze API.');

  const sym = ticker.toUpperCase().trim();
  const cacheKey = CACHE_PREFIX + sym;

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached?.ts && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  } catch {}

  const url = `https://api.marketdata.app/v1/options/chain/${encodeURIComponent(sym)}/?token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

  const json = await res.json().catch(() => { throw new Error(`HTTP ${res.status}`); });
  if (!res.ok || json.s === 'error') {
    throw new Error(json.errmsg || `HTTP ${res.status}`);
  }

  const n = (json.optionSymbol || []).length;
  const contracts = Array.from({ length: n }, (_, i) => ({
    optionSymbol: json.optionSymbol[i],
    expiry:       json.expirationDate?.[i] ?? '',
    strike:       json.strike?.[i]         ?? 0,
    side:         json.side?.[i]           ?? 'call',
    bid:          json.bid?.[i]            ?? null,
    ask:          json.ask?.[i]            ?? null,
    mid:          json.mid?.[i]            ?? null,
    iv:           json.iv?.[i]             ?? null,
    delta:        json.delta?.[i]          ?? null,
    theta:        json.theta?.[i]          ?? null,
    dte:          json.dte?.[i]            ?? null,
  }));

  const expirations = [...new Set(contracts.map(c => c.expiry))].sort();
  const data = { expirations, contracts };

  localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  return data;
}

/**
 * Fetches a fresh quote for a single option symbol.
 * Returns: { bid, ask, mid, iv, delta, theta }
 */
export async function getOptionQuote(optionSymbol) {
  const token = getMdApiKey();
  if (!token) throw new Error('Brak klucza API.');

  const url = `https://api.marketdata.app/v1/options/quotes/${encodeURIComponent(optionSymbol)}/?token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const json = await res.json().catch(() => { throw new Error(`HTTP ${res.status}`); });
  if (!res.ok || json.s === 'error') throw new Error(json.errmsg || `HTTP ${res.status}`);

  return {
    bid:   json.bid?.[0]   ?? null,
    ask:   json.ask?.[0]   ?? null,
    mid:   json.mid?.[0]   ?? null,
    iv:    json.iv?.[0]    ?? null,
    delta: json.delta?.[0] ?? null,
    theta: json.theta?.[0] ?? null,
  };
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -5
```
Expected: `✓ built in ...`

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/services/MarketDataService.js
git commit -m "feat(scenario-lab): MarketDataService — fetchOptionChain, getOptionQuote, 5-min cache"
```

---

## Task 2: Settings.jsx — API key section

**Files:**
- Modify: `frontend-react/src/pages/Settings.jsx`

Add a new card section "Klucze API" that lets the user enter and save their MarketData.app key. Insert it between the "Kursy walut" section and "O aplikacji" section.

- [ ] **Step 1: Replace the entire `frontend-react/src/pages/Settings.jsx` with this:**

```jsx
// frontend-react/src/pages/Settings.jsx
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getMdApiKey, setMdApiKey } from '../services/MarketDataService';

function ApiKeySection() {
  const [key,   setKey]   = useState(getMdApiKey);
  const [saved, setSaved] = useState(false);

  function save() {
    setMdApiKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isSet = !!getMdApiKey();

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300">Klucze API</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Wymagane do pobierania łańcucha opcji w Scenario Lab
        </p>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide flex items-center gap-2">
            MarketData.app
            {isSet
              ? <span className="text-emerald-400 normal-case font-normal">✓ ustawiony</span>
              : <span className="text-amber-400 normal-case font-normal">nie ustawiony</span>
            }
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="Wklej klucz API…"
              className="flex-1 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-slate-100 text-sm outline-none focus:border-indigo-500 font-mono"
            />
            <button
              onClick={save}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors min-w-[80px] ${
                saved
                  ? 'bg-emerald-700 text-emerald-100'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {saved ? '✓ Zapisano' : 'Zapisz'}
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Klucz przechowywany tylko lokalnie (localStorage). Zdobądź darmowy klucz na{' '}
            <span className="text-slate-400">marketdata.app</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { displayName, logout, refresh, fxRates } = useApp();
  const apiUrl = import.meta.env.VITE_API_URL ?? '(proxy lokalny)';

  return (
    <div className="space-y-5 max-w-xl">
      {/* Konto */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Konto</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">Zalogowany jako</span>
            <span className="text-sm font-semibold text-slate-200">{displayName || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">API URL</span>
            <span className="text-xs text-slate-500 font-mono truncate max-w-xs">{apiUrl}</span>
          </div>
          <div className="pt-2 border-t border-slate-700 flex flex-col sm:flex-row gap-3">
            <button
              onClick={refresh}
              className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium min-h-[44px]"
            >
              Odśwież dane
            </button>
            <button
              onClick={logout}
              className="text-sm px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-slate-300 min-h-[44px]"
            >
              Wyloguj
            </button>
          </div>
        </div>
      </div>

      {/* Klucze API */}
      <ApiKeySection />

      {/* Kursy walut */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Kursy walut</h2>
          <p className="text-xs text-slate-500 mt-0.5">Aktualizowane co 30 min (frankfurter.app)</p>
        </div>
        <div className="px-5 py-4 space-y-2">
          {['USD', 'EUR', 'GBP'].map(cur => (
            <div key={cur} className="flex justify-between items-center py-1">
              <span className="text-sm font-medium text-slate-300">{cur} / PLN</span>
              <span className="text-sm text-slate-400 font-mono">
                {fxRates[cur] != null ? fxRates[cur].toFixed(4) : '—'} zł
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* O aplikacji */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
        <p className="text-xs text-slate-600">
          StocksTracker React — migracja z Vanilla JS.
          Dane przechowywane na Render (PostgreSQL).
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/pages/Settings.jsx
git commit -m "feat(settings): MarketData.app API key section"
```

---

## Task 3: ScenarioLab.jsx — chain fetch, dropdowns, auto-fill

**Files:**
- Modify: `frontend-react/src/pages/ScenarioLab.jsx`

### What changes

**New state:**
```
chain          — { expirations, contracts } or null
chainLoading   — bool
chainError     — string or null
chainTicker    — the ticker used for the last fetch (shown in UI)
selectedExpiry — 'YYYY-MM-DD' or ''
selectedSym1   — optionSymbol for leg 1 (or sole leg)
selectedSym2   — optionSymbol for leg 2 (spreads only)
```

**Filtering logic:**
```
long-call, covered-call      → side === 'call'
long-put, protective-put, csp → side === 'put'
bull-call-spread             → both legs side === 'call'
bear-put-spread              → both legs side === 'put'
iron-condor                  → leg1 side === 'put', leg2 side === 'call'
```

**Auto-fill on contract select (single leg):**
- `strike`   ← contract.strike
- `premium`  ← contract.mid ?? (contract.bid + contract.ask) / 2
- `dte`      ← contract.dte
- `iv`       ← Math.round(contract.iv * 100) [iv from API is a decimal like 0.25]

**Auto-fill on contract select (two legs — spreads):**
After both leg1 and leg2 are selected:
- `strike`   ← leg1.strike
- `strike2`  ← leg2.strike
- `dte`      ← leg1.dte
- `iv`       ← Math.round(leg1.iv * 100)
- `premium`  ← `bull-call-spread` / `bear-put-spread`: Math.abs(leg1.mid - leg2.mid)
- `premium`  ← `iron-condor`: leg1.mid + leg2.mid − longPutMid − longCallMid
  where longPutMid = closest put in chain with strike = leg1.strike − wing
        longCallMid = closest call in chain with strike = leg2.strike + wing

**UI layout (new block inserted below stock picker, above form grid):**
```
[Ticker input] [🔍 Pobierz łańcuch (spinner)] [cache badge "z cache" / error]

After chain loaded:
[Expiry select ▾]

Single-leg:
  [Strike/Contract select ▾]  ← shows "STRIKE — MID | IV | ΔDELTA"

Two-leg (spread / condor):
  [Noga długa ▾] [Noga krótka ▾]   (bull/bear spread)
  [Short Put ▾]  [Short Call ▾]    (iron condor)
```

- [ ] **Step 1: Add imports at the top of `frontend-react/src/pages/ScenarioLab.jsx`**

Current line 3 (after React import):
```jsx
import { useApp } from '../context/AppContext';
```

Add after line 3:
```jsx
import { fetchOptionChain, getMdApiKey } from '../services/MarketDataService';
```

- [ ] **Step 2: Add new state variables inside `ScenarioLab` component, after the `hideStock` state line**

After:
```jsx
  const [hideStock, setHideStock] = useState(false);
```

Add:
```jsx
  // Option chain state
  const [chain,          setChain]          = useState(null);
  const [chainLoading,   setChainLoading]   = useState(false);
  const [chainError,     setChainError]     = useState(null);
  const [chainTicker,    setChainTicker]    = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [selectedSym1,   setSelectedSym1]   = useState('');
  const [selectedSym2,   setSelectedSym2]   = useState('');
```

- [ ] **Step 3: Add helper functions and the fetch handler inside the component, after the `selectedSym2` state line**

```jsx
  // Contracts filtered for the current expiry
  const expiryContracts = chain
    ? chain.contracts.filter(c => c.expiry === selectedExpiry)
    : [];

  // Side filter per strategy
  const leg1Side = ['long-put','protective-put','csp','bear-put-spread'].includes(strategy) ? 'put'
                 : strategy === 'iron-condor' ? 'put'
                 : 'call';
  const leg2Side = ['bull-call-spread','iron-condor'].includes(strategy) ? 'call' : 'put';

  const leg1Contracts = expiryContracts.filter(c => c.side === leg1Side);
  const leg2Contracts = expiryContracts.filter(c => c.side === leg2Side);

  async function handleFetchChain() {
    const ticker = (chainTicker || selectedSymbol || '').toUpperCase().trim();
    if (!ticker) { setChainError('Wprowadź ticker (np. AAPL)'); return; }
    if (!getMdApiKey()) { setChainError('Brak klucza API — ustaw go w Ustawienia → Klucze API'); return; }
    setChainLoading(true);
    setChainError(null);
    setChain(null);
    setSelectedExpiry('');
    setSelectedSym1('');
    setSelectedSym2('');
    try {
      const data = await fetchOptionChain(ticker);
      setChain(data);
      if (data.expirations.length) setSelectedExpiry(data.expirations[0]);
    } catch (e) {
      setChainError(e.message);
    } finally {
      setChainLoading(false);
    }
  }

  function applyContract(sym, isLeg2 = false) {
    const c = chain?.contracts.find(x => x.optionSymbol === sym);
    if (!c) return;
    if (!isLeg2) {
      setSelectedSym1(sym);
      setStrike(c.strike);
      if (c.dte   != null) setDte(c.dte);
      if (c.iv    != null) setIv(Math.round(c.iv * 100));
      if (!SPREAD_STRATEGIES.has(strategy)) {
        const mid = c.mid ?? (c.bid != null && c.ask != null ? (c.bid + c.ask) / 2 : null);
        if (mid != null) setPremium(parseFloat(mid.toFixed(2)));
      }
    } else {
      setSelectedSym2(sym);
      setStrike2(c.strike);
    }

    // For two-leg strategies: compute net premium when both legs are set
    const sym1 = isLeg2 ? selectedSym1 : sym;
    const sym2 = isLeg2 ? sym : selectedSym2;
    if (SPREAD_STRATEGIES.has(strategy) && sym1 && sym2) {
      const c1 = chain.contracts.find(x => x.optionSymbol === sym1);
      const c2 = chain.contracts.find(x => x.optionSymbol === sym2);
      if (c1 && c2) {
        if (c1.dte != null) setDte(c1.dte);
        if (c1.iv  != null) setIv(Math.round(c1.iv * 100));
        const mid1 = c1.mid ?? (c1.bid != null && c1.ask != null ? (c1.bid + c1.ask) / 2 : 0);
        const mid2 = c2.mid ?? (c2.bid != null && c2.ask != null ? (c2.bid + c2.ask) / 2 : 0);
        if (strategy === 'iron-condor') {
          // short put (c1) + short call (c2) credit; subtract long wings using wing width
          const longPut  = chain.contracts.find(x => x.side === 'put'  && Math.abs(x.strike - (c1.strike - wing)) < 0.01 && x.expiry === c1.expiry);
          const longCall = chain.contracts.find(x => x.side === 'call' && Math.abs(x.strike - (c2.strike + wing)) < 0.01 && x.expiry === c2.expiry);
          const lp = longPut?.mid  ?? longPut?.ask  ?? 0;
          const lc = longCall?.mid ?? longCall?.ask ?? 0;
          setPremium(parseFloat(Math.max(0, mid1 + mid2 - lp - lc).toFixed(2)));
        } else {
          // debit spread: long (c1) - short (c2)
          setPremium(parseFloat(Math.max(0, mid1 - mid2).toFixed(2)));
        }
      }
    }
  }
```

- [ ] **Step 4: Add the chain UI block to the JSX, replacing the existing stock picker block**

Find and replace the entire stock picker block:

Old (from previous feature):
```jsx
      {/* Stock picker */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center gap-4">
        <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">
          Spółka z portfela
        </label>
        <select
          value={selectedSymbol}
          onChange={e => setSelectedSymbol(e.target.value)}
          className={inputCls + ' max-w-xs'}
        >
          <option value="">— własne wartości —</option>
          {portfolio.map(pos => (
            <option key={pos.id ?? pos.symbol} value={pos.symbol}>
              {pos.symbol}{pos.name && pos.name !== pos.symbol ? ` — ${pos.name}` : ''}
            </option>
          ))}
        </select>
        {fetchingPrice && (
          <span className="text-xs text-slate-400 animate-pulse">Pobieranie kursu…</span>
        )}
        {livePrice != null && !fetchingPrice && (
          <span className="text-xs bg-indigo-900/60 border border-indigo-700 text-indigo-300 rounded-md px-2 py-1 font-mono">
            {livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        )}
        {selectedSymbol && !fetchingPrice && (
          <button
            onClick={() => setSelectedSymbol('')}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors ml-auto"
          >
            ✕ wyczyść
          </button>
        )}
      </div>
```

Replace with:
```jsx
      {/* Stock picker + chain fetch */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 space-y-3">
        {/* Row 1: portfolio selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">
            Spółka z portfela
          </label>
          <select
            value={selectedSymbol}
            onChange={e => { setSelectedSymbol(e.target.value); if (e.target.value) setChainTicker(e.target.value); }}
            className={inputCls + ' max-w-xs'}
          >
            <option value="">— własne wartości —</option>
            {portfolio.map(pos => (
              <option key={pos.id ?? pos.symbol} value={pos.symbol}>
                {pos.symbol}{pos.name && pos.name !== pos.symbol ? ` — ${pos.name}` : ''}
              </option>
            ))}
          </select>
          {fetchingPrice && <span className="text-xs text-slate-400 animate-pulse">Pobieranie kursu…</span>}
          {livePrice != null && !fetchingPrice && (
            <span className="text-xs bg-indigo-900/60 border border-indigo-700 text-indigo-300 rounded-md px-2 py-1 font-mono">
              {livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {selectedSymbol && !fetchingPrice && (
            <button onClick={() => setSelectedSymbol('')} className="text-xs text-slate-500 hover:text-slate-300 transition-colors ml-auto">
              ✕ wyczyść
            </button>
          )}
        </div>

        {/* Row 2: ticker input + fetch button */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">
            Ticker opcji
          </label>
          <input
            type="text"
            value={chainTicker}
            onChange={e => setChainTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleFetchChain()}
            placeholder="np. AAPL"
            className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm w-28 outline-none focus:border-indigo-500 font-mono uppercase"
          />
          <button
            onClick={handleFetchChain}
            disabled={chainLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-wait text-sm font-semibold transition-colors"
          >
            {chainLoading
              ? <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : '🔍'}
            Pobierz łańcuch
          </button>
          {chain && !chainLoading && (
            <span className="text-xs text-emerald-400">
              ✓ {chain.contracts.length} kontraktów ({chain.expirations.length} dat)
            </span>
          )}
          {chainError && <span className="text-xs text-rose-400">{chainError}</span>}
        </div>

        {/* Row 3: chain dropdowns (shown after chain loaded) */}
        {chain && (
          <div className="border-t border-slate-700 pt-3 flex flex-col gap-2">
            {/* Expiry */}
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap w-24">
                Wygaśnięcie
              </label>
              <select
                value={selectedExpiry}
                onChange={e => { setSelectedExpiry(e.target.value); setSelectedSym1(''); setSelectedSym2(''); }}
                className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm outline-none focus:border-indigo-500"
              >
                {chain.expirations.map(exp => {
                  const c = chain.contracts.find(x => x.expiry === exp);
                  return (
                    <option key={exp} value={exp}>
                      {exp}{c?.dte != null ? ` (${c.dte}d)` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Single-leg strike */}
            {!SPREAD_STRATEGIES.has(strategy) && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap w-24">
                  Kontrakt
                </label>
                <select
                  value={selectedSym1}
                  onChange={e => applyContract(e.target.value, false)}
                  className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm outline-none focus:border-indigo-500 flex-1 min-w-[200px]"
                >
                  <option value="">— wybierz strike —</option>
                  {leg1Contracts.map(c => (
                    <option key={c.optionSymbol} value={c.optionSymbol}>
                      ${c.strike} · mid {c.mid != null ? `$${c.mid.toFixed(2)}` : '—'} · IV {c.iv != null ? `${(c.iv*100).toFixed(0)}%` : '—'} · Δ {c.delta != null ? c.delta.toFixed(2) : '—'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Two-leg strikes (spreads) */}
            {SPREAD_STRATEGIES.has(strategy) && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap w-24">
                    {strategy === 'iron-condor' ? 'Short Put' : 'Noga długa'}
                  </label>
                  <select
                    value={selectedSym1}
                    onChange={e => applyContract(e.target.value, false)}
                    className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm outline-none focus:border-indigo-500 flex-1 min-w-[200px]"
                  >
                    <option value="">— wybierz strike —</option>
                    {leg1Contracts.map(c => (
                      <option key={c.optionSymbol} value={c.optionSymbol}>
                        ${c.strike} · mid {c.mid != null ? `$${c.mid.toFixed(2)}` : '—'} · IV {c.iv != null ? `${(c.iv*100).toFixed(0)}%` : '—'} · Δ {c.delta != null ? c.delta.toFixed(2) : '—'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap w-24">
                    {strategy === 'iron-condor' ? 'Short Call' : 'Noga krótka'}
                  </label>
                  <select
                    value={selectedSym2}
                    onChange={e => applyContract(e.target.value, true)}
                    className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm outline-none focus:border-indigo-500 flex-1 min-w-[200px]"
                  >
                    <option value="">— wybierz strike —</option>
                    {leg2Contracts.map(c => (
                      <option key={c.optionSymbol} value={c.optionSymbol}>
                        ${c.strike} · mid {c.mid != null ? `$${c.mid.toFixed(2)}` : '—'} · IV {c.iv != null ? `${(c.iv*100).toFixed(0)}%` : '—'} · Δ {c.delta != null ? c.delta.toFixed(2) : '—'}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        )}
      </div>
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -8
```
Expected: `✓ built in ...` — if there are JSX errors about missing variables, check that `SPREAD_STRATEGIES`, `selectedSymbol`, `fetchingPrice`, `livePrice`, `portfolio` are all in scope (they are from the existing code).

- [ ] **Step 6: Commit**

```bash
git add frontend-react/src/pages/ScenarioLab.jsx
git commit -m "feat(scenario-lab): real option chain — ticker input, fetch button, expiry/strike dropdowns, auto-fill"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| Klasa `MarketDataService` w nowym pliku | Task 1 |
| `fetchOptionChain(ticker)` — daty wygaśnięcia + strike'i | Task 1 |
| `getOptionQuote(optionSymbol)` — Bid/Ask + IV | Task 1 |
| Przycisk "🔍 Pobierz łańcuch" obok Ticker | Task 3 step 4 (Row 2) |
| `Strike` i `Premia` jako dropdowny po pobraniu | Task 3 step 4 (Row 3) |
| Auto-fill DTE i IV po wyborze kontraktu | Task 3 step 3 (`applyContract`) |
| Pole `API_KEY` z komentarzem | Task 1 (constant) + Task 2 (Settings UI) |
| Cache 5 minut w `localStorage` | Task 1 (`CACHE_TTL`, `CACHE_PREFIX`) |
| Spinner na przycisku podczas pobierania | Task 3 step 4 (inline spinner `animate-spin`) |

**No placeholders:** All steps contain complete code.

**Type consistency:** `fetchOptionChain` returns `{ expirations: string[], contracts: Contract[] }`. `chain.contracts` is accessed consistently in the component via `chain.contracts.find(...)` and `chain.contracts.filter(...)`. `applyContract(sym, isLeg2)` signature used consistently in both `onChange` handlers.
