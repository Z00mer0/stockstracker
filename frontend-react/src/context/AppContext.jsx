import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../hooks/useApi';

const AppContext = createContext(null);

const TOKEN_KEY = 'myfund_auth_token';

export function AppProvider({ children }) {
  const [token, setToken]           = useState(() => localStorage.getItem(TOKEN_KEY));
  const [displayName, setDisplayName] = useState('');
  const [rawData, setRawData]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

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
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp musi być użyty wewnątrz AppProvider');
  return ctx;
}
