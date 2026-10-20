import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { fetchFxRates } from './useFxBreakdown.js';
import { computePit38, pit38RateDates } from '../utils/pit38.js';

const TAX_FREE = new Set(['IKE', 'IKZE']);

// Data podatkowa: 'settlement' (dzień rozliczenia, domyślnie) albo 'trade'.
export const PIT38_BASIS_KEY = 'myfund_pit38_basis';
export function loadPit38Basis() {
  try { return localStorage.getItem(PIT38_BASIS_KEY) === 'trade' ? 'trade' : 'settlement'; } catch { return 'settlement'; }
}

// PIT-38 dla bieżącego widoku (jeden portfel albo „Wszystkie" bez IKE/IKZE).
// Kursy NBP z dnia przed każdą transakcją pobierane raz, paczkami;
// forYear(rok) liczy zestawienie bez ponownego pobierania.
export function usePit38(basis = loadPit38Basis()) {
  const { transactions, portfolios, activePortfolioId } = useApp();
  const excluded = useMemo(() => {
    if (activePortfolioId !== 'all') {
      const acc = portfolios.find(p => p.id === activePortfolioId)?.accountType;
      return new Set(TAX_FREE.has(acc) ? [''] : []);
    }
    return new Set(portfolios.filter(p => TAX_FREE.has(p.accountType)).map(p => p.id));
  }, [portfolios, activePortfolioId]);

  const need = useMemo(() => pit38RateDates(transactions, excluded, basis), [transactions, excluded, basis]);
  const needKey = JSON.stringify(Object.entries(need).map(([c, s]) => [c, [...s].sort()]));
  const [rates, setRates] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const jobs = [];
    for (const [ccy, dates] of Object.entries(need)) {
      const list = [...dates].sort();
      for (let i = 0; i < list.length; i += 400) {
        jobs.push(fetchFxRates(ccy, list.slice(i, i + 400)).then(r => [ccy, r]));
      }
    }
    if (!jobs.length) { setRates({}); return; }
    setLoading(true);
    Promise.all(jobs).then(parts => {
      if (cancelled) return;
      const out = {};
      for (const [ccy, r] of parts) out[ccy] = { ...out[ccy], ...r };
      setRates(out);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needKey]);

  const forYear = useCallback(year => computePit38(transactions, { year, rates, excluded, basis }), [transactions, rates, excluded, basis]);
  const years = useMemo(() => forYear(0).years, [forYear]);
  return { forYear, years, loading };
}
