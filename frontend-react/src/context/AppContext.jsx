import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../hooks/useApi';

const AppContext = createContext(null);

const TOKEN_KEY  = 'myfund_auth_token';
const FX_CACHE_KEY = 'myfund_fx_rates';
const FX_CACHE_TTL = 30 * 60 * 1000; // 30 min
const FX_FALLBACK  = { PLN: 1, USD: 3.62, EUR: 4.24, GBP: 4.91 };

async function loadFxRates() {
  try {
    const cached = JSON.parse(localStorage.getItem(FX_CACHE_KEY) || 'null');
    if (cached?.ts && Date.now() - cached.ts < FX_CACHE_TTL) return cached.rates;
  } catch {}
  try {
    const res = await fetch(
      'https://api.frankfurter.app/latest?from=USD&to=PLN,EUR,GBP',
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const r = data.rates;
    if (!r?.PLN) throw new Error('no PLN in response');
    const rates = { PLN: 1, USD: r.PLN, EUR: r.PLN / r.EUR, GBP: r.PLN / r.GBP };
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ ts: Date.now(), rates }));
    return rates;
  } catch (e) {
    console.warn('[fx] fetch failed, using fallback:', e.message);
    return FX_FALLBACK;
  }
}

export function AppProvider({ children }) {
  const [token, setToken]           = useState(() => localStorage.getItem(TOKEN_KEY));
  const [displayName, setDisplayName] = useState('');
  const [rawData, setRawData]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [fxRates, setFxRates]       = useState(FX_FALLBACK);

  useEffect(() => {
    loadFxRates().then(setFxRates);
  }, []);

  function login(newToken, name) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setDisplayName(name || '');
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
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

  const snapshots = rawData?.snapshots
    ? Object.entries(rawData.snapshots).map(([date, total]) => ({ date, total }))
    : [];

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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp musi być użyty wewnątrz AppProvider');
  return ctx;
}
