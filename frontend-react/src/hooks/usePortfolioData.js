import { useState, useEffect } from 'react';
import { api } from './useApi';

export function usePortfolioData() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    api.get('/api/data')
      .then(res => setData(res.data))
      .catch(err => {
        const msg = err.response?.data?.error ?? err.message;
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  return {
    portfolio:    data?.portfolio    ?? [],
    transactions: data?.transactions ?? [],
    snapshots:    data?.snapshots    ?? [],
    cash:         data?.cash         ?? {},
    loading,
    error,
  };
}
