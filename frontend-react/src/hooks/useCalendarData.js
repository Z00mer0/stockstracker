import { useState, useEffect } from 'react';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function parseFXDate(str) {
  if (!str) return null;
  // ISO 8601: "2026-05-10T21:30:00-04:00" or "2026-05-10"
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return null;
}

function parseFXTime(str) {
  if (!str) return null;
  const m = str.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : null;
}

function fromCache(key) {
  try {
    const item = JSON.parse(localStorage.getItem(key));
    if (item && Date.now() - item.ts < CACHE_TTL_MS) return item.data;
  } catch {}
  return null;
}

function toCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

async function fetchProxy(url) {
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchCalendar(week) {
  const res = await fetch(`/api/calendar?week=${week}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Project next dividend date from historical pattern.
// Returns array of 0 or 1 DIV events.
async function fetchDividendEvents(sym) {
  const nowSec  = Math.floor(Date.now() / 1000);
  const pastSec = nowSec - 400 * 86400; // ~13 months back
  const futSec  = nowSec + 180 * 86400; // look ahead too (some declared early)

  const data = await fetchProxy(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}` +
    `?interval=1mo&period1=${pastSec}&period2=${futSec}&events=div`
  );

  const rawDivs = data?.chart?.result?.[0]?.events?.dividends ?? {};
  const divs = Object.values(rawDivs)
    .map(d => ({ ts: d.date, amount: d.amount }))
    .sort((a, b) => a.ts - b.ts);

  if (divs.length < 2) return [];

  // Calculate median inter-dividend gap (in seconds)
  const gaps = [];
  for (let i = 1; i < divs.length; i++) gaps.push(divs[i].ts - divs[i - 1].ts);
  gaps.sort((a, b) => a - b);
  const medianGap = gaps[Math.floor(gaps.length / 2)];

  // Sanity: skip if gap variance is huge (irregular payer) or gap > 400 days
  const minGap = gaps[0], maxGap = gaps[gaps.length - 1];
  if (maxGap > 400 * 86400 || maxGap / minGap > 3) return [];

  // Project forward from last known dividend
  const lastTs     = divs[divs.length - 1].ts;
  const lastAmount = divs[divs.length - 1].amount;
  let nextTs = lastTs + medianGap;

  // If we're already past the projected date, advance one more period
  if (nextTs < nowSec - 14 * 86400) nextTs += medianGap;

  // Only show if within [−7 days, +120 days]
  if (nextTs < nowSec - 7 * 86400 || nextTs > nowSec + 120 * 86400) return [];

  const nextDate = new Date(nextTs * 1000).toISOString().slice(0, 10);
  return [{
    date: nextDate,
    type: 'DIV',
    symbol: sym,
    title: `${sym} — ex-dywidenda`,
    amount: lastAmount,
    projected: true,
  }];
}

export default function useCalendarData(symbols) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const symbolKey = symbols.join(',');

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      const results = [];

      // Macro events — always fetch regardless of portfolio
      for (const week of ['thisweek', 'nextweek']) {
        const cacheKey = `cal_macro_${week}`;
        let data = fromCache(cacheKey);
        if (!data) {
          try {
            data = await fetchCalendar(week);
            toCache(cacheKey, data);
          } catch { data = []; }
        }
        if (Array.isArray(data)) {
          for (const ev of data) {
            const date = parseFXDate(ev.date);
            if (!date) continue;
            results.push({
              date, type: 'MACRO',
              title: ev.title,
              currency: ev.country,
              impact: ev.impact,
              time: parseFXTime(ev.date),
              forecast: ev.forecast,
              previous: ev.previous,
              actual: ev.actual,
            });
          }
        }
      }

      if (symbols.length) {
        // Earnings + dividends in parallel per symbol
        const perSymbol = await Promise.all(
          symbols.map(async sym => {
            const out = [];

            // --- Earnings ---
            const earnKey = `cal_earn_${sym}`;
            let earnData = fromCache(earnKey);
            if (!earnData) {
              try {
                earnData = await fetchProxy(
                  `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=calendarEvents`
                );
                toCache(earnKey, earnData);
              } catch { earnData = null; }
            }
            const earnDates = earnData?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate ?? [];
            for (const ed of earnDates) {
              const date = ed.fmt ?? (ed.raw ? new Date(ed.raw * 1000).toISOString().slice(0, 10) : null);
              if (date) out.push({ date, type: 'EARN', symbol: sym });
            }

            // --- Dividends (projected from historical pattern) ---
            const divKey = `cal_div_${sym}`;
            let divEvents = fromCache(divKey);
            if (!divEvents) {
              try {
                divEvents = await fetchDividendEvents(sym);
              } catch { divEvents = []; }
              toCache(divKey, divEvents);
            }
            out.push(...divEvents);

            return out;
          })
        );
        for (const arr of perSymbol) results.push(...arr);
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
