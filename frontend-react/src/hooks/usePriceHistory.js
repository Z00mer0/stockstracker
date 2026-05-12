// src/hooks/usePriceHistory.js
import { useState, useEffect } from 'react';
import { api } from './useApi';

const CACHE_TTL = 5 * 60 * 1000;

const PERIOD_MAP = {
  '1D':  { range: '1d',  interval: '5m'  },
  '1W':  { range: '5d',  interval: '15m' },
  '1M':  { range: '1mo', interval: '1d'  },
  '3M':  { range: '3mo', interval: '1d'  },
  '6M':  { range: '6mo', interval: '1d'  },
  '1Y':  { range: '1y',  interval: '1d'  },
  'ALL': { range: 'max', interval: '1wk' },
};

function getCached(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function parseYF(raw) {
  const result = raw?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  return timestamps.map((ts, i) => ({
    date:      new Date(ts * 1000).toISOString().slice(0, 10),
    timestamp: ts,
    open:   q.open?.[i]   ?? null,
    high:   q.high?.[i]   ?? null,
    low:    q.low?.[i]    ?? null,
    close:  q.close?.[i]  ?? null,
    volume: q.volume?.[i] ?? null,
  })).filter(c => c.open != null && c.close != null && !isNaN(c.close));
}

export function usePriceHistory(symbol, period) {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!symbol || !period) return;
    const key = `chart_${symbol}_${period}`;
    const cached = getCached(key);
    if (cached) { setCandles(cached); return; }

    const { range, interval } = PERIOD_MAP[period];
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(yfUrl)}`;

    setLoading(true);
    setError(null);
    setCandles([]);
    api.get(proxyUrl)
      .then(res => {
        const data = parseYF(res.data);
        setCache(key, data);
        setCandles(data);
      })
      .catch(err => setError(err.response?.data?.error ?? err.message))
      .finally(() => setLoading(false));
  }, [symbol, period]);

  return { candles, loading, error };
}
