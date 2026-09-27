// Kalkulator FIRE — czysta matematyka przeniesiona z Analysis.jsx bez zmian.

// Deterministyczny PRNG — te same suwaki dają zawsze ten sam wachlarz
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lata do celu przy stałym realnym zwrocie i comiesięcznych wpłatach
// (wyszukiwanie binarne po miesiącach, do 100 lat). 0 — cel już osiągnięty,
// null — poza 100 latami.
export function yearsToFire({ start, monthlySav, realReturn, target }) {
  if (!(target > 0) || !(start >= 0)) return null;
  if (start >= target) return 0;
  const mr = Math.pow(1 + realReturn, 1 / 12) - 1;
  let lo = 0, hi = 1200;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    const fv = start * Math.pow(1 + mr, mid) +
      (mr > 0.000001 ? monthlySav * (Math.pow(1 + mr, mid) - 1) / mr : monthlySav * mid);
    if (fv >= target) hi = mid; else lo = mid;
  }
  return hi <= 1199 ? hi / 12 : null;
}

// Monte Carlo: miesięczne zwroty lognormalne (średnia = realny zwrot, odch. = vol),
// wpłaty co miesiąc; zwraca percentyle wartości per rok i rozkład roku FIRE
export function runFireMonteCarlo({ start, monthlySav, realReturn, vol, target, maxYears, paths = 500 }) {
  const rand = mulberry32(20260715);
  const muM = Math.log(1 + realReturn) / 12 - (vol * vol) / 24;
  const sigM = vol / Math.sqrt(12);
  const months = maxYears * 12;
  const yearly = Array.from({ length: maxYears + 1 }, () => []);
  const hitYears = [];
  for (let p = 0; p < paths; p++) {
    let v = start; let hit = null;
    yearly[0].push(v);
    for (let m = 1; m <= months; m++) {
      const u1 = rand() || 1e-12, u2 = rand();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = v * Math.exp(muM + sigM * z) + monthlySav;
      if (hit == null && v >= target) hit = m / 12;
      if (m % 12 === 0) yearly[m / 12].push(v);
    }
    hitYears.push(hit ?? Infinity);
  }
  const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const startYear = new Date().getFullYear();
  const rows = yearly.map((vals, i) => ({
    year: startYear + i,
    band: [q(vals, 0.1), q(vals, 0.9)],
    median: q(vals, 0.5),
  }));
  const fy = (p) => { const v = q(hitYears, p); return v === Infinity ? null : startYear + Math.ceil(v); };
  return {
    rows,
    probHit: hitYears.filter(h => h !== Infinity).length / paths,
    optimistic: fy(0.1),
    median: fy(0.5),
    pessimistic: fy(0.9),
    horizon: maxYears,
  };
}
