import { useState, useEffect } from 'react';

const DISMISS_KEY = 'myfund_dismissed_splits';

function getDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')); }
  catch { return new Set(); }
}

function dismiss(key) {
  const s = getDismissed();
  s.add(key);
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...s]));
}

export function useSplitDetector(portfolio, transactions) {
  const [alerts, setAlerts] = useState([]);

  const symbols = portfolio.map(p => p.symbol).filter(Boolean);

  useEffect(() => {
    if (!symbols.length) return;
    const base = import.meta.env.VITE_API_URL ?? '';
    const url = `${base}/api/splits?symbols=${encodeURIComponent(symbols.join(','))}`;

    fetch(url, { signal: AbortSignal.timeout(10000) })
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        const dismissed = getDismissed();
        const found = [];

        for (const [sym, splits] of Object.entries(data)) {
          const buys = transactions.filter(t => t.symbol === sym && t.type !== 'sell');
          if (!buys.length) continue;

          for (const split of splits) {
            const splitDate = split.date;
            const key = `${sym}_${splitDate}`;
            if (dismissed.has(key)) continue;

            const hasPreSplitBuy = buys.some(t => (t.date || '') < splitDate);
            if (!hasPreSplitBuy) continue;

            const pos = portfolio.find(p => p.symbol === sym);
            found.push({
              key,
              symbol: sym,
              date: splitDate,
              ratio: split.ratio,
              numerator: split.numerator,
              denominator: split.denominator,
              qty: pos?.qty ?? 0,
            });
          }
        }

        setAlerts(found);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(','), transactions.length]);

  function dismissAlert(key) {
    dismiss(key);
    setAlerts(prev => prev.filter(a => a.key !== key));
  }

  return { alerts, dismissAlert };
}
