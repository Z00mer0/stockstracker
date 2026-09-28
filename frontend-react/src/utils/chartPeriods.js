// Okresy wykresu zaawansowanego. Wskaźniki (MA50, RSI, MACD) potrzebują
// historii sprzed widocznego okresu — wcześniej liczono je tylko z danych
// okresu, więc na „1M" (ok. 21 sesji) MA50 nie było wcale, MA20 miało dwa
// punkty, a RSI/MACD startowały „na zimno". Teraz pobieramy dłuższy zakres
// (`range`), liczymy wskaźniki na całości i pokazujemy tylko okres (`show`).
export const CHART_PERIODS = {
  '1D':  { range: '5d',  interval: '5m',  show: { sessions: 1 } },
  '1W':  { range: '1mo', interval: '15m', show: { sessions: 5 } },
  '1M':  { range: '6mo', interval: '1d',  show: { days: 31 } },
  '3M':  { range: '1y',  interval: '1d',  show: { days: 92 } },
  '6M':  { range: '2y',  interval: '1d',  show: { days: 183 } },
  '1Y':  { range: '2y',  interval: '1d',  show: { days: 366 } },
  'ALL': { range: 'max', interval: '1wk', show: null },
};

// Indeks pierwszej świecy okresu. Liczone od daty OSTATNIEJ świecy, nie od
// dziś — w weekend „1D" to ostatnia sesja, a nie pusty wykres.
export function displayStart(candles, period) {
  const cfg = CHART_PERIODS[period]?.show;
  if (!cfg || !candles.length) return 0;
  const last = candles[candles.length - 1].date;
  if (cfg.sessions) {
    const dates = [...new Set(candles.map(c => c.date))];
    const from = dates[Math.max(0, dates.length - cfg.sessions)];
    return candles.findIndex(c => c.date >= from);
  }
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - cfg.days);
  const cut = d.toISOString().slice(0, 10);
  const i = candles.findIndex(c => c.date > cut);
  return i < 0 ? 0 : i;
}
