import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../hooks/useApi';

const AppContext = createContext(null);

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
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [fxRates, setFxRates]       = useState(FX_FALLBACK);

  useEffect(() => {
    loadFxRates().then(setFxRates);
  }, []);

  function login(newToken, name) {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(DISPLAY_NAME_KEY, name || '');
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
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/data');
      setRawData(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        logout();
      } else {
        setError(err.response?.data?.error ?? err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) fetchData();
  }, [token]);

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
    await api.post('/api/data', { ...rawData, cash: newCash });
  }

  async function saveHoldings(newHoldings) {
    const updated = { ...rawData, portfolio: { ...rawData.portfolio, holdings: newHoldings } };
    setRawData(updated);
    await api.post('/api/data', updated);
  }

  async function saveTransactions(newTransactions) {
    const updated = { ...rawData, transactions: newTransactions };
    setRawData(updated);
    await api.post('/api/data', updated);
  }

  async function removePosition(symbol) {
    const holdings = rawData?.portfolio?.holdings ?? [];
    const updated = {
      ...rawData,
      portfolio: { ...rawData.portfolio, holdings: holdings.filter(h => h.symbol !== symbol) },
    };
    setRawData(updated);
    await api.post('/api/data', updated);
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
    await api.post('/api/data', updated);
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
    await api.post('/api/data', updated);
  }

  async function saveSnapshot(totalValue, investedValue) {
    const today = new Date().toISOString().slice(0, 10);
    const updated = {
      ...rawData,
      snapshots: { ...(rawData.snapshots ?? {}), [today]: totalValue },
      snapshotsInvested: { ...(rawData.snapshotsInvested ?? {}), [today]: investedValue },
    };
    setRawData(updated);
    await api.post('/api/data', updated);
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
    addPosition,
    removePosition,
    sellPosition,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp musi być użyty wewnątrz AppProvider');
  return ctx;
}
