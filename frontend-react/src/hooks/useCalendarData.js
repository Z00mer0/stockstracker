import { useState, useEffect } from 'react';

const FINNHUB_KEY   = 'd7uhj69r01qnv95nm3e0d7uhj69r01qnv95nm3eg';
const CACHE_TTL_MS  = 6 * 60 * 60 * 1000;  // 6h dla makro
const DIV_TTL_MS    = 60 * 60 * 1000;       // 1h dla dywidend

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

async function fetchProxy(url) {
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
      `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(10000) }
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
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`,
      { signal: AbortSignal.timeout(10000) }
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

// ── Yahoo Finance: projekcja dywidendy ───────────────────────────────────────
async function fetchDividendEvents(sym) {
  const nowSec  = Math.floor(Date.now() / 1000);
  const pastSec = nowSec - 400 * 86400;
  const futSec  = nowSec + 180 * 86400;

  const data = await fetchProxy(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
    `?interval=1mo&period1=${pastSec}&period2=${futSec}&events=div`
  );

  const rawDivs = data?.chart?.result?.[0]?.events?.dividends ?? {};
  const divs = Object.values(rawDivs)
    .map(d => ({ ts: d.date, amount: d.amount }))
    .sort((a, b) => a.ts - b.ts);

  if (divs.length < 2) return [];

  const gaps = [];
  for (let i = 1; i < divs.length; i++) gaps.push(divs[i].ts - divs[i - 1].ts);
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)];

  const minGap = gaps[0], maxGap = gaps[gaps.length - 1];
  if (maxGap > 400 * 86400 || maxGap / minGap > 3) return [];

  const lastTs     = divs[divs.length - 1].ts;
  const lastAmount = divs[divs.length - 1].amount;
  let nextTs = lastTs + medianGap;
  if (nextTs < nowSec - 14 * 86400) nextTs += medianGap;
  if (nextTs < nowSec - 7 * 86400 || nextTs > nowSec + 180 * 86400) return [];

  const nextDate = new Date(nextTs * 1000).toISOString().slice(0, 10);
  return [{ date: nextDate, type: 'DIV', symbol: sym, amount: lastAmount, projected: true }];
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
      const results = [];

      // 1. Makro (Finnhub live + fallback hardcoded)
      const macroEvents = await fetchMacroEvents();
      results.push(...macroEvents);

      // 2. Earnings + dywidendy per spółka
      if (symbols.length) {
        const [earnEvents, ...divResults] = await Promise.all([
          fetchEarningsEvents(symbols),
          ...symbols.map(sym => {
            const divKey = `cal_div_${sym}`;
            const cached = fromCache(divKey, DIV_TTL_MS);
            if (cached) return Promise.resolve(cached);
            return fetchDividendEvents(sym)
              .then(evs => { toCache(divKey, evs); return evs; })
              .catch(() => []);
          }),
        ]);
        results.push(...earnEvents);
        for (const arr of divResults) results.push(...arr);
      }

      if (!cancelled) {
        setEvents(results.sort((a, b) => a.date.localeCompare(b.date)));
        setLoading(false);
      }
    }

    fetchAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolKey]);

  return { events, loading };
}
