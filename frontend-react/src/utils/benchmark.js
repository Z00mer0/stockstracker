// Porównanie spółki z indeksem: oba szeregi jako % zmiany od wspólnego
// początku, dopasowane po DACIE. Wcześniej punkty łączono po indeksie, więc
// przy różnych dniach sesyjnych (GPW vs S&P 500) linie rozjeżdżały się w czasie.
//
// stock, bench: [{ date: 'YYYY-MM-DD', price }] posortowane rosnąco.
// Zwraca { stockPct, benchPct } — tablice długości stock; benchPct[i] to
// ostatnie notowanie indeksu z dnia ≤ stock[i].date (null przed pierwszym).
export function alignBenchmark(stock, bench) {
  const benchAt = [];
  let j = -1;
  for (const s of stock) {
    while (j + 1 < bench.length && bench[j + 1].date <= s.date) j++;
    benchAt.push(j >= 0 ? bench[j].price : null);
  }
  const start = benchAt.findIndex(v => v != null);
  if (start < 0) return { stockPct: [], benchPct: [] };
  const s0 = stock[start].price, b0 = benchAt[start];
  return {
    stockPct: stock.map((s, i) => (i < start ? null : ((s.price - s0) / s0) * 100)),
    benchPct: benchAt.map((b, i) => (i < start ? null : ((b - b0) / b0) * 100)),
  };
}
