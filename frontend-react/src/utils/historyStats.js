// Statystyki Historii liczone bez wpłat i wypłat.
//
// Wcześniej: zysk okresu = wartość na końcu − wartość na początku, stopa
// zwrotu = wartość / pierwsza wartość − 1, CAGR z (wartość / koszt)
// rozciągniętego na długość okresu. Każda wpłata i każdy zakup liczyły się
// jak zarobek — demo pokazywało +381%, a kolumna P&L tej samej strony +12,5%.
//
// Teraz:
//   zysk dnia   = wartość − kapitał własny
//   zysk okresu = zysk na końcu − zysk na początku
//   stopa zwrotu — ważona czasem (TWR): dzienne stopy z wartości po odjęciu
//                  wpłat tego dnia, przemnożone. Wpłata nie jest zyskiem,
//                  a duża wpłata nie „rozwadnia" wcześniejszych wyników.
//   CAGR        — TWR w skali roku, od 90 dni
//   obsunięcie  — liczone na indeksie TWR, nie na wartości (wypłata to nie strata)
//
// rows: rosnąco po dacie, { date, total, capital } w jednej walucie.

const DAY = 86400000;

// Indeks TWR: 1 w pierwszym dniu. Przepływ (zmiana kapitału) przypisany
// końcowi dnia: r = (V_t − F_t) / V_{t−1} − 1.
export function twrSeries(rows) {
  const out = [];
  let index = 1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (i > 0) {
      const prev = rows[i - 1];
      const flow = r.capital != null && prev.capital != null ? r.capital - prev.capital : 0;
      if (prev.total > 0 && r.total != null) index *= (r.total - flow) / prev.total;
    }
    out.push({ date: r.date, index });
  }
  return out;
}

export function maxDrawdown(series) {
  let peak = -Infinity, peakDate = null;
  let best = null;
  for (const p of series) {
    if (p.index > peak) { peak = p.index; peakDate = p.date; }
    const dd = peak > 0 ? (peak - p.index) / peak * 100 : 0;
    if (dd > 0 && (!best || dd > best.pct)) best = { pct: dd, from: peakDate, to: p.date };
  }
  return best;
}

export function historyStats(rows) {
  if (!rows.length) return { profit: null, twrPct: null, cagr: null, days: 0, mdd: null, series: [] };
  const first = rows[0], last = rows[rows.length - 1];
  const profitAt = r => (r.total != null && r.capital != null ? r.total - r.capital : null);
  const p0 = profitAt(first), p1 = profitAt(last);
  const series = twrSeries(rows);
  const twr = series[series.length - 1].index - 1;
  const days = Math.round((new Date(last.date) - new Date(first.date)) / DAY);
  return {
    profit: p0 != null && p1 != null ? p1 - p0 : null,
    twrPct: rows.length > 1 ? twr * 100 : null,
    cagr: days >= 90 && twr > -1 ? (Math.pow(1 + twr, 365 / days) - 1) * 100 : null,
    days,
    mdd: maxDrawdown(series),
    series,
  };
}
