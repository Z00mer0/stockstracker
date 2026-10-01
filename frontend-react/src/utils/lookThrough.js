// ETF look-through: co naprawdę masz, gdy część portfela to fundusze.
// Każdy ETF rozkładamy na znane składniki (Yahoo podaje zwykle 10 największych)
// i dodajemy do akcji trzymanych bezpośrednio — ta sama spółka z kilku miejsc
// daje jedną łączną ekspozycję. Niepokazana część ETF-u to „pozostałe w ETF-ach".
//
//   positions: [{ symbol, name?, valuePLN }]
//   etfs:      { SYM: { name, holdings: [{ symbol, name, weight }] } }  — waga 0–1

// PKO.WA i PKO to ta sama spółka; porównujemy po symbolu bez giełdy.
const baseSymbol = s => String(s || '').toUpperCase().split('.')[0];

export function lookThrough(positions = [], etfs = {}) {
  const priced = positions.filter(p => p.valuePLN > 0);
  const total = priced.reduce((s, p) => s + p.valuePLN, 0);
  if (!(total > 0)) return null;
  const rows = new Map();
  const row = (key, symbol, name) => {
    if (!rows.has(key)) rows.set(key, { key, symbol, name, direct: 0, viaEtf: 0, sources: [] });
    return rows.get(key);
  };
  let etfValue = 0, covered = 0;
  for (const p of priced) {
    const etf = etfs[p.symbol];
    if (!etf) {
      const r = row(baseSymbol(p.symbol), p.symbol, p.name || p.symbol);
      r.symbol = p.symbol; // symbol z portfela ma pierwszeństwo przed tym z ETF-u
      r.direct += p.valuePLN;
      continue;
    }
    etfValue += p.valuePLN;
    for (const h of etf.holdings ?? []) {
      const v = p.valuePLN * h.weight;
      covered += v;
      const r = row(h.symbol ? baseSymbol(h.symbol) : `name:${h.name}`, h.symbol || '', h.name);
      r.viaEtf += v;
      if (!r.sources.includes(p.symbol)) r.sources.push(p.symbol);
    }
  }
  const out = [...rows.values()]
    .map(r => ({ ...r, total: r.direct + r.viaEtf, pct: ((r.direct + r.viaEtf) / total) * 100 }))
    .sort((a, b) => b.total - a.total);
  return {
    rows: out,
    total,
    etfValue,
    etfPct: (etfValue / total) * 100,
    coveredPct: etfValue > 0 ? (covered / etfValue) * 100 : 0,
    restInEtfs: etfValue - covered,
    overlaps: out.filter(r => r.direct > 0 && r.viaEtf > 0).length + out.filter(r => r.direct === 0 && r.sources.length > 1).length,
  };
}

// Sektory po rozłożeniu ETF-ów: pozycja-fundusz z rozkładem sektorowym zostaje
// podzielona na kawałki (wartość i wynik proporcjonalnie do wag). Wagi
// sumujące się poniżej 1 (obligacje, gotówka) — reszta jako „Inne".
//   positions: [{ symbol, sector, valuePLN, plPLN }]
export function sectorLookThrough(positions = [], etfs = {}) {
  const out = [];
  for (const p of positions) {
    const sectors = etfs[p.symbol]?.sectors;
    const entries = Object.entries(sectors ?? {}).filter(([, w]) => w > 0);
    if (!entries.length) { out.push(p); continue; }
    const sum = entries.reduce((s, [, w]) => s + w, 0);
    const parts = sum > 1 ? entries.map(([k, w]) => [k, w / sum]) : [...entries, ...(sum < 0.999 ? [['Inne', 1 - sum]] : [])];
    for (const [sector, w] of parts) {
      out.push({ ...p, sector, industry: sector, valuePLN: p.valuePLN * w, plPLN: (p.plPLN ?? 0) * w, viaEtf: true });
    }
  }
  return out;
}
