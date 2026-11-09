import { useEffect, useMemo, useState } from 'react';
import { fetchDividendHistory } from '../services/dividendService';
import { findMissingDividends } from '../utils/missingDividends.js';

// Dywidendy wypłacone przez spółki z portfela, których nie ma w transakcjach
// (ta sama logika i lista odrzuconych co na stronie Dywidend). Historia
// wypłat jest w pamięci przeglądarki 24 h, więc Dashboard nie dokłada zapytań.
const DISMISSED_KEY = 'myfund_div_missing_dismissed';

export default function useMissingDividends(portfolio = [], transactions = []) {
  const [history, setHistory] = useState({});
  const symbolsKey = [...new Set(portfolio.filter(p => p.qty > 0).map(p => p.symbol))].sort().join(',');
  useEffect(() => {
    if (!symbolsKey) { setHistory({}); return; }
    let cancelled = false;
    const symbols = symbolsKey.split(',');
    Promise.all(symbols.map(s => fetchDividendHistory(s).then(h => [s, h])))
      .then(entries => { if (!cancelled) setHistory(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [symbolsKey]);
  return useMemo(() => {
    let dismissed = new Set();
    try { dismissed = new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); } catch { /* brak */ }
    return findMissingDividends(transactions, history, { dismissed });
  }, [transactions, history]);
}
