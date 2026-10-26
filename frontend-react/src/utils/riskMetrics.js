// Miary ryzyka portfela liczone na dziennych stopach zwrotu ważonych czasem
// (indeks TWR z utils/historyStats.js), a nie na surowej wartości portfela.
// Wcześniej każda wpłata była „wzrostem", a wypłata „spadkiem": zmienność,
// Sharpe, Sortino i obsunięcie mierzyły też ruchy pieniędzy użytkownika.
//
// Zmienność = odch. std. (próbkowe) · √(stóp na rok), Sharpe/Sortino z
// rocznej średniej i stopy wolnej od ryzyka 4,5%. Stóp na rok nie zakładamy
// na sztywno 252: snapshoty zapisują się codziennie, także w weekendy, więc
// rok to ~365 stóp, z czego weekendowe są prawie zerowe. Mnożnik 252
// zaniżał wtedy zmienność o ~17%, a średnią roczną o ~30%.

const MAX_DAILY_MOVE = 0.5; // |r| > 50% dziennie = uszkodzony snapshot, nie rynek

// series: [{ date, index }] rosnąco → [{ date, prevDate, r }]
export function dailyReturns(series) {
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1], cur = series[i];
    if (!(prev.index > 0)) continue;
    const r = cur.index / prev.index - 1;
    if (Math.abs(r) <= MAX_DAILY_MOVE) out.push({ date: cur.date, prevDate: prev.date, r });
  }
  return out;
}

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const DAY = 86400000;

// Ile stóp przypada na rok w tej serii: liczba stóp / lata, które obejmują.
// Bez dat (albo z zerowym okresem) — 252 sesje.
export function periodsPerYear(returns) {
  const t0 = Date.parse(returns[0]?.prevDate), t1 = Date.parse(returns[returns.length - 1]?.date);
  const years = (t1 - t0) / DAY / 365;
  return years > 0 ? returns.length / years : 252;
}

export function volatility(returns, ppy = periodsPerYear(returns)) {
  const r = returns.map(x => x.r);
  if (r.length < 10) return null;
  const m = mean(r);
  const variance = r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance * ppy) * 100;
}

export function sharpe(returns, rf = 0.045, ppy = periodsPerYear(returns)) {
  if (returns.length < 10) return null;
  const vol = volatility(returns, ppy) / 100;
  return vol > 0 ? (mean(returns.map(x => x.r)) * ppy - rf) / vol : null;
}

export function sortino(returns, rf = 0.045, ppy = periodsPerYear(returns)) {
  const r = returns.map(x => x.r);
  if (r.length < 10) return null;
  const downside = r.filter(x => x < 0);
  if (!downside.length) return null;
  const downVol = Math.sqrt(downside.reduce((s, x) => s + x ** 2, 0) / downside.length * ppy);
  return downVol > 0 ? (mean(r) * ppy - rf) / downVol : null;
}

// Beta względem benchmarku. Stopa benchmarku liczona dokładnie między tymi
// samymi dniami co stopa portfela (prevDate → date). Wcześniej tablice były
// parowane po indeksie, a odfiltrowanie jednej stopy portfela przesuwało
// wszystkie następne pary o dzień.
//   benchPrices: { 'YYYY-MM-DD': cena } — brakujące dni biorą ostatnią znaną cenę
export function beta(returns, benchPrices) {
  const dates = Object.keys(benchPrices).sort();
  const priceAt = d => {
    // ostatnia cena z dnia <= d
    let lo = 0, hi = dates.length - 1, found = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= d) { found = dates[mid]; lo = mid + 1; } else hi = mid - 1;
    }
    return found ? benchPrices[found] : null;
  };
  const pairs = [];
  for (const { date, prevDate, r } of returns) {
    const b0 = priceAt(prevDate), b1 = priceAt(date);
    if (b0 > 0 && b1 != null) pairs.push([r, b1 / b0 - 1]);
  }
  if (pairs.length < 10) return null;
  const n = pairs.length;
  const mp = pairs.reduce((s, [p]) => s + p, 0) / n;
  const mb = pairs.reduce((s, [, b]) => s + b, 0) / n;
  const cov = pairs.reduce((s, [p, b]) => s + (p - mp) * (b - mb), 0) / n;
  const varB = pairs.reduce((s, [, b]) => s + (b - mb) ** 2, 0) / n;
  return varB > 0 ? cov / varB : null;
}
