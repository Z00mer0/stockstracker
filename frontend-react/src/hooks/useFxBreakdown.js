import { useState, useEffect } from 'react';
import { authHeader } from '../utils/auth.js';
import { splitAdjusted } from '../utils/splits.js';

// Fetches a { date: rate } map for one currency in a single batched backend call.
// Backend caches historical rates permanently in Postgres.
export async function fetchFxRates(currency, dates) {
  const base = import.meta.env.VITE_API_URL ?? '';
  try {
    const res = await fetch(
      `${base}/api/fx-rate?currency=${currency}&dates=${encodeURIComponent([...dates].join(','))}`,
      { headers: authHeader(), signal: AbortSignal.timeout(20000) }
    );
    if (!res.ok) return {};
    const json = await res.json();
    return json?.rates || {};
  } catch {
    return {};
  }
}

// Zysk w zł rozbity na część ze spółki i część z waluty (sumują się dokładnie):
//   spółka = ilość × (cena − średnia) × kurs z zakupu
//   waluta = ilość × cena × (kurs dziś − kurs z zakupu)
export function fxDecompose({ qty, price, avgPrice, purchaseFx, currentFx }) {
  const stockPLN = qty * (price - avgPrice) * purchaseFx;
  const fxPLN = qty * price * (currentFx - purchaseFx);
  return { stockPLN, fxPLN, totalPLN: stockPLN + fxPLN };
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
    let cancelled = false;
    const fxPositions = enrichedPositions.filter(
      p => p.currency && p.currency !== 'PLN' && p.price != null && p.avgPrice > 0
    );
    if (!fxPositions.length) { setBreakdown({}); return; }

    setFxLoading(true);

    // Collect all unique (currency, date) pairs needed, grouped by currency.
    const datesByCurrency = {};
    const buysByPosition = {};
    fxPositions.forEach(pos => {
      const buys = splitAdjusted(transactions).filter(
        t => t.symbol === pos.symbol && t.type === 'BUY' && (t.qty ?? 0) > 0 && (t.price ?? 0) > 0
      );
      buysByPosition[pos.symbol] = buys;
      if (!buys.length) return;
      if (!datesByCurrency[pos.currency]) datesByCurrency[pos.currency] = new Set();
      buys.forEach(t => datesByCurrency[pos.currency].add(t.date));
    });

    const currencies = Object.keys(datesByCurrency);

    Promise.all(currencies.map(currency =>
      fetchFxRates(currency, datesByCurrency[currency]).then(rates => ({ currency, rates }))
    )).then(results => {
      // Build { [currency]: { [date]: rate } } lookup map
      const lookup = {};
      results.forEach(({ currency, rates }) => { lookup[currency] = rates; });

      const map = {};
      fxPositions.forEach(pos => {
        const buys = buysByPosition[pos.symbol];
        if (!buys.length) return;
        const currencyRates = lookup[pos.currency] || {};

        // Weighted average purchase FX rate (PLN per 1 unit of currency)
        let totalQty = 0, weightedFx = 0;
        buys.forEach(t => {
          const rate = currencyRates[t.date];
          if (rate != null) { totalQty += t.qty; weightedFx += t.qty * rate; }
        });
        if (!totalQty) return;

        const purchaseFx = weightedFx / totalQty;
        const currentFx  = fxRates[pos.currency] ?? 1;

        // Asset return = how the stock itself performed in its native currency
        const assetReturn = (pos.price / pos.avgPrice - 1) * 100;
        // FX return = how the currency moved relative to PLN since purchase
        const fxReturn    = (currentFx / purchaseFx - 1) * 100;
        // Combined PLN return (multiplicative, not additive)
        const totalReturn = ((1 + assetReturn / 100) * (1 + fxReturn / 100) - 1) * 100;

        map[pos.symbol] = {
          symbol: pos.symbol, currency: pos.currency, purchaseFx, currentFx, assetReturn, fxReturn, totalReturn,
          ...fxDecompose({ qty: pos.qty ?? 0, price: pos.price, avgPrice: pos.avgPrice, purchaseFx, currentFx }),
        };
      });
      if (cancelled) return;
      setBreakdown(map);
    }).catch(() => {}).finally(() => { if (!cancelled) setFxLoading(false); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fxSymbols, JSON.stringify(fxRates)]);

  return { breakdown, fxLoading };
}
