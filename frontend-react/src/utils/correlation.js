// Korelacja dziennych stóp zwrotu między pozycjami portfela.
// Stopy liczone z kolejnych notowań danego papieru, a pary porównywane tylko
// w dniach notowanych przez oba (GPW i USA mają inne święta).
//
// Ograniczenie: sesja w USA kończy się po zamknięciu GPW, więc ruch z
// amerykańskiego popołudnia odbija się w Warszawie dopiero następnego dnia.
// Korelacja spółek z różnych giełd wychodzi przez to niższa niż w
// rzeczywistości — stąd uwaga pod tabelą.

export const MIN_COMMON_DAYS = 60;

// [{ date, price }] rosnąco → Map date → stopa dnia
export function returnsByDate(points) {
  const out = new Map();
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1].price, p1 = points[i].price;
    if (p0 > 0 && p1 > 0) out.set(points[i].date, p1 / p0 - 1);
  }
  return out;
}

// Pearson na wspólnych dniach; null przy zbyt krótkiej wspólnej historii.
export function correlation(a, b) {
  const xs = [], ys = [];
  for (const [date, x] of a) {
    const y = b.get(date);
    if (y !== undefined) { xs.push(x); ys.push(y); }
  }
  const n = xs.length;
  if (n < MIN_COMMON_DAYS) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    cov += dx * dy; vx += dx * dx; vy += dy * dy;
  }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : null;
}

// series: { SYMBOL: [{ date, price }] } → { symbols, matrix, pairs }
//   matrix[i][j] — korelacja (1 na przekątnej, null przy braku danych)
//   pairs — pary bez przekątnej, od najmocniej skorelowanej
export function correlationMatrix(series) {
  const symbols = Object.keys(series);
  const rets = symbols.map(s => returnsByDate(series[s]));
  const matrix = symbols.map(() => symbols.map(() => null));
  const pairs = [];
  for (let i = 0; i < symbols.length; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < symbols.length; j++) {
      const r = correlation(rets[i], rets[j]);
      matrix[i][j] = matrix[j][i] = r;
      if (r != null) pairs.push({ a: symbols[i], b: symbols[j], r });
    }
  }
  pairs.sort((p, q) => q.r - p.r);
  return { symbols, matrix, pairs };
}

// Średnia korelacja par ważona udziałami w portfelu (w_i · w_j) — miara, na
// ile portfel naprawdę jest zdywersyfikowany. weights: { SYMBOL: wartość }.
export function weightedAvgCorrelation(pairs, weights) {
  let sum = 0, wsum = 0;
  for (const { a, b, r } of pairs) {
    const w = (weights[a] ?? 0) * (weights[b] ?? 0);
    sum += w * r; wsum += w;
  }
  return wsum > 0 ? sum / wsum : null;
}
