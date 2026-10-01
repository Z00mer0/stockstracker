// src/hooks/usePriceHistory.js
import { useState, useEffect, useRef } from 'react';
import { lsSet } from '../utils/safeStorage.js';
import { CHART_PERIODS, displayStart } from '../utils/chartPeriods.js';

// 1D/1W refresh frequently during session; longer periods can cache longer
const CACHE_TTL_BY_PERIOD = { '1D': 60 * 1000, '1W': 2 * 60 * 1000 };
const DEFAULT_CACHE_TTL    = 5 * 60 * 1000;
const REFRESH_INTERVAL_BY_PERIOD = { '1D': 60 * 1000 }; // auto-refresh every 60s for 1D

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
  try { lsSet(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

export function parseYF(raw, interval) {
  const result = raw?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const isIntraday = interval && /^\d+[mh]$/.test(interval);
  // Godziny w strefie giełdy (wcześniej zawsze Warszawa — sesja w USA
  // wyglądała na 15:30–22:00).
  const tz = result.meta?.exchangeTimezoneName || 'Europe/Warsaw';
  return timestamps.map((ts, i) => {
    const dt = new Date(ts * 1000);
    return {
      date:      isIntraday ? dt.toLocaleDateString('sv-SE', { timeZone: tz }) : dt.toISOString().slice(0, 10),
      time:      isIntraday
        ? dt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: tz })
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
  const [start, setStart]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!symbol || !period) return;

    const mapping = CHART_PERIODS[period];
    if (!mapping) { setError(`Unknown period: ${period}`); return; }

    const { range, interval } = mapping;
    const cacheTtl  = CACHE_TTL_BY_PERIOD[period] ?? DEFAULT_CACHE_TTL;
    const refreshMs = REFRESH_INTERVAL_BY_PERIOD[period] ?? null;
    const key       = `chart2_${symbol}_${period}`;
    const apply = data => { setCandles(data); setStart(displayStart(data, period)); };
    let cancelled   = false;

    function fetchData(silent = false) {
      const cached = getCached(key, cacheTtl);
      if (cached) { apply(cached); return; }

      if (!silent) { setLoading(true); setError(null); setCandles([]); }
      // Przez /api/proxy serwera — tak jak wykres w oknie spółki; działa tak
      // samo lokalnie i na produkcji.
      const yahoo = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
      fetch(`/api/proxy?url=${encodeURIComponent(yahoo)}`, { signal: AbortSignal.timeout(15000) })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(json => {
          if (cancelled) return;
          const data = parseYF(json, interval);
          setCache(key, data);
          apply(data);
        })
        .catch(err => {
          if (cancelled) return;
          setError(err.message);
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

  return { candles, start, loading, error };
}
