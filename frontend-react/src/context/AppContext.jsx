import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../hooks/useApi';

export const AppContext = createContext(null);

const TOKEN_KEY  = 'myfund_auth_token';
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

  const ACTIVE_PORTFOLIO_KEY = 'myfund_active_portfolio';

  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(
    () => localStorage.getItem(ACTIVE_PORTFOLIO_KEY) || 'all'
  );

  useEffect(() => {
    loadFxRates().then(setFxRates);
  }, []);

  function login(newToken, name) {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(DISPLAY_NAME_KEY, name || '');
    setLoading(true); // prevent premature empty-portfolio modal before fetchData fires
    setToken(newToken);
    setDisplayName(name || '');
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DISPLAY_NAME_KEY);
    setToken(null);
    setRawData(null);
    setDisplayName('');
  }

  const fetchData = useCallback(async () => {
    if (!token) return;
    if (writeInProgressRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const [portfoliosRes, dataRes] = await Promise.all([
        api.get('/api/portfolios'),
        api.get(activePortfolioId === 'all'
          ? '/api/portfolios/all/data'
          : `/api/portfolios/${activePortfolioId}/data`),
      ]);
      setPortfolios(portfoliosRes.data);
      setRawData(dataRes.data);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
      } else if (err.response?.status === 403 && activePortfolioId !== 'all') {
        // stale portfolio id in localStorage — fall back to aggregate view
        switchPortfolio('all');
      } else {
        setError(err.response?.data?.error ?? err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [token, activePortfolioId]);

  useEffect(() => {
    if (token) fetchData();
  }, [token, activePortfolioId, fetchData]);

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

  async function createPortfolio(name, currency) {
    const res = await api.post('/api/portfolios', { name, currency });
    const newP = res.data;
    setPortfolios(prev => [...prev, newP]);
    switchPortfolio(newP.id);
  }

  async function updatePortfolio(id, name, currency) {
    const res = await api.post(`/api/portfolios/${id}`, { name, currency, _method: 'PUT' });
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

  const snapshotsInv = rawData?.snapshotsInvested ?? {};
  const snapshots = rawData?.snapshots
    ? Object.entries(rawData.snapshots)
        .map(([date, total]) => ({ date, total, invested: snapshotsInv[date] ?? null }))
    : [];

  const portfolioInvested = useMemo(() => {
    const holdings = rawData?.portfolio?.holdings ?? [];
    return holdings.reduce((sum, pos) =>
      sum + (pos.qty ?? 0) * (pos.avgPrice ?? 0) * (fxRates[pos.currency] ?? 1),
    0);
  }, [rawData, fxRates]);

  async function saveCash(newCash) {
    setRawData(prev => ({ ...prev, cash: newCash }));
    await api.post(dataUrl, { ...rawData, cash: newCash });
  }

  async function saveHoldings(newHoldings) {
    const updated = { ...rawData, portfolio: { ...rawData.portfolio, holdings: newHoldings } };
    setRawData(updated);
    await api.post(dataUrl, updated);
  }

  async function saveTransactions(newTransactions) {
    const updated = { ...rawData, transactions: newTransactions };
    setRawData(updated);
    await api.post(dataUrl, updated);
  }

  async function editPosition({ symbol, qty, avgPrice }) {
    const holdings = rawData?.portfolio?.holdings ?? [];
    const updated = {
      ...rawData,
      portfolio: {
        ...rawData.portfolio,
        holdings: holdings.map(h => h.symbol === symbol ? { ...h, qty, avgPrice } : h),
      },
    };
    setRawData(updated);
    await api.post(dataUrl, updated);
  }

  async function removePosition(symbol) {
    const holdings = rawData?.portfolio?.holdings ?? [];
    const updated = {
      ...rawData,
      portfolio: { ...rawData.portfolio, holdings: holdings.filter(h => h.symbol !== symbol) },
    };
    setRawData(updated);
    await api.post(dataUrl, updated);
  }

  async function sellPosition({ symbol, qty, price, currency, date, note }) {
    const holdings = rawData?.portfolio?.holdings ?? [];
    const transactions = rawData?.transactions ?? [];
    const existing = holdings.find(h => h.symbol === symbol);
    if (!existing) throw new Error('Nie znaleziono pozycji');
    const newQty = existing.qty - qty;
    const newHoldings = newQty <= 0
      ? holdings.filter(h => h.symbol !== symbol)
      : holdings.map(h => h.symbol === symbol ? { ...h, qty: newQty } : h);
    const updated = {
      ...rawData,
      portfolio: { ...rawData.portfolio, holdings: newHoldings },
      transactions: [...transactions, {
        id: Math.random().toString(36).slice(2, 10),
        type: 'SELL', symbol, qty, price, currency, date, note,
      }],
    };
    setRawData(updated);
    await api.post(dataUrl, updated);
  }

  async function addPosition({ symbol, qty, price, currency, date, note, funding }) {
    const holdings = rawData?.portfolio?.holdings ?? [];
    const transactions = rawData?.transactions ?? [];
    const cash = rawData?.cash ?? {};

    // Update holding (weighted average if exists)
    let newHoldings;
    const existing = holdings.find(h => h.symbol === symbol);
    if (existing) {
      newHoldings = holdings.map(h => {
        if (h.symbol !== symbol) return h;
        const newQty = h.qty + qty;
        const newAvg = (h.qty * h.avgPrice + qty * price) / newQty;
        return { ...h, qty: newQty, avgPrice: newAvg };
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
      ...rawData,
      portfolio: { ...rawData.portfolio, holdings: newHoldings },
      transactions: [...transactions, newTransaction],
      cash: newCash,
    };
    setRawData(updated);
    await api.post(dataUrl, updated);
  }

  async function importBrokerTransactions(newTxs) {
    const holdings = rawData?.portfolio?.holdings ?? [];
    const importId = `imp_${Date.now()}`;
    const tagged = newTxs.map(t => ({ ...t, importId }));
    const allTransactions = [...(rawData?.transactions ?? []), ...tagged];

    // Normalize symbol for matching: strip exchange suffixes so XTB.PL matches XTB.WA
    function baseSymbol(sym) {
      return String(sym).replace(/\.(WA|PL|US|UK|DE|FR|NL|IT|ES|SE|DK|NO|FI|BE|AT|CH)$/i, '').toUpperCase();
    }
    function findHolding(arr, symbol) {
      return arr.findIndex(h => h.symbol === symbol || baseSymbol(h.symbol) === baseSymbol(symbol));
    }

    let newHoldings = [...holdings];
    let newCash = { ...(rawData?.cash ?? {}) };
    const sorted = [...tagged].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    for (const tx of sorted) {
      if (!tx.qty || tx.qty <= 0) continue;
      const cur = tx.currency || 'PLN';

      if (tx.type === 'BUY') {
        const idx = findHolding(newHoldings, tx.symbol);
        if (idx >= 0 && !tx.fromClosedPosition) {
          const h = newHoldings[idx];
          const newQty = h.qty + tx.qty;
          const newAvg = (h.qty * h.avgPrice + tx.qty * tx.price) / newQty;
          newHoldings = newHoldings.map((h2, i) => i === idx ? { ...h2, qty: newQty, avgPrice: newAvg } : h2);
        } else if (idx < 0) {
          newHoldings = [...newHoldings, {
            id: Math.random().toString(36).slice(2, 10),
            symbol: tx.symbol, qty: tx.qty, avgPrice: tx.price,
            currency: cur, date: tx.date, name: '',
          }];
        }
        // fromClosedPosition BUY for existing position: skip (SELL will reduce it)
      } else if (tx.type === 'SELL') {
        const idx = findHolding(newHoldings, tx.symbol);
        if (idx >= 0) {
          const newQty = newHoldings[idx].qty - tx.qty;
          newHoldings = newQty <= 0
            ? newHoldings.filter((_, i) => i !== idx)
            : newHoldings.map((h2, i) => i === idx ? { ...h2, qty: newQty } : h2);
        }
        // Add sale proceeds to cash
        newCash = { ...newCash, [cur]: (newCash[cur] ?? 0) + tx.qty * tx.price };
      }
    }

    // Snapshot pre-import state so undo can fully revert
    const preSnapshot = {
      holdings: JSON.parse(JSON.stringify(rawData?.portfolio?.holdings ?? [])),
      cash: JSON.parse(JSON.stringify(rawData?.cash ?? {})),
    };

    const updated = {
      ...rawData,
      portfolio: { ...rawData.portfolio, holdings: newHoldings },
      transactions: allTransactions,
      cash: newCash,
      importSnapshots: { ...(rawData.importSnapshots ?? {}), [importId]: preSnapshot },
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
    const filtered = (rawData?.transactions ?? []).filter(t =>
      importId ? t.importId !== importId : !String(t.note ?? '').startsWith('Import brokera')
    );

    // Restore pre-import snapshot if available (fully reverts portfolio + cash)
    const snapshots = { ...(rawData.importSnapshots ?? {}) };
    let restoredHoldings = rawData?.portfolio?.holdings;
    let restoredCash = rawData?.cash;
    if (importId && snapshots[importId]) {
      restoredHoldings = snapshots[importId].holdings;
      restoredCash = snapshots[importId].cash;
      delete snapshots[importId];
    }

    const updated = {
      ...rawData,
      portfolio: { ...rawData.portfolio, holdings: restoredHoldings },
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
    const newSnapshots = { ...(rawData?.snapshots ?? {}) };
    const newSnapshotsInv = { ...(rawData?.snapshotsInvested ?? {}) };
    delete newSnapshots[date];
    delete newSnapshotsInv[date];
    const updated = { ...rawData, snapshots: newSnapshots, snapshotsInvested: newSnapshotsInv };
    setRawData(updated);
    await api.post(dataUrl, updated);
  }

  async function setSnapshot(date, totalValue, investedValue) {
    const updated = {
      ...rawData,
      snapshots: { ...(rawData.snapshots ?? {}), [date]: totalValue },
      snapshotsInvested: { ...(rawData.snapshotsInvested ?? {}), [date]: investedValue },
    };
    setRawData(updated);
    await api.post(dataUrl, updated);
  }

  async function saveSnapshot(totalValue, investedValue) {
    const today = new Date().toISOString().slice(0, 10);
    const updated = {
      ...rawData,
      snapshots: { ...(rawData.snapshots ?? {}), [today]: totalValue },
      snapshotsInvested: { ...(rawData.snapshotsInvested ?? {}), [today]: investedValue },
    };
    setRawData(updated);
    await api.post(dataUrl, updated);
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
    loading,
    error,
    refresh: fetchData,
    fxRates,
    invested: portfolioInvested,
    saveCash,
    saveHoldings,
    saveTransactions,
    saveSnapshot,
    setSnapshot,
    deleteSnapshot,
    addPosition,
    editPosition,
    removePosition,
    sellPosition,
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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp musi być użyty wewnątrz AppProvider');
  return ctx;
}
