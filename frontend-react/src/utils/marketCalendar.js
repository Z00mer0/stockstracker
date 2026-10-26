// Dni sesyjne GPW i NYSE — święta, w które giełda jest zamknięta.
// Liczone z reguł (stałe daty + Wielkanoc), więc nie trzeba co roku
// dopisywać listy. Poza tym zestawem — tylko weekendy.

// Wielkanoc (algorytm Meeusa/Jonesa/Butchera), kalendarz gregoriański.
export function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const ymd = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

// n-ty dzień tygodnia (0 = niedziela) w miesiącu; n = -1 — ostatni.
function nthWeekday(y, m, wd, n) {
  if (n > 0) {
    const first = ymd(y, m, 1);
    return addDays(first, ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7);
  }
  const last = ymd(y, m + 1, 0);
  return addDays(last, -((last.getUTCDay() - wd + 7) % 7));
}

// Święto w sobotę → piątek przed, w niedzielę → poniedziałek po (zasada NYSE).
function observed(d) {
  const wd = d.getUTCDay();
  return wd === 6 ? addDays(d, -1) : wd === 0 ? addDays(d, 1) : d;
}

const cache = new Map();

export function holidays(year, market) {
  const key = `${market}:${year}`;
  if (cache.has(key)) return cache.get(key);
  const e = easterSunday(year);
  let days;
  if (market === 'GPW') {
    days = [
      ymd(year, 1, 1), ymd(year, 1, 6), addDays(e, -2), addDays(e, 1), ymd(year, 5, 1), ymd(year, 5, 3),
      addDays(e, 60), ymd(year, 8, 15), ymd(year, 11, 1), ymd(year, 11, 11),
      ymd(year, 12, 24), ymd(year, 12, 25), ymd(year, 12, 26), ymd(year, 12, 31),
    ];
  } else {
    // Nowy Rok w sobotę nie przesuwa się na 31.12 (zasada NYSE).
    const ny = ymd(year, 1, 1);
    days = [
      ny.getUTCDay() === 6 ? null : observed(ny),
      nthWeekday(year, 1, 1, 3), nthWeekday(year, 2, 1, 3), addDays(e, -2), nthWeekday(year, 5, 1, -1),
      year >= 2022 ? observed(ymd(year, 6, 19)) : null,
      observed(ymd(year, 7, 4)), nthWeekday(year, 9, 1, 1), nthWeekday(year, 11, 4, 4), observed(ymd(year, 12, 25)),
    ].filter(Boolean);
  }
  const set = new Set(days.map(iso));
  cache.set(key, set);
  return set;
}

// market: 'GPW' | 'NYSE' | null (inne rynki — tylko weekendy).
export function isTradingDay(isoDate, market) {
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !market || !holidays(d.getUTCFullYear(), market).has(isoDate.slice(0, 10));
}

// Giełda spółki: GPW dla .WA i notowań w PLN, NYSE (USA) dla symboli w USD
// bez sufiksu giełdy, inaczej null.
export function marketOf(symbol, currency) {
  const s = String(symbol ?? '').toUpperCase();
  if (s.endsWith('.WA') || (currency === 'PLN' && !s.includes('.'))) return 'GPW';
  if ((currency || 'USD') === 'USD' && !s.includes('.')) return 'NYSE';
  return null;
}

// Czy notowanie z czasem `ts` (sekundy) pochodzi z dzisiejszej sesji
// w strefie giełdy. Przed otwarciem, w weekend i w święto — nie.
export function isTodaysSession(ts, timeZone, now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date(ts * 1000)) === fmt.format(now);
}
