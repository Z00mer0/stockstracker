import { describe, it, expect } from 'vitest';
import { lookThrough, sectorLookThrough } from './lookThrough.js';

const etfs = {
  SPY: { name: 'S&P 500', holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.07 }, { symbol: 'MSFT', name: 'Microsoft', weight: 0.06 }] },
  QQQ: { name: 'Nasdaq 100', holdings: [{ symbol: 'AAPL', name: 'Apple', weight: 0.09 }, { symbol: 'MSFT', name: 'Microsoft', weight: 0.08 }] },
};

describe('lookThrough', () => {
  it('sumuje spółkę trzymaną bezpośrednio i przez ETF-y', () => {
    const r = lookThrough([
      { symbol: 'AAPL', valuePLN: 1000 },
      { symbol: 'SPY', valuePLN: 10000 },
      { symbol: 'QQQ', valuePLN: 5000 },
      { symbol: 'PKO.WA', valuePLN: 4000 },
    ], etfs);
    const aapl = r.rows.find(x => x.key === 'AAPL');
    // 1000 + 10000 × 7% + 5000 × 9% = 1000 + 700 + 450 = 2150
    expect(aapl).toMatchObject({ symbol: 'AAPL', direct: 1000, total: 2150, sources: ['SPY', 'QQQ'] });
    expect(aapl.viaEtf).toBeCloseTo(1150, 9);
    expect(aapl.pct).toBeCloseTo(2150 / 20000 * 100, 9);
    expect(r.etfPct).toBeCloseTo(75, 9);
    // Znane składniki: 10000 × 13% + 5000 × 17% = 1300 + 850 = 2150 z 15000
    expect(r.coveredPct).toBeCloseTo(2150 / 15000 * 100, 9);
    expect(r.restInEtfs).toBeCloseTo(12850, 9);
    expect(r.rows[0].key).toBe('PKO'); // 4000 zł bezpośrednio — największa pozycja
    expect(r.overlaps).toBe(2);        // AAPL (bezpośrednio + ETF), MSFT (dwa ETF-y)
  });

  it('ten sam emitent z różnym sufiksem giełdy to jedna spółka', () => {
    const r = lookThrough([{ symbol: 'PKO.WA', valuePLN: 100 }, { symbol: 'ETFW20L.WA', valuePLN: 1000 }],
      { 'ETFW20L.WA': { holdings: [{ symbol: 'PKO', name: 'PKO BP', weight: 0.15 }] } });
    expect(r.rows.find(x => x.key === 'PKO')).toMatchObject({ symbol: 'PKO.WA', direct: 100, viaEtf: 150 });
  });

  it('pusty portfel → null', () => {
    expect(lookThrough([], etfs)).toBeNull();
  });
});

describe('sectorLookThrough', () => {
  it('dzieli ETF na sektory, resztę do „Inne"; akcje bez zmian', () => {
    const out = sectorLookThrough([
      { symbol: 'SPY', sector: null, valuePLN: 1000, plPLN: 100 },
      { symbol: 'PKO.WA', sector: 'Financial Services', valuePLN: 500, plPLN: 10 },
    ], { SPY: { sectors: { Technology: 0.6, 'Financial Services': 0.3 } } });
    expect(out.map(p => [p.symbol, p.sector, +p.valuePLN.toFixed(6), +p.plPLN.toFixed(6)])).toEqual([
      ['SPY', 'Technology', 600, 60],
      ['SPY', 'Financial Services', 300, 30],
      ['SPY', 'Inne', 100, 10],
      ['PKO.WA', 'Financial Services', 500, 10],
    ]);
  });
});
