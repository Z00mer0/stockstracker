// Benchmark mieszany, np. 60% akcji + 40% lokaty — portfel porównania, który
// codziennie wraca do zadanych wag (stopa dnia = suma wag × stopy składników).
import { priceAt } from './benchmarkCompare.js';

// „MIX:URTH*60+SYNTH:LOK5*40" → [{ key: 'URTH', weight: 0.6 }, …]; null, gdy to nie mieszanka.
export function parseMix(key) {
  if (!String(key ?? '').startsWith('MIX:')) return null;
  const legs = key.slice(4).split('+').map(part => {
    const i = part.lastIndexOf('*');
    return { key: part.slice(0, i), weight: Number(part.slice(i + 1)) / 100 };
  });
  return legs.every(l => l.key && l.weight > 0) ? legs : null;
}

// legs: [{ series: [{ date, price }] rosnąco, weight }]. Daty z pierwszego
// składnika (giełdowego); pozostałe biorą ostatnią cenę z dnia ≤ tej daty.
// Start = 100 w pierwszym dniu, w którym notowane są wszystkie składniki.
export function blendSeries(legs) {
  if (!legs.length || !legs[0].series.length) return [];
  const out = [];
  let prev = null;
  let index = 100;
  for (const { date } of legs[0].series) {
    const prices = legs.map(l => priceAt(l.series, date));
    if (prices.some(p => p == null || !(p > 0))) continue;
    if (prev) index *= legs.reduce((s, l, i) => s + l.weight * (prices[i] / prev[i]), 0);
    out.push({ date, price: index });
    prev = prices;
  }
  return out;
}
