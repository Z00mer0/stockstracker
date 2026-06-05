import { useState, useEffect } from 'react';

// NBP free public API — returns mid rate for a given currency/date in PLN
// Retries up to 7 days back to handle weekends/holidays
async function fetchNbpRate(currency, date) {
  const cacheKey = `nbp_${currency}_${date}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return parseFloat(cached);
  } catch {}

  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date(date);
    d.setDate(d.getDate() - offset);
    const ds = d.toISOString().slice(0, 10);
    try {
      const res = await fetch(
        `https://api.nbp.pl/api/exchangerates/rates/A/${currency}/${ds}/?format=json`,
        { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } }
      );
      if (res.ok) {
        const json = await res.json();
        const rate = json?.rates?.[0]?.mid;
        if (rate) {
          try { sessionStorage.setItem(cacheKey, String(rate)); } catch {}
          return rate;
        }
      }
    } catch {}
  }
  return null;
}

// Accepts enriched positions (with .price, .avgPrice, .currency, .symbol)
// Returns per-symbol breakdown: { assetReturn, fxReturn, totalReturn, purchaseFx, currentFx }
export function useFxBreakdown(enrichedPositions, transactions, fxRates) {
  const [breakdown, setBreakdown] = useState({});
  const [fxLoading, setFxLoading] = useState(false);

  const fxSymbols = enrichedPositions
    .filter(p => p.currency && p.currency !== 'PLN' && p.price != null && p.avgPrice > 0)
    .map(p => p.symbol)
    .sort()
    .join(',');

  useEffect(() => {
    const fxPositions = enrichedPositions.filter(
      p => p.currency && p.currency !== 'PLN' && p.price != null && p.avgPrice > 0
    );
    if (!fxPositions.length) { setBreakdown({}); return; }

    setFxLoading(true);

    Promise.all(fxPositions.map(async (pos) => {
      const buys = transactions.filter(
        t => t.symbol === pos.symbol && t.type === 'BUY' && (t.qty ?? 0) > 0 && (t.price ?? 0) > 0
      );
      if (!buys.length) return null;

      const rates = await Promise.all(buys.map(t => fetchNbpRate(pos.currency, t.date)));

      // Weighted average purchase FX rate (PLN per 1 unit of currency)
      let totalQty = 0, weightedFx = 0;
      buys.forEach((t, i) => {
        if (rates[i] != null) { totalQty += t.qty; weightedFx += t.qty * rates[i]; }
      });
      if (!totalQty) return null;

      const purchaseFx = weightedFx / totalQty;
      const currentFx  = fxRates[pos.currency] ?? 1;

      // Asset return = how the stock itself performed in its native currency
      const assetReturn = (pos.price / pos.avgPrice - 1) * 100;
      // FX return = how the currency moved relative to PLN since purchase
      const fxReturn    = (currentFx / purchaseFx - 1) * 100;
      // Combined PLN return (multiplicative, not additive)
      const totalReturn = ((1 + assetReturn / 100) * (1 + fxReturn / 100) - 1) * 100;

      return { symbol: pos.symbol, currency: pos.currency, purchaseFx, currentFx, assetReturn, fxReturn, totalReturn };
    })).then(results => {
      const map = {};
      results.filter(Boolean).forEach(r => { map[r.symbol] = r; });
      setBreakdown(map);
    }).catch(() => {}).finally(() => setFxLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxSymbols, JSON.stringify(fxRates)]);

  return { breakdown, fxLoading };
}
