// „Ty vs indeks": stopa zwrotu ważona czasem (TWR, bez wpłat i wypłat)
// porównana z indeksem w tych samych datach — łącznie, rocznie (CAGR) i per rok
// kalendarzowy.
//
//   series: [{ date, index }]  — indeks TWR z historyStats (rosnąco)
//   bench:  [{ date, price }]  — notowania indeksu (rosnąco)

// Ostatnia cena z dnia ≤ date (null, gdy indeks jeszcze nie notowany).
export function priceAt(bench, date) {
  let lo = 0, hi = bench.length - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (bench[mid].date <= date) { found = bench[mid].price; lo = mid + 1; } else hi = mid - 1;
  }
  return found;
}

// Indeks notowany w USD (S&P 500, NASDAQ, MSCI World) przeliczony na złote
// kursem z dnia — dla inwestora z Polski to jest realna alternatywa.
//   fxSeries: [{ date, rate }] rosnąco; bez kursu z dnia ≤ date bierzemy
//   najstarszy znany (fallback — lepszy niż mieszanie walut).
export function benchInPLN(bench, fxSeries) {
  if (!fxSeries.length) return bench;
  const fx = fxSeries.map(f => ({ date: f.date, price: f.rate }));
  return bench.map(p => ({ date: p.date, price: p.price * (priceAt(fx, p.date) ?? fx[0].price) }));
}

const pct = (a, b) => (a != null && b != null && b > 0 ? (a / b - 1) * 100 : null);

export function compareWithBenchmark(series, bench) {
  const pts = series.filter(p => priceAt(bench, p.date) != null);
  if (pts.length < 2) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const b0 = priceAt(bench, first.date), b1 = priceAt(bench, last.date);
  const you = pct(last.index, first.index);
  const idx = pct(b1, b0);
  const days = (new Date(last.date) - new Date(first.date)) / 86400000;
  const cagr = r => (days >= 365 && r != null && r > -100 ? (Math.pow(1 + r / 100, 365 / days) - 1) * 100 : null);

  // Rok po roku: od ostatniego punktu poprzedniego roku (albo pierwszego
  // punktu okresu) do ostatniego punktu danego roku.
  const years = [];
  let start = first;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], nextYear = pts[i + 1]?.date.slice(0, 4);
    if (nextYear === p.date.slice(0, 4)) continue;
    const y = Number(p.date.slice(0, 4));
    const yYou = pct(p.index, start.index);
    const yIdx = pct(priceAt(bench, p.date), priceAt(bench, start.date));
    years.push({
      year: y, from: start.date, to: p.date,
      partial: (start === first && first.date.slice(5) > '01-07') || (i === pts.length - 1 && p.date.slice(5) < '12-24'),
      you: yYou, bench: yIdx, diff: yYou != null && yIdx != null ? yYou - yIdx : null,
    });
    start = p;
  }
  return {
    from: first.date, to: last.date,
    you, bench: idx, diff: you - idx,
    youCagr: cagr(you), benchCagr: cagr(idx),
    years: years.reverse(),
    chart: pts.map(p => ({ date: p.date, you: pct(p.index, first.index), bench: pct(priceAt(bench, p.date), b0) })),
  };
}
