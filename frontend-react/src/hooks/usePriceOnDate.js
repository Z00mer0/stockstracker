import { useEffect, useState } from 'react';
import { fetchPriceOnDate } from '../utils/priceOnDate.js';

// Kurs zamknięcia symbolu z dnia `date` (albo ostatniej sesji przed nim):
// { date, price, currency } | null. Odczekuje chwilę po ostatniej zmianie,
// żeby nie pytać o każdą wpisaną literę.
export function usePriceOnDate(symbol, date, enabled = true) {
  const [quote, setQuote] = useState(null);
  const sym = String(symbol ?? '').trim().toUpperCase();

  useEffect(() => {
    setQuote(null);
    if (!enabled || !sym || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchPriceOnDate(sym, date)
        .then(q => { if (!cancelled) setQuote(q); })
        .catch(() => {});
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [sym, date, enabled]);

  return quote;
}
