import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../hooks/useApi';
import { resetJournalCache } from '../services/journalService';
import { migratePortfolioAlertsOnce } from '../services/watchlistService';
import { weightedAvg } from '../utils/weightedAvg.js';

export const AppContext = createContext(null);

const TOKEN_KEY  = 'myfund_auth_token';
const DEMO_KEY   = 'myfund_demo';
const AUTH_NOTICE_KEY = 'myfund_auth_notice';
const FX_CACHE_KEY = 'myfund_fx_rates';
const FX_PERSIST_KEY = 'myfund_fx_last';
const FX_CACHE_TTL = 30 * 60 * 1000; // 30 min
const FX_FALLBACK  = { PLN: 1, USD: 3.62, EUR: 4.24, GBP: 4.91 };
const DISPLAY_NAME_KEY = 'myfund_display_name';

async function loadFxRates() {
  try {
    const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || 'null');
    if (cached?.ts && Date.now() - cached.ts < FX_CACHE_TTL) return cached.rates;
  } catch {}
  try {
    const res = await fetch('/api/fx', { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const r = data.rates;
    if (!r?.PLN) throw new Error('no PLN in response');
    const rates = { PLN: 1, USD: r.PLN, EUR: r.PLN / r.EUR, GBP: r.PLN / r.GBP };
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ ts: Date.now(), rates }));
    localStorage.setItem(FX_PERSIST_KEY, JSON.stringify({ rates }));
    return rates;
  } catch (e) {
    console.warn('[fx] fetch failed, using fallback:', e.message);
    try {
      const persisted = JSON.parse(localStorage.getItem(FX_PERSIST_KEY) || 'null');
      if (persisted?.rates) return persisted.rates;
    } catch {}
    return FX_FALLBACK;
  }
}

export function AppProvider({ children }) {
  const [token, setToken]           = useState(() => localStorage.getItem(TOKEN_KEY));
  const [displayName, setDisplayName] = useState(() => localStorage.getItem(DISPLAY_NAME_KEY) || '');
  const [rawData, setRawData]       = useState(null);
  const [loading, setLoading]       = useState(() => !!localStorage.getItem(TOKEN_KEY));
  const [error, setError]           = useState(null);
  const [fxRates, setFxRates]       = useState(FX_FALLBACK);
  const [logoMap, setLogoMap]       = useState({});
  const writeInProgressRef          = useRef(false);
  const fetchIdRef                  = useRef(0);
  // Mirrors rawData, always current regardless of which render a callback's closure
  // came from — write functions read this instead of the `rawData` variable directly,
  // so a callback bound to a stale render (e.g. an async handler that resolves after
  // rawData has since updated) can never spread an outdated snapshot into a write.
  const rawDataRef                  = useRef(null);
  rawDataRef.current = rawData;

  const ACTIVE_PORTFOLIO_KEY = 'myfund_active_portfolio';

  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(
    () => localStorage.getItem(ACTIVE_PORTFOLIO_KEY) || 'all'
  );
  // True only while we have old localStorage alerts that still need to be merged
  // into the server watchlist — gates Watchlist.jsx's autosave and Portfolio's
  // "Ustaw alert" button so they can't race the migration write.
  const [watchlistMigrationPending, setWatchlistMigrationPending] = useState(
    () => !!localStorage.getItem('myfund_price_alerts')
          && !localStorage.getItem('myfund_alerts_migrated_v1')
          && localStorage.getItem('myfund_demo') !== '1'
  );

  useEffect(() => {
    loadFxRates().then(setFxRates);
    fetch('/api/keepalive').catch(() => {});
  }, []);

  function login(newToken, name, opts = {}) {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(DISPLAY_NAME_KEY, name || '');
    if (opts.demo) localStorage.setItem(DEMO_KEY, '1');
    else localStorage.removeItem(DEMO_KEY);
    resetJournalCache();
    setLoading(true); // prevent premature empty-portfolio modal before fetchData fires
    setToken(newToken);
    setDisplayName(name || '');
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DISPLAY_NAME_KEY);
    localStorage.removeItem(DEMO_KEY);
    resetJournalCache();
    setToken(null);
    setRawData(null);
    setDisplayName('');
  }

  // 401 = session gone (Render free tier restarts wipe in-memory sessions).
  // Demo sessions are restarted silently; real users land on the login screen
  // with a notice instead of being logged out without explanation.
  const demoRestartRef = useRef(false);
  async function handleUnauthorized() {
    if (localStorage.getItem(DEMO_KEY) === '1') {
      if (demoRestartRef.current) return;
      demoRestartRef.current = true;
      try {
        const res = await api.post('/api/demo', {});
        login(res.data.token, res.data.display_name, { demo: true });
        return;
      } catch {
        sessionStorage.setItem(AUTH_NOTICE_KEY, 'demo_expired');
      } finally {
        demoRestartRef.current = false;
      }
    } else {
      sessionStorage.setItem(AUTH_NOTICE_KEY, 'session_expired');
    }
    logout();
  }

  // Auto-logout on any 401 from write operations (e.g. backend session cleared after restart)
  useEffect(() => {
    const id = api.interceptors.response.use(
      r => r,
      err => {
        if (err.response?.status === 401 && err.config?.url !== '/api/demo') handleUnauthorized();
        return Promise.reject(err);
      }
    );
    return () => api.interceptors.response.eject(id);
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;
    if (writeInProgressRef.current) return;
    // Guard against out-of-order responses: if activePortfolioId changes while a
    // fetch is in flight, an older (e.g. "all") request can resolve AFTER a newer
    // one and overwrite rawData with the wrong portfolio's data. Only the response
    // matching the most recently started fetch is applied.
    const myFetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [portfoliosRes, dataRes] = await Promise.all([
        api.get('/api/portfolios'),
        api.get(activePortfolioId === 'all'
          ? '/api/portfolios/all/data'
          : `/api/portfolios/${activePortfolioId}/data`),
      ]);
      if (myFetchId !== fetchIdRef.current) return; // stale response, ignore
      setPortfolios(portfoliosRes.data);
      setRawData(dataRes.data);
    } catch (err) {
      if (myFetchId !== fetchIdRef.current) return; // stale error, ignore
      if (err.response?.status === 401) {
        handleUnauthorized();
      } else if (err.response?.status === 403 && activePortfolioId !== 'all') {
        // stale portfolio id in localStorage — fall back to aggregate view
        switchPortfolio('all');
      } else {
        setError(err.response?.data?.error ?? err.message);
      }
    } finally {
      if (myFetchId === fetchIdRef.current) setLoading(false);
    }
  }, [token, activePortfolioId]);

  useEffect(() => {
    if (token) fetchData();
  }, [token, activePortfolioId, fetchData]);

  // Jednorazowa migracja starych localStorage-owych alertów z Portfela
  // do watchlisty (backend jako single source of truth).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try { await migratePortfolioAlertsOnce(); } catch {}
      finally { if (!cancelled) setWatchlistMigrationPending(false); }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Fetch company logos for all portfolio symbols after data loads
  useEffect(() => {
    const holdings = rawData?.portfolio?.holdings ?? [];
    if (!token || !holdings.length) return;
    const symbols = [...new Set(holdings.map(h => h.symbol))];
    const missing = symbols.filter(s => !(s in logoMap));
    if (!missing.length) return;
    api.get(`/api/logos?symbols=${missing.join(',')}`)
      .then(res => setLogoMap(prev => ({ ...prev, ...res.data })))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawData, token]);

  function switchPortfolio(id) {
    localStorage.setItem(ACTIVE_PORTFOLIO_KEY, id);
    setActivePortfolioId(id);
  }

  async function createPortfolio(name, currency, accountType = '') {
    const res = await api.post('/api/portfolios', { name, currency, account_type: accountType });
    const newP = res.data;
    setPortfolios(prev => [...prev, newP]);
    switchPortfolio(newP.id);
  }

  async function updatePortfolio(id, name, currency, accountType = '') {
    const res = await api.post(`/api/portfolios/${id}`, { name, currency, account_type: accountType, _method: 'PUT' });
    setPortfolios(prev => prev.map(p => p.id === id ? res.data : p));
  }

  async function deletePortfolio(id) {
    await api.post(`/api/portfolios/${id}`, { _method: 'DELETE' });
    setPortfolios(prev => {
      const next = prev.filter(p => p.id !== id);
      if (activePortfolioId === id) switchPortfolio(next[0]?.id || 'all');
      return next;
    });
  }

  const dataUrl = activePortfolioId === 'all'
    ? '/api/portfolios/all/data'
    : `/api/portfolios/${activePortfolioId}/data`;
  const canWrite = activePortfolioId !== 'all';

  // Guards against writing while rawData hasn't loaded yet (e.g. slow/cold backend on
  // first page load) — spreading `{ ...null, ... }` silently drops every other field,
  // wiping the portfolio record instead of throwing. Every write function must call
  // this before touching rawData.
  function assertLoaded() {
    if (!rawDataRef.current) throw new Error('Dane portfela jeszcze się nie załadowały — spróbuj ponownie za chwilę.');
  }

  // Single choke point for all writes: blocks fetchData() from running (and clobbering
  // rawData with a fetch that started before this write finished) for the entire
  // optimistic-update + POST round trip, not just around the network call.
  async function postUpdate(updated) {
    writeInProgressRef.current = true;
    try {
      setRawData(updated);
      await api.post(dataUrl, updated);
    } finally {
      writeInProgressRef.current = false;
    }
  }

  const snapshotsInv = rawData?.snapshotsInvested ?? {};
  const snapshotsFx = rawData?.snapshotsFx ?? {};
  const snapshots = rawData?.snapshots
    ? Object.entries(rawData.snapshots)
        .map(([date, total]) => ({
          date, total,
          invested: snapshotsInv[date] ?? null,
          fx: snapshotsFx[date] ?? null,
        }))
    : [];

  const portfolioInvested = useMemo(() => {
    const holdings = rawData?.portfolio?.holdings ?? [];
    return holdings.reduce((sum, pos) =>
      sum + (pos.qty ?? 0) * (pos.avgPrice ?? 0) * (fxRates[pos.currency] ?? 1),
    0);
  }, [rawData, fxRates]);

  async function saveCash(newCash) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby zapisać zmiany');
    assertLoaded();
    await postUpdate({ ...rawDataRef.current, cash: newCash });
  }

  async function saveHoldings(newHoldings) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby zapisać zmiany');
    assertLoaded();
    const rd = rawDataRef.current;
    const updated = { ...rd, portfolio: { ...rd.portfolio, holdings: newHoldings } };
    await postUpdate(updated);
  }

  // Accepts either a full array or an updater `(prevTransactions) => nextTransactions`
  // (mirrors setState's functional-update form). Callers that spread an array they
  // read earlier (e.g. `[...transactions, newTx]` from a component's own render
  // closure) can end up posting a stale snapshot if that closure is older than the
  // latest rawData — passing an updater instead always derives from rawDataRef.current
  // at the moment this actually runs, closing that gap regardless of caller staleness.
  async function saveTransactions(newTransactionsOrFn) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby dodać transakcję');
    assertLoaded();
    const rd = rawDataRef.current;
    const newTransactions = typeof newTransactionsOrFn === 'function'
      ? newTransactionsOrFn(rd.transactions ?? [])
      : newTransactionsOrFn;
    const updated = { ...rd, transactions: newTransactions };
    await postUpdate(updated);
  }

  async function renameSymbol(oldSymbol, newSymbol) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby zmienić symbol');
    assertLoaded();
    const rd = rawDataRef.current;
    const holdings = rd?.portfolio?.holdings ?? [];
    const src = holdings.find(h => h.symbol === oldSymbol);
    const dst = holdings.find(h => h.symbol === newSymbol);

    let newHoldings;
    if (src && dst) {
      // Target already exists — merge: weighted avg price, summed qty
      const mergedAvg = weightedAvg(dst.qty, dst.avgPrice, src.qty, src.avgPrice);
      newHoldings = holdings
        .filter(h => h.symbol !== oldSymbol)
        .map(h => h.symbol === newSymbol ? { ...h, qty: dst.qty + src.qty, avgPrice: mergedAvg } : h);
    } else {
      newHoldings = holdings.map(h =>
        h.symbol === oldSymbol ? { ...h, symbol: newSymbol } : h
      );
    }

    const newTxs = (rd?.transactions ?? []).map(t =>
      t.symbol === oldSymbol ? { ...t, symbol: newSymbol } : t
    );
    const updated = { ...rd, portfolio: { ...rd.portfolio, holdings: newHoldings }, transactions: newTxs };
    await postUpdate(updated);
  }

  async function editPosition({ symbol, qty, avgPrice }) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby edytować pozycję');
    assertLoaded();
    const rd = rawDataRef.current;
    const holdings = rd?.portfolio?.holdings ?? [];
    const updated = {
      ...rd,
      portfolio: {
        ...rd.portfolio,
        holdings: holdings.map(h => h.symbol === symbol ? { ...h, qty, avgPrice } : h),
      },
    };
    await postUpdate(updated);
  }

  async function removePosition(symbol) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby usunąć pozycję');
    assertLoaded();
    const rd = rawDataRef.current;
    const holdings = rd?.portfolio?.holdings ?? [];
    const updated = {
      ...rd,
      portfolio: { ...rd.portfolio, holdings: holdings.filter(h => h.symbol !== symbol) },
    };
    await postUpdate(updated);
  }

  async function sellPosition({ symbol, qty, price, currency, date, note, overridePL }) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby sprzedać pozycję');
    assertLoaded();
    const rd = rawDataRef.current;
    const holdings = rd?.portfolio?.holdings ?? [];
    const transactions = rd?.transactions ?? [];
    const existing = holdings.find(h => h.symbol === symbol);
    if (!existing) throw new Error('Nie znaleziono pozycji');
    const newQty = existing.qty - qty;
    const newHoldings = newQty <= 0
      ? holdings.filter(h => h.symbol !== symbol)
      : holdings.map(h => h.symbol === symbol ? { ...h, qty: newQty } : h);
    const txId = Math.random().toString(36).slice(2, 10);
    const updated = {
      ...rd,
      portfolio: { ...rd.portfolio, holdings: newHoldings },
      transactions: [...transactions, {
        id: txId,
        type: 'SELL', symbol, qty, price, currency, date, note,
        costBasis: existing.avgPrice,
        ...(overridePL != null ? { overridePL } : {}),
      }],
    };
    await postUpdate(updated);
    return txId;
  }

  async function addPosition({ symbol, qty, price, currency, date, note, funding, assetType }) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby dodać pozycję');
    assertLoaded();
    const rd = rawDataRef.current;
    const holdings = rd?.portfolio?.holdings ?? [];
    const transactions = rd?.transactions ?? [];
    const cash = rd?.cash ?? {};

    // Update holding (weighted average if exists)
    let newHoldings;
    const existing = holdings.find(h => h.symbol === symbol);
    if (existing) {
      newHoldings = holdings.map(h => {
        if (h.symbol !== symbol) return h;
        return { ...h, qty: h.qty + qty, avgPrice: weightedAvg(h.qty, h.avgPrice, qty, price) };
      });
    } else {
      newHoldings = [...holdings, {
        id: Math.random().toString(36).slice(2, 10),
        symbol,
        qty,
        avgPrice: price,
        currency,
        date,
        name: '',
        ...(assetType ? { assetType } : {}),
      }];
    }

    // Add BUY transaction
    const newTransaction = {
      id: Math.random().toString(36).slice(2, 10),
      type: 'BUY',
      symbol,
      qty,
      price,
      currency,
      date,
      note,
    };

    // Optionally subtract from cash
    let newCash = cash;
    if (funding === 'cash') {
      const spent = qty * price;
      newCash = { ...cash, [currency]: Math.max(0, (cash[currency] ?? 0) - spent) };
    }

    const updated = {
      ...rd,
      portfolio: { ...rd.portfolio, holdings: newHoldings },
      transactions: [...transactions, newTransaction],
      cash: newCash,
    };
    await postUpdate(updated);
  }

  async function importBrokerTransactions(newTxs) {
    assertLoaded();
    const rd = rawDataRef.current;
    const importId = `imp_${Date.now()}`;
    const tagged = newTxs.map(t => ({ ...t, importId }));

    // Normalize symbol for matching: strip exchange suffixes so XTB.PL matches XTB.WA
    function baseSymbol(sym) {
      return String(sym).replace(/\.(WA|PL|US|UK|DE|FR|NL|IT|ES|SE|DK|NO|FI|BE|AT|CH)$/i, '').toUpperCase();
    }
    function findHolding(arr, symbol) {
      return arr.findIndex(h => h.symbol === symbol || baseSymbol(h.symbol) === baseSymbol(symbol));
    }

    // For snapshot imports: auto-replace any existing snapshot for the same date.
    // Restores portfolio to the state before the earliest old import for that date,
    // so re-importing the same quarter never stacks on top of old data.
    const isSnapshot = newTxs.length > 0 && newTxs.every(t => t.fromSnapshot);
    const snapshotDate = isSnapshot ? newTxs[0]?.date : null;

    let baseTransactions = rd?.transactions ?? [];
    let baseHoldings = rd?.portfolio?.holdings ?? [];
    let baseCash = rd?.cash ?? {};
    let baseSnapshots = { ...(rd?.importSnapshots ?? {}) };

    if (isSnapshot && snapshotDate) {
      const oldIds = [...new Set(
        baseTransactions
          .filter(t => t.fromSnapshot && t.date === snapshotDate && t.importId)
          .map(t => t.importId)
      )].sort(); // chronological (imp_<timestamp>)

      if (oldIds.length > 0) {
        // Restore to the state before the earliest old snapshot import
        const earliestId = oldIds[0];
        if (baseSnapshots[earliestId]) {
          baseHoldings = baseSnapshots[earliestId].holdings;
          baseCash = baseSnapshots[earliestId].cash;
        }
        // Remove all old snapshot transactions and their undo-snapshots for this date
        baseTransactions = baseTransactions.filter(t => !oldIds.includes(t.importId));
        oldIds.forEach(id => delete baseSnapshots[id]);
      }
    }

    const allTransactions = [...baseTransactions, ...tagged];
    let newHoldings = [...baseHoldings];
    let newCash = { ...baseCash };
    const sorted = [...tagged].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Cash adjust w tym samym warunku dla BUY i SELL:
    // - fromClosedPosition: cash-flow już policzony z arkusza Cash Operations
    // - skipCashAdjust: świadomy opt-out (broker historical dump)
    // - fromSnapshot: replace stanu, snapshot ma własną gotówkę
    const affectsCash = tx => !tx.fromClosedPosition && !tx.skipCashAdjust && !tx.fromSnapshot;

    for (const tx of sorted) {
      if (!tx.qty || tx.qty <= 0) continue;
      const cur = tx.currency || 'PLN';

      if (tx.type === 'BUY') {
        const idx = findHolding(newHoldings, tx.symbol);
        if (idx >= 0 && !tx.fromClosedPosition) {
          const h = newHoldings[idx];
          if (tx.fromSnapshot) {
            // Snapshot = authoritative state: replace holding entirely (avoids mixing currencies / stale symbols)
            newHoldings = newHoldings.map((h2, i) => i === idx ? { ...h2, symbol: tx.symbol, qty: tx.qty, avgPrice: tx.price, currency: cur } : h2);
          } else {
            const newAvg = weightedAvg(h.qty, h.avgPrice, tx.qty, tx.price);
            newHoldings = newHoldings.map((h2, i) => i === idx ? { ...h2, qty: h.qty + tx.qty, avgPrice: newAvg } : h2);
          }
        } else if (idx < 0) {
          newHoldings = [...newHoldings, {
            id: Math.random().toString(36).slice(2, 10),
            symbol: tx.symbol, qty: tx.qty, avgPrice: tx.price,
            currency: cur, date: tx.date, name: '',
          }];
        }
        // Zdejmij środki na zakup (symetrycznie do SELL).
        // fromClosedPosition BUY: nie ruszaj holdings (SELL zredukuje), ale
        // też nie ruszaj cash — cash-flow wynika z Cash Ops, nie z Closed Pos.
        if (affectsCash(tx)) {
          newCash = { ...newCash, [cur]: (newCash[cur] ?? 0) - tx.qty * tx.price };
        }
      } else if (tx.type === 'SELL') {
        const idx = findHolding(newHoldings, tx.symbol);
        if (idx >= 0) {
          const newQty = newHoldings[idx].qty - tx.qty;
          newHoldings = newQty <= 0
            ? newHoldings.filter((_, i) => i !== idx)
            : newHoldings.map((h2, i) => i === idx ? { ...h2, qty: newQty } : h2);
        }
        if (affectsCash(tx)) {
          newCash = { ...newCash, [cur]: (newCash[cur] ?? 0) + tx.qty * tx.price };
        }
      }
    }

    // Snapshot pre-import state so undo can fully revert
    const preSnapshot = {
      holdings: JSON.parse(JSON.stringify(baseHoldings)),
      cash: JSON.parse(JSON.stringify(baseCash)),
    };

    const updated = {
      ...rd,
      portfolio: { ...rd.portfolio, holdings: newHoldings },
      transactions: allTransactions,
      cash: newCash,
      importSnapshots: { ...baseSnapshots, [importId]: preSnapshot },
    };

    writeInProgressRef.current = true;
    try {
      await api.post(dataUrl, updated); // save first — state only updates after confirmed save
      setRawData(updated);
    } finally {
      writeInProgressRef.current = false;
    }
  }

  async function clearBrokerImport(importId) {
    assertLoaded();
    const rd = rawDataRef.current;
    const filtered = (rd?.transactions ?? []).filter(t =>
      importId ? t.importId !== importId : !String(t.note ?? '').startsWith('Import brokera')
    );

    // Restore pre-import snapshot if available (fully reverts portfolio + cash)
    const snapshots = { ...(rd.importSnapshots ?? {}) };
    let restoredHoldings = rd?.portfolio?.holdings;
    let restoredCash = rd?.cash;
    if (importId && snapshots[importId]) {
      restoredHoldings = snapshots[importId].holdings;
      restoredCash = snapshots[importId].cash;
      delete snapshots[importId];
    }

    const updated = {
      ...rd,
      portfolio: { ...rd.portfolio, holdings: restoredHoldings },
      transactions: filtered,
      cash: restoredCash,
      importSnapshots: snapshots,
    };

    writeInProgressRef.current = true;
    try {
      await api.post(dataUrl, updated); // save first
      setRawData(updated);
    } finally {
      writeInProgressRef.current = false;
    }
  }

  async function deleteSnapshot(date) {
    assertLoaded();
    const rd = rawDataRef.current;
    const newSnapshots = { ...(rd?.snapshots ?? {}) };
    const newSnapshotsInv = { ...(rd?.snapshotsInvested ?? {}) };
    delete newSnapshots[date];
    delete newSnapshotsInv[date];
    const updated = { ...rd, snapshots: newSnapshots, snapshotsInvested: newSnapshotsInv };
    await postUpdate(updated);
  }

  async function setSnapshot(date, totalValue, investedValue, fxSnapshot) {
    assertLoaded();
    const rd = rawDataRef.current;
    const updated = {
      ...rd,
      snapshots: { ...(rd.snapshots ?? {}), [date]: totalValue },
      snapshotsInvested: { ...(rd.snapshotsInvested ?? {}), [date]: investedValue },
      snapshotsFx: fxSnapshot
        ? { ...(rd.snapshotsFx ?? {}), [date]: fxSnapshot }
        : (rd.snapshotsFx ?? {}),
    };
    await postUpdate(updated);
  }

  async function saveSnapshot(totalValue, investedValue, fxSnapshot) {
    if (!canWrite) return; // "all" view cannot save directly — use saveBatchSnapshots instead
    assertLoaded();
    const rd = rawDataRef.current;
    const today = new Date().toISOString().slice(0, 10);
    // Zamrażamy kursy dnia razem ze snapshotem — inaczej historyczne
    // wartości pływałyby z aktualnym kursem NBP (widoczna wartość invested
    // zmieniałaby się mimo braku transakcji, patrz PR #15).
    const updated = {
      ...rd,
      snapshots: { ...(rd.snapshots ?? {}), [today]: totalValue },
      snapshotsInvested: { ...(rd.snapshotsInvested ?? {}), [today]: investedValue },
      snapshotsFx: fxSnapshot
        ? { ...(rd.snapshotsFx ?? {}), [today]: fxSnapshot }
        : (rd.snapshotsFx ?? {}),
    };
    await postUpdate(updated);
  }

  async function saveBatchSnapshots(snapshotsMap) {
    // snapshotsMap: {portfolioId: {total, invested, fx?}}
    await api.post('/api/portfolios/save-snapshots', snapshotsMap);
  }

  async function addOtherAsset({ name, category, value: val, currency, note }) {
    assertLoaded();
    const rd = rawDataRef.current;
    const assets = rd?.otherAssets ?? [];
    const newAsset = {
      id: Math.random().toString(36).slice(2, 10),
      name, category, value: parseFloat(val), currency,
      note: note || '',
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    const updated = { ...rd, otherAssets: [...assets, newAsset] };
    await postUpdate(updated);
  }

  async function editOtherAsset(id, changes) {
    assertLoaded();
    const rd = rawDataRef.current;
    const assets = rd?.otherAssets ?? [];
    const updated = {
      ...rd,
      otherAssets: assets.map(a => a.id === id ? { ...a, ...changes, updatedAt: new Date().toISOString().slice(0, 10) } : a),
    };
    await postUpdate(updated);
  }

  async function deleteOtherAsset(id) {
    assertLoaded();
    const rd = rawDataRef.current;
    const assets = rd?.otherAssets ?? [];
    const updated = { ...rd, otherAssets: assets.filter(a => a.id !== id) };
    await postUpdate(updated);
  }

  async function addBond({ type, name, purchaseDate, count, firstYearRate, margin }) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby zapisać zmiany');
    assertLoaded();
    const rd = rawDataRef.current;
    const bonds = rd?.bonds ?? [];
    const newBond = {
      id: Math.random().toString(36).slice(2, 10),
      type, name, purchaseDate,
      count: parseInt(count, 10) || 0,
      firstYearRate: parseFloat(firstYearRate) || 0,
      margin: parseFloat(margin) || 0,
    };
    const updated = { ...rd, bonds: [...bonds, newBond] };
    await postUpdate(updated);
  }

  async function editBond(id, changes) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby zapisać zmiany');
    assertLoaded();
    const rd = rawDataRef.current;
    const bonds = rd?.bonds ?? [];
    const updated = { ...rd, bonds: bonds.map(b => b.id === id ? { ...b, ...changes } : b) };
    await postUpdate(updated);
  }

  async function deleteBond(id) {
    if (!canWrite) throw new Error('Wybierz konkretny portfel, aby zapisać zmiany');
    assertLoaded();
    const rd = rawDataRef.current;
    const bonds = rd?.bonds ?? [];
    const updated = { ...rd, bonds: bonds.filter(b => b.id !== id) };
    await postUpdate(updated);
  }

  const value = {
    isAuthenticated: !!token,
    displayName,
    login,
    logout,
    portfolio:    rawData?.portfolio?.holdings ?? [],
    transactions: rawData?.transactions ?? [],
    snapshots,
    cash:         rawData?.cash ?? {},
    otherAssets:  rawData?.otherAssets ?? [],
    bonds:        rawData?.bonds ?? [],
    loading,
    error,
    refresh: fetchData,
    fxRates,
    invested: portfolioInvested,
    saveCash,
    saveHoldings,
    saveTransactions,
    saveSnapshot,
    saveBatchSnapshots,
    setSnapshot,
    deleteSnapshot,
    addPosition,
    editPosition,
    removePosition,
    sellPosition,
    renameSymbol,
    importBrokerTransactions,
    clearBrokerImport,
    portfolios,
    activePortfolioId,
    activePortfolio: portfolios.find(p => p.id === activePortfolioId) || null,
    displayCurrency: portfolios.find(p => p.id === activePortfolioId)?.currency || 'PLN',
    switchPortfolio,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
    canWrite,
    logoMap,
    addOtherAsset,
    editOtherAsset,
    deleteOtherAsset,
    addBond,
    editBond,
    deleteBond,
    watchlistMigrationPending,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp musi być użyty wewnątrz AppProvider');
  return ctx;
}
