import { useState, useEffect } from 'react';
import { lsSet } from '../utils/safeStorage.js';
import { authHeader } from '../utils/auth.js';
import { normalizeType } from '../utils/transactions.js';
import { isSplit, splitRatio } from '../utils/splits.js';

const DISMISS_KEY = 'myfund_dismissed_splits';

function getDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')); }
  catch { return new Set(); }
}

function dismiss(key) {
  const s = getDismissed();
  s.add(key);
  lsSet(DISMISS_KEY, JSON.stringify([...s]));
}

// Splity z /api/splits, które mogą dotyczyć pozycji: jest zakup sprzed daty
// splitu, a split nie został jeszcze zastosowany (brak wpisu SPLIT) ani
// odrzucony („ilość jest już po splicie").
export function detectSplits(portfolio, transactions, splitsBySymbol, dismissed = new Set()) {
  const found = [];
  for (const [sym, splits] of Object.entries(splitsBySymbol || {})) {
    const pos = portfolio.find(p => p.symbol === sym);
    if (!pos || !(pos.qty > 0)) continue;
    const txs = transactions.filter(t => t.symbol === sym);
    for (const split of splits) {
      const key = `${sym}_${split.date}`;
      const ratio = splitRatio(split.numerator, split.denominator);
      if (!ratio || ratio === 1 || dismissed.has(key)) continue;
      if (txs.some(t => isSplit(t) && t.date === split.date)) continue;
      if (!txs.some(t => normalizeType(t.type) === 'BUY' && (t.date || '') < split.date)) continue;
      found.push({ key, symbol: sym, date: split.date, label: split.ratio, ratio, qty: pos.qty, avgPrice: pos.avgPrice, currency: pos.currency });
    }
  }
  return found.sort((a, b) => a.date.localeCompare(b.date));
}

export function useSplitDetector(portfolio, transactions) {
  const [splits, setSplits] = useState({});
  const [, setDismissTick] = useState(0); // odrzucenie → nowy render

  const symbols = portfolio.map(p => p.symbol).filter(Boolean);

  useEffect(() => {
    if (!symbols.length) return;
    let cancelled = false;
    const base = import.meta.env.VITE_API_URL ?? '';
    const url = `${base}/api/splits?symbols=${encodeURIComponent(symbols.join(','))}`;
    fetch(url, { headers: authHeader(), signal: AbortSignal.timeout(15000) })
      .then(r => (r.ok ? r.json() : {}))
      .then(data => { if (!cancelled) setSplits(data || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')]);

  const alerts = detectSplits(portfolio, transactions, splits, getDismissed());

  function dismissAlert(key) {
    dismiss(key);
    setDismissTick(n => n + 1);
  }

  return { alerts, dismissAlert };
}
