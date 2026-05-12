import { useState, useEffect } from 'react';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

function parseFXDate(str) {
  if (!str) return null;
  const m = str.match(/^(\w{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (month == null) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(parseInt(m[2], 10)).padStart(2, '0')}`;
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

export default function useCalendarData(symbols) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const symbolKey = symbols.join(',');

  useEffect(() => {
    if (!symbols.length) return;
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);
      const results = [];

      // Macro events — this week + next week
      for (const week of ['thisweek', 'nextweek']) {
        const cacheKey = `cal_macro_${week}`;
        let data = fromCache(cacheKey);
        if (!data) {
          try {
            data = await fetchProxy(`https://nfs.faireconomy.media/ff_calendar_${week}.json`);
            toCache(cacheKey, data);
          } catch { data = []; }
        }
        if (Array.isArray(data)) {
          for (const ev of data) {
            const date = parseFXDate(ev.date);
            if (!date) continue;
            results.push({
              date, type: 'MACRO',
              title: ev.title, currency: ev.currency,
              impact: ev.impact, time: ev.time,
              forecast: ev.forecast, previous: ev.previous, actual: ev.actual,
            });
          }
        }
      }

      // Earnings per symbol (parallel)
      const earningsArr = await Promise.all(
        symbols.map(async sym => {
          const cacheKey = `cal_earn_${sym}`;
          let data = fromCache(cacheKey);
          if (!data) {
            try {
              data = await fetchProxy(
                `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${sym}?modules=calendarEvents`
              );
              toCache(cacheKey, data);
            } catch { return []; }
          }
          const dates = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate ?? [];
          return dates
            .map(ed => ed.fmt ?? (ed.raw ? new Date(ed.raw * 1000).toISOString().slice(0, 10) : null))
            .filter(Boolean)
            .map(date => ({ date, type: 'EARN', symbol: sym }));
        })
      );
      for (const arr of earningsArr) results.push(...arr);

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
