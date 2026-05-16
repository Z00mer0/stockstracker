# Hybrid Dividends (GPW Manual + US Auto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodaj hybrydowy system dywidend: ręczne daty dla GPW (localStorage) + automatyczne z Finnhub dla US stocks, widoczne w Kalendarzu i zakładce Dywidendy.

**Architecture:** Nowy hook `useDividendEvents` odpowiada za oba źródła dywidend (localStorage + `/api/dividends/upcoming`). `useCalendarData` jest uproszczony do makro+earnings. `Calendar.jsx` łączy oba źródła. `Dividends.jsx` dostaje nową sekcję z tabelą, przyciskiem i modalem. `server.py` dostaje endpoint Finnhub dla US stocks.

**Tech Stack:** React hooks, localStorage, Finnhub REST API, Python stdlib (urllib), Tailwind CSS.

---

## File Map

| Akcja | Plik |
|-------|------|
| Utwórz | `frontend-react/src/hooks/useDividendEvents.js` |
| Utwórz | `frontend-react/src/components/AddDividendModal.jsx` |
| Modyfikuj | `frontend-react/src/hooks/useCalendarData.js` |
| Modyfikuj | `frontend-react/src/pages/Calendar.jsx` |
| Modyfikuj | `frontend-react/src/pages/Dividends.jsx` |
| Modyfikuj | `server.py` |

---

## Task 1: Hook `useDividendEvents.js`

**Files:**
- Create: `frontend-react/src/hooks/useDividendEvents.js`

- [ ] **Step 1: Utwórz plik hooks/useDividendEvents.js**

```js
import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'myfund_manual_dividends';

// Odczytaj ręczne dywidendy z localStorage
function loadManual() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

// Zapisz ręczne dywidendy do localStorage
function saveManual(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

// Skonwertuj ręczny wpis na format zdarzenia kalendarza (ex-date = główna data)
function toCalendarEvent(div) {
  return {
    date:     div.exDate,
    type:     'DIV',
    symbol:   div.symbol,
    amount:   div.amount,
    currency: div.currency,
    payDate:  div.payDate,
    note:     div.note,
    isManual: true,
    id:       div.id,
  };
}

// Pobierz nadchodzące dywidendy US z backendu (Finnhub)
async function fetchAutoUS(usSymbols) {
  if (!usSymbols.length) return [];
  try {
    const res = await fetch(
      `/api/dividends/upcoming?symbols=${usSymbols.join(',')}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.map(d => ({
      date:     d.exDate,
      type:     'DIV',
      symbol:   d.symbol,
      amount:   d.amount,
      currency: d.currency ?? 'USD',
      payDate:  d.payDate,
      isManual: false,
    }));
  } catch (err) {
    console.warn('[dividends] auto US fetch failed:', err.message);
    return [];
  }
}

/**
 * Hook łączący ręczne dywidendy (localStorage) z automatycznymi (Finnhub US).
 * @param {string[]} portfolioSymbols - wszystkie symbole z portfela
 * @returns {{ manualDividends, autoEvents, allCalendarEvents, loading,
 *             addDividend, editDividend, deleteDividend }}
 */
export default function useDividendEvents(portfolioSymbols = []) {
  const [manualDividends, setManualDividends] = useState(loadManual);
  const [autoEvents, setAutoEvents]           = useState([]);
  const [loading, setLoading]                 = useState(false);

  // Pobierz auto-dywidendy US przy zmianie portfela
  useEffect(() => {
    const usSymbols = portfolioSymbols.filter(s => !s.includes('.'));
    if (!usSymbols.length) { setAutoEvents([]); return; }

    let cancelled = false;
    setLoading(true);
    fetchAutoUS(usSymbols).then(evs => {
      if (!cancelled) { setAutoEvents(evs); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [portfolioSymbols.join(',')]);

  // Dodaj nową dywidendę ręczną
  const addDividend = useCallback((div) => {
    const entry = { ...div, id: Date.now().toString(), addedAt: new Date().toISOString().slice(0, 10), isManual: true };
    setManualDividends(prev => {
      const updated = [...prev, entry];
      saveManual(updated);
      return updated;
    });
  }, []);

  // Edytuj istniejącą dywidendę ręczną
  const editDividend = useCallback((id, changes) => {
    setManualDividends(prev => {
      const updated = prev.map(d => d.id === id ? { ...d, ...changes } : d);
      saveManual(updated);
      return updated;
    });
  }, []);

  // Usuń ręczną dywidendę
  const deleteDividend = useCallback((id) => {
    setManualDividends(prev => {
      const updated = prev.filter(d => d.id !== id);
      saveManual(updated);
      return updated;
    });
  }, []);

  // Wszystkie zdarzenia kalendarza: ręczne (exDate) + auto US
  const allCalendarEvents = [
    ...manualDividends.map(toCalendarEvent),
    ...autoEvents,
  ].sort((a, b) => a.date.localeCompare(b.date));

  return { manualDividends, autoEvents, allCalendarEvents, loading, addDividend, editDividend, deleteDividend };
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-react/src/hooks/useDividendEvents.js
git commit -m "feat(dividends): hook useDividendEvents — localStorage + Finnhub US auto"
```

---

## Task 2: Modal `AddDividendModal.jsx`

**Files:**
- Create: `frontend-react/src/components/AddDividendModal.jsx`

- [ ] **Step 1: Utwórz komponent AddDividendModal.jsx**

Komponent jest kontrolowany z zewnątrz (isOpen, onClose, onSave, initialData dla edycji).

```jsx
import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const EMPTY = { symbol: '', exDate: '', payDate: '', amount: '', currency: 'PLN', note: '' };

export default function AddDividendModal({ isOpen, onClose, onSave, initialData = null }) {
  const { portfolio } = useApp();
  const [form, setForm] = useState(EMPTY);

  // Wypełnij formularz przy edycji
  useEffect(() => {
    if (isOpen) {
      setForm(initialData
        ? { symbol: initialData.symbol, exDate: initialData.exDate, payDate: initialData.payDate ?? '',
            amount: String(initialData.amount ?? ''), currency: initialData.currency ?? 'PLN', note: initialData.note ?? '' }
        : EMPTY
      );
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const symbols = [...new Set(portfolio.map(p => p.symbol))].sort();

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    if (!form.symbol || !form.exDate || !form.amount) return;
    onSave({
      symbol:   form.symbol,
      exDate:   form.exDate,
      payDate:  form.payDate || null,
      amount:   parseFloat(form.amount),
      currency: form.currency,
      note:     form.note.trim(),
    });
    onClose();
  }

  const labelCls = 'block text-xs text-slate-400 mb-1';
  const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-sm mx-4 shadow-2xl">
        {/* Nagłówek */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            {initialData ? 'Edytuj dywidendę' : '➕ Dodaj dywidendę'}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
        </div>

        {/* Formularz */}
        <div className="px-5 py-4 space-y-3">
          {/* Spółka */}
          <div>
            <label className={labelCls}>Spółka</label>
            <select value={form.symbol} onChange={e => set('symbol', e.target.value)} className={inputCls}>
              <option value="">— wybierz —</option>
              {symbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Ex-date */}
          <div>
            <label className={labelCls}>Ex-date *</label>
            <input type="date" value={form.exDate} onChange={e => set('exDate', e.target.value)} className={inputCls} />
          </div>

          {/* Pay-date */}
          <div>
            <label className={labelCls}>Pay-date (opcjonalnie)</label>
            <input type="date" value={form.payDate} onChange={e => set('payDate', e.target.value)} className={inputCls} />
          </div>

          {/* Kwota + waluta */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelCls}>Kwota / akcję *</label>
              <input
                type="number" min="0" step="0.01"
                value={form.amount} onChange={e => set('amount', e.target.value)}
                placeholder="0.00" className={inputCls}
              />
            </div>
            <div className="w-24">
              <label className={labelCls}>Waluta</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)} className={inputCls}>
                {['PLN', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Notatka */}
          <div>
            <label className={labelCls}>Notatka (opcjonalnie)</label>
            <input
              type="text" value={form.note} onChange={e => set('note', e.target.value)}
              placeholder="np. wypłata za 2025" maxLength={120} className={inputCls}
            />
          </div>
        </div>

        {/* Akcje */}
        <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >Anuluj</button>
          <button
            onClick={handleSave}
            disabled={!form.symbol || !form.exDate || !form.amount}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >Zapisz ✓</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-react/src/components/AddDividendModal.jsx
git commit -m "feat(dividends): modal AddDividendModal — ręczne wpisy GPW"
```

---

## Task 3: `server.py` — endpoint `/api/dividends/upcoming`

**Files:**
- Modify: `server.py`

- [ ] **Step 1: Dodaj endpoint Finnhub dla US stocks do `server.py`**

W bloku `do_GET`, tuż przed linią `elif path in ('/', '/index.html', '/myfund.html'):` wstaw:

```python
        elif path.startswith('/api/dividends/upcoming'):
            qs      = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            symbols = [s.strip() for s in qs.get('symbols', '').split(',') if s.strip()]
            token   = os.environ.get('FINNHUB_TOKEN', 'd7uhj69r01qnv95nm3e0d7uhj69r01qnv95nm3eg')
            today   = __import__('datetime').datetime.now().strftime('%Y-%m-%d')
            results = []

            for symbol in symbols:
                # Tylko US stocks (bez przyrostka giełdowego)
                if '.' in symbol:
                    continue
                try:
                    url = f'https://finnhub.io/api/v1/stock/dividend2?symbol={symbol}&token={token}'
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=6) as resp:
                        data = json.loads(resp.read())
                    upcoming = [d for d in data.get('data', []) if (d.get('payDate') or '') >= today]
                    if upcoming:
                        nxt = upcoming[0]
                        results.append({
                            'symbol':   symbol,
                            'exDate':   nxt.get('exDate'),
                            'payDate':  nxt.get('payDate'),
                            'amount':   nxt.get('amount'),
                            'currency': 'USD',
                            'isManual': False,
                        })
                except Exception as e:
                    print(f'[dividends] {symbol}: {e}')

            self.send_json(200, results)
```

- [ ] **Step 2: Zweryfikuj że serwer startuje bez błędów**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && python3 -c "import server; print('OK')"
```

Oczekiwane: `OK` (bez traceback).

- [ ] **Step 3: Commit**

```bash
git add server.py
git commit -m "feat(server): endpoint /api/dividends/upcoming via Finnhub dla US stocks"
```

---

## Task 4: `useCalendarData.js` — usuń fetching dywidend Yahoo Finance

**Files:**
- Modify: `frontend-react/src/hooks/useCalendarData.js`

- [ ] **Step 1: Usuń `DIV_TTL_MS`, funkcję `fetchDividendEvents` i per-symbol div fetching z `fetchAll`**

Zmień linię 5 (usuń `DIV_TTL_MS`):
```js
// PRZED:
const CACHE_TTL_MS  = 6 * 60 * 60 * 1000;  // 6h dla makro
const DIV_TTL_MS    = 60 * 60 * 1000;       // 1h dla dywidend

// PO:
const CACHE_TTL_MS  = 6 * 60 * 60 * 1000;  // 6h dla makro
```

Usuń całą funkcję `fetchDividendEvents` (linie 153–189).

Zmień funkcję `fetchAll` w hooku (usuń div fetching), tak żeby wyglądała tak:

```js
    async function fetchAll() {
      setLoading(true);
      const results = [];

      // 1. Makro (Finnhub live + fallback hardcoded)
      const macroEvents = await fetchMacroEvents();
      results.push(...macroEvents);

      // 2. Earnings per spółka
      if (symbols.length) {
        const earnEvents = await fetchEarningsEvents(symbols);
        results.push(...earnEvents);
      }

      if (!cancelled) {
        setEvents(results.sort((a, b) => a.date.localeCompare(b.date)));
        setLoading(false);
      }
    }
```

Usuń też `fetchProxy` (linie 63–67) — nie jest już używana po usunięciu `fetchDividendEvents`.

- [ ] **Step 2: Commit**

```bash
git add frontend-react/src/hooks/useCalendarData.js
git commit -m "refactor(calendar): usuń Yahoo Finance dividend projection — zastąpione przez useDividendEvents"
```

---

## Task 5: `Calendar.jsx` — połącz useCalendarData + useDividendEvents

**Files:**
- Modify: `frontend-react/src/pages/Calendar.jsx`

- [ ] **Step 1: Zaktualizuj importy i wywołania hooków**

Zmień górę pliku — dodaj import `useDividendEvents`:

```jsx
import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import useCalendarData from '../hooks/useCalendarData';
import useDividendEvents from '../hooks/useDividendEvents';
import Spinner from '../components/shared/Spinner';
```

- [ ] **Step 2: Zaktualizuj blok inicjalizacji w `Calendar()` — złącz oba hooki**

Zmień sekcję z `useCalendarData`:

```jsx
  const { portfolio, loading: appLoading } = useApp();
  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);
  const { events: calEvents, loading: calLoading } = useCalendarData(symbols);
  const { allCalendarEvents: divEvents, loading: divLoading } = useDividendEvents(symbols);

  // Połącz makro+earnings z dywidendami, posortuj po dacie
  const events = useMemo(() =>
    [...calEvents, ...divEvents].sort((a, b) => a.date.localeCompare(b.date)),
    [calEvents, divEvents]
  );
  const loading = calLoading || divLoading;
```

Usuń poprzednią linię `const { events, loading } = useCalendarData(symbols);`.

Pozostała część komponentu używa `events` i `loading` — nie wymaga zmian.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/pages/Calendar.jsx
git commit -m "feat(calendar): połącz useCalendarData + useDividendEvents — ręczne GPW + auto US w kalendarzu"
```

---

## Task 6: `Dividends.jsx` — tabela nadchodzących + baner + modal

**Files:**
- Modify: `frontend-react/src/pages/Dividends.jsx`

- [ ] **Step 1: Zastąp cały plik `Dividends.jsx` poniższym kodem**

```jsx
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import Spinner from '../components/shared/Spinner';
import AddDividendModal from '../components/AddDividendModal';
import useDividendEvents from '../hooks/useDividendEvents';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Dividends() {
  const { transactions, loading, fxRates, portfolio } = useApp();
  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);

  const {
    manualDividends, autoEvents, allCalendarEvents,
    loading: divLoading, addDividend, editDividend, deleteDividend,
  } = useDividendEvents(symbols);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);

  // Nadchodzące dywidendy (ex-date >= dziś)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(() =>
    allCalendarEvents.filter(e => e.date >= today),
    [allCalendarEvents, today]
  );

  // Historia wypłat (transakcje typu DIV)
  const dividends = useMemo(() =>
    [...transactions.filter(t => t.type === 'DIV')]
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );

  const totalPLN = useMemo(() =>
    dividends.reduce((sum, d) =>
      sum + (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1), 0),
    [dividends, fxRates]
  );

  const bySymbol = useMemo(() => {
    const map = {};
    dividends.forEach(d => {
      const key = d.symbol ?? 'INNE';
      if (!map[key]) map[key] = { symbol: key, name: d.name, totalPLN: 0, count: 0 };
      map[key].totalPLN += (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.totalPLN - a.totalPLN);
  }, [dividends, fxRates]);

  function openEdit(div) {
    setEditTarget(div);
    setModalOpen(true);
  }

  function handleSave(formData) {
    if (editTarget) {
      editDividend(editTarget.id, formData);
    } else {
      addDividend(formData);
    }
    setEditTarget(null);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setEditTarget(null);
  }

  if (loading && !transactions.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Baner informacyjny */}
      <div className="rounded-xl border border-blue-800/50 bg-blue-950/30 px-5 py-4 flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-blue-300 leading-relaxed max-w-lg">
          <span className="font-semibold">ℹ️ Daty dywidend GPW</span> (XTB.WA, VOT.WA itp.) są dodawane ręcznie — brak darmowego API dla GPW.
          Daty dla spółek US (NVDA, HOOD itp.) są pobierane automatycznie z Finnhub.
        </p>
        <button
          onClick={() => { setEditTarget(null); setModalOpen(true); }}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          + Dodaj dywidendę GPW
        </button>
      </div>

      {/* Nadchodzące dywidendy */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Nadchodzące dywidendy</h2>
          <div className="flex items-center gap-3">
            {divLoading && <Spinner size="sm" />}
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              className="text-xs px-2.5 py-1 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white transition-colors"
            >+ Dodaj ręcznie</button>
          </div>
        </div>

        {divLoading && !upcoming.length ? (
          <div className="flex justify-center py-8"><Spinner size="md" /></div>
        ) : upcoming.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            Brak nadchodzących dywidend.
            {symbols.some(s => !s.includes('.')) && (
              <span className="block mt-1 text-xs">US stocks: Finnhub może nie mieć danych dla tej spółki.</span>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                  <th className="text-left px-5 py-2.5">Spółka</th>
                  <th className="text-left px-5 py-2.5">Ex-date</th>
                  <th className="text-left px-5 py-2.5">Pay-date</th>
                  <th className="text-right px-5 py-2.5">Kwota</th>
                  <th className="text-left px-5 py-2.5">Źródło</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((ev, i) => {
                  const cur = CUR_SYMBOLS[ev.currency] ?? ev.currency ?? '';
                  return (
                    <tr key={ev.id ?? i} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-100">💰 {ev.symbol}</td>
                      <td className="px-5 py-3 text-slate-300">{ev.date}</td>
                      <td className="px-5 py-3 text-slate-400">{ev.payDate ?? '—'}</td>
                      <td className="px-5 py-3 text-right text-yellow-400 font-semibold">
                        {ev.amount != null ? `${fmt(ev.amount)} ${cur}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {ev.isManual ? '✍️ ręczne' : '🤖 auto'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {ev.isManual && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEdit(manualDividends.find(d => d.id === ev.id))}
                              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                            >Edytuj</button>
                            <button
                              onClick={() => deleteDividend(ev.id)}
                              className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                            >Usuń</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-yellow-800/50 bg-yellow-950/30 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Łącznie dywidendy</p>
          <p className="text-2xl font-bold text-yellow-400">{fmt(totalPLN)} zł</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Liczba wypłat</p>
          <p className="text-2xl font-bold">{dividends.length}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Spółki dywidendowe</p>
          <p className="text-2xl font-bold">{bySymbol.length}</p>
        </div>
      </div>

      {/* Per spółka */}
      {bySymbol.length > 1 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">Dywidendy per spółka</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                  <th className="text-left px-5 py-2.5">Spółka</th>
                  <th className="text-right px-5 py-2.5">Liczba</th>
                  <th className="text-right px-5 py-2.5">Łącznie PLN</th>
                </tr>
              </thead>
              <tbody>
                {bySymbol.map(row => (
                  <tr key={row.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-2.5 font-bold text-slate-100">
                      {row.symbol}
                      {row.name && row.name !== row.symbol && (
                        <span className="ml-2 text-xs text-slate-500 font-normal">{row.name}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right text-slate-400">{row.count}×</td>
                    <td className="px-5 py-2.5 text-right font-semibold text-yellow-400">{fmt(row.totalPLN)} zł</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historia wypłat */}
      {dividends.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Historia wypłat</h2>
            <span className="text-xs text-slate-500">{dividends.length} wpisów</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                  <th className="text-left px-5 py-2.5">Data</th>
                  <th className="text-left px-5 py-2.5">Spółka</th>
                  <th className="text-right px-5 py-2.5">Kwota/akcja</th>
                  <th className="text-right px-5 py-2.5">Ilość</th>
                  <th className="text-right px-5 py-2.5">≈ PLN</th>
                  <th className="text-left px-5 py-2.5">Notatka</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map(d => {
                  const approxPLN = (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1);
                  return (
                    <tr key={d.id ?? d.date + d.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3 text-slate-400">{d.date}</td>
                      <td className="px-5 py-3 font-bold text-slate-100">
                        {d.symbol}
                        {d.name && d.name !== d.symbol && (
                          <span className="ml-2 text-xs text-slate-500 font-normal">{d.name}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right text-yellow-400 font-semibold">
                        {fmt(d.price)} {CUR_SYMBOLS[d.currency] ?? d.currency}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-400">{d.qty ?? '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-200">{fmt(approxPLN)} zł</td>
                      <td className="px-5 py-3 text-slate-500 text-xs">{d.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      <AddDividendModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        initialData={editTarget}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend-react/src/pages/Dividends.jsx
git commit -m "feat(dividends): tabela nadchodzących z źródłem, baner GPW/US, modal dodawania/edycji"
```

---

## Task 7: Build + weryfikacja

- [ ] **Step 1: Zbuduj frontend**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build
```

Oczekiwane: `built in Xs` bez błędów TypeScript/JSX. Ostrzeżenia Vite są OK.

- [ ] **Step 2: Uruchom serwer i sprawdź w przeglądarce**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && python3 server.py
```

Przejdź na `http://localhost:8765/app/dividends` i sprawdź:
- Widoczny baner ℹ️ z przyciskiem "+ Dodaj dywidendę GPW"
- Kliknięcie otwiera modal z dropdown spółek
- Wypełnienie formularza + "Zapisz ✓" dodaje wpis do tabeli
- Kolumna "Źródło" pokazuje ✍️ ręczne dla dodanego wpisu
- Przyciski Edytuj / Usuń działają
- Po przejściu na Kalendarz — żółta kropka na exDate ręcznej dywidendy

- [ ] **Step 3: (Opcjonalnie) Ustaw własny klucz Finnhub**

Jeśli chcesz inny klucz niż domyślny, dodaj do `.env`:
```
FINNHUB_TOKEN=twój_token_z_finnhub.io
```

- [ ] **Step 4: Commit końcowy**

```bash
git add -A
git commit -m "feat(dividends): hybrid GPW manual + US auto — build OK"
```

---

## Podsumowanie zmian

| Plik | Co się zmieniło |
|------|----------------|
| `useDividendEvents.js` (nowy) | localStorage CRUD + fetch /api/dividends/upcoming |
| `AddDividendModal.jsx` (nowy) | Modal z formularzem dla GPW |
| `useCalendarData.js` | Usunięto Yahoo Finance div projection + fetchProxy |
| `Calendar.jsx` | Merguje calEvents + divEvents z obu hooków |
| `Dividends.jsx` | Nowa sekcja nadchodzących, baner, modal, kolumna Źródło |
| `server.py` | Endpoint /api/dividends/upcoming via Finnhub |
