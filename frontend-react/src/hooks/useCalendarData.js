import { useState, useEffect } from 'react';
import { authHeader } from '../utils/auth.js';

const CACHE_TTL_MS  = 6 * 60 * 60 * 1000;  // 6h dla makro

// Hardcoded fallback gdy Finnhub nie odpowie
const MACRO_FALLBACK = [
  { date: '2026-05-13', title: 'US CPI (kwiecień)',      currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-05-14', title: 'US PPI MoM',             currency: 'USD', impact: 'Medium', type: 'MACRO' },
  { date: '2026-05-14', title: 'US Retail Sales MoM',    currency: 'USD', impact: 'Medium', type: 'MACRO' },
  { date: '2026-05-20', title: 'FOMC Minutes',           currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-05-23', title: 'PMI Manufacturing (EU)', currency: 'EUR', impact: 'Medium', type: 'MACRO' },
  { date: '2026-05-28', title: 'US GDP Growth Rate',     currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-05-30', title: 'Core PCE Price Index',   currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-06-04', title: 'EBC – posiedzenie',      currency: 'EUR', impact: 'High',   type: 'MACRO' },
  { date: '2026-06-11', title: 'US CPI (maj)',            currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-06-17', title: 'Fed FOMC',               currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-07-14', title: 'US CPI (czerwiec)',      currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-07-23', title: 'EBC – posiedzenie',      currency: 'EUR', impact: 'High',   type: 'MACRO' },
  { date: '2026-07-29', title: 'Fed FOMC',               currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-08-12', title: 'US CPI (lipiec)',        currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-09-10', title: 'EBC – posiedzenie',      currency: 'EUR', impact: 'High',   type: 'MACRO' },
  { date: '2026-09-10', title: 'US CPI (sierpień)',      currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-09-16', title: 'Fed FOMC',               currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-10-14', title: 'US CPI (wrzesień)',     currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-10-22', title: 'EBC – posiedzenie',      currency: 'EUR', impact: 'High',   type: 'MACRO' },
  { date: '2026-10-28', title: 'Fed FOMC',               currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-11-12', title: 'US CPI (październik)',   currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-12-10', title: 'EBC – posiedzenie',      currency: 'EUR', impact: 'High',   type: 'MACRO' },
  { date: '2026-12-10', title: 'US CPI (listopad)',      currency: 'USD', impact: 'High',   type: 'MACRO' },
  { date: '2026-12-16', title: 'Fed FOMC',               currency: 'USD', impact: 'High',   type: 'MACRO' },
];

const COUNTRY_TO_CUR = { US: 'USD', EU: 'EUR', GB: 'GBP', PL: 'PLN', CA: 'CAD', JP: 'JPY', CN: 'CNY' };

function fromCache(key, ttl) {
  try {
    const item = JSON.parse(localStorage.getItem(key));
    if (item && Date.now() - item.ts < ttl) return item.data;
  } catch {}
  return null;
}

function toCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

function isoDate(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return null;
}

function capImpact(s) {
  if (!s) return 'Low';
  const l = s.toLowerCase();
  if (l === 'high')   return 'High';
  if (l === 'medium') return 'Medium';
  return 'Low';
}

// ── Finnhub: ekonomiczny calendar ────────────────────────────────────────────
async function fetchMacroEvents() {
  const cacheKey = 'cal_macro_fh';
  const cached = fromCache(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  const from = new Date().toISOString().slice(0, 10);
  const to   = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

  try {
    const res = await fetch(
      `/api/finnhub/v1/calendar/economic?from=${from}&to=${to}`,
      { signal: AbortSignal.timeout(10000), headers: authHeader() }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const events = (data.economicCalendar || [])
      .filter(e => {
        const imp = e.impact?.toLowerCase();
        const cur = COUNTRY_TO_CUR[e.country];
        return (imp === 'high' || imp === 'medium') && cur;
      })
      .map(e => ({
        date:     isoDate(e.time),
        type:     'MACRO',
        title:    e.event,
        currency: COUNTRY_TO_CUR[e.country] ?? e.country,
        impact:   capImpact(e.impact),
        time:     e.time?.slice(11, 16) || null,
        forecast: e.estimate != null ? String(e.estimate) : null,
        previous: e.prev     != null ? String(e.prev)     : null,
        actual:   e.actual   != null ? String(e.actual)   : null,
      }))
      .filter(e => e.date);

    toCache(cacheKey, events);
    return events;
  } catch (err) {
    console.warn('[cal] Finnhub economic:', err.message);
    // fallback do hardcoded listy
    return MACRO_FALLBACK;
  }
}

// ── Finnhub: earnings spółek ─────────────────────────────────────────────────
async function fetchEarningsEvents(symbols) {
  if (!symbols.length) return [];
  const cacheKey = `cal_earn_fh_${symbols.join(',')}`;
  const cached = fromCache(cacheKey, CACHE_TTL_MS);
  if (cached) return cached;

  const from = new Date().toISOString().slice(0, 10);
  const to   = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  // Finnhub używa tickerów bez .WA itp. — strip giełdy
  const bareToFull = new Map(symbols.map(s => [s.split('.')[0].toUpperCase(), s]));

  try {
    const res = await fetch(
      `/api/finnhub/v1/calendar/earnings?from=${from}&to=${to}`,
      { signal: AbortSignal.timeout(10000), headers: authHeader() }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Dla każdej spółki weź tylko najbliższą datę wyników
    const nearest = new Map();
    for (const e of (data.earningsCalendar || [])) {
      const full = bareToFull.get(e.symbol?.toUpperCase());
      if (!full) continue;
      if (!nearest.has(full) || e.date < nearest.get(full).date) nearest.set(full, e);
    }

    const events = [];
    for (const [sym, e] of nearest) {
      events.push({ date: e.date, type: 'EARN', symbol: sym });
    }
    toCache(cacheKey, events);
    return events;
  } catch (err) {
    console.warn('[cal] Finnhub earnings:', err.message);
    return [];
  }
}

// ── Główny hook ───────────────────────────────────────────────────────────────
export default function useCalendarData(symbols) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const symbolKey = symbols.join(',');

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);

      // Fetch macro and earnings in parallel
      const [macroEvents, earnEvents] = await Promise.all([
        fetchMacroEvents(),
        symbols.length ? fetchEarningsEvents(symbols) : Promise.resolve([]),
      ]);

      if (!cancelled) {
        setEvents([...macroEvents, ...earnEvents].sort((a, b) => a.date.localeCompare(b.date)));
        setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolKey]);

  return { events, loading };
}
