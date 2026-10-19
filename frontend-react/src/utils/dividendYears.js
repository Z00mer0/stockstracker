// Dywidendy rok po roku z dynamiką. Bieżący rok jest niepełny, więc
// porównujemy go z tym samym okresem roku poprzedniego (do dzisiejszego
// dnia), a nie z całym rokiem — inaczej w październiku zawsze wychodził spadek.
//   divs: [{ date: 'YYYY-MM-DD', … }], amountOf(d) → kwota w walucie wyświetlania
// Zwraca rosnąco: [{ year, total, growthPct | null, partial }].
export function dividendsByYear(divs, amountOf, today = new Date()) {
  const todayIso = today.toISOString().slice(0, 10);
  const thisYear = Number(todayIso.slice(0, 4));
  const sameDayLastYear = `${thisYear - 1}${todayIso.slice(4)}`;
  const totals = new Map();
  let prevYtd = 0;
  for (const d of divs) {
    const y = Number(String(d.date ?? '').slice(0, 4));
    if (!y || d.date > todayIso) continue;
    const v = amountOf(d) || 0;
    totals.set(y, (totals.get(y) ?? 0) + v);
    if (y === thisYear - 1 && d.date <= sameDayLastYear) prevYtd += v;
  }
  return [...totals.keys()].sort((a, b) => a - b).map(year => {
    const total = totals.get(year);
    const partial = year === thisYear;
    const base = partial ? prevYtd : totals.get(year - 1);
    return { year, total, partial, growthPct: base > 0 ? (total / base - 1) * 100 : null };
  });
}
