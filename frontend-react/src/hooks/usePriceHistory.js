// src/hooks/usePriceHistory.js
import { useState, useEffect, useRef } from 'react';
import { api } from './useApi';

// 1D/1W refresh frequently during session; longer periods can cache longer
const CACHE_TTL_BY_PERIOD = { '1D': 60 * 1000, '1W': 2 * 60 * 1000 };
const DEFAULT_CACHE_TTL    = 5 * 60 * 1000;
const REFRESH_INTERVAL_BY_PERIOD = { '1D': 60 * 1000 }; // auto-refresh every 60s for 1D

const PERIOD_MAP = {
  '1D':  { range: '1d',  interval: '5m'  },
  '1W':  { range: '5d',  interval: '15m' },
  '1M':  { range: '1mo', interval: '1d'  },
  '3M':  { range: '3mo', interval: '1d'  },
  '6M':  { range: '6mo', interval: '1d'  },
  '1Y':  { range: '1y',  interval: '1d'  },
  'ALL': { range: 'max', interval: '1wk' },
};

function getCached(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > ttl) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function parseYF(raw, interval) {
  const result = raw?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const isIntraday = interval && /^\d+[mh]$/.test(interval);
  return timestamps.map((ts, i) => {
    const dt = new Date(ts * 1000);
    return {
      date:      dt.toISOString().slice(0, 10),
      time:      isIntraday
        ? dt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
        : null,
      timestamp: ts,
      open:   q.open?.[i]   ?? null,
      high:   q.high?.[i]   ?? null,
      low:    q.low?.[i]    ?? null,
      close:  q.close?.[i]  ?? null,
      volume: q.volume?.[i] ?? null,
    };
  }).filter(c => c.timestamp != null && c.open != null && c.close != null && !isNaN(c.close));
}

export function usePriceHistory(symbol, period) {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!symbol || !period) return;

    const mapping = PERIOD_MAP[period];
    if (!mapping) { setError(`Nieznany okres: ${period}`); return; }

    const { range, interval } = mapping;
    const cacheTtl  = CACHE_TTL_BY_PERIOD[period] ?? DEFAULT_CACHE_TTL;
    const refreshMs = REFRESH_INTERVAL_BY_PERIOD[period] ?? null;
    const key       = `chart_${symbol}_${period}`;
    let cancelled   = false;

    function fetchData(silent = false) {
      const cached = getCached(key, cacheTtl);
      if (cached) { setCandles(cached); return; }

      if (!silent) { setLoading(true); setError(null); setCandles([]); }
      const chartUrl = `/api/chart?symbol=${encodeURIComponent(symbol)}&interval=${interval}&range=${range}`;
      api.get(chartUrl)
        .then(res => {
          if (cancelled) return;
          const data = parseYF(res.data, interval);
          setCache(key, data);
          setCandles(data);
        })
        .catch(err => {
          if (cancelled) return;
          setError(err.response?.data?.error ?? err.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }

    fetchData(false);

    // Auto-refresh for intraday periods during market hours
    if (refreshMs) {
      timerRef.current = setInterval(() => {
        localStorage.removeItem(key); // force fresh fetch
        fetchData(true);
      }, refreshMs);
    }

    return () => {
      cancelled = true;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [symbol, period]);

  return { candles, loading, error };
}
