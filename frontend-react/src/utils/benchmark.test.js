import { describe, it, expect } from 'vitest';
import { alignBenchmark } from './benchmark.js';

describe('alignBenchmark', () => {
  it('dopasowanie po dacie, brakujący dzień indeksu = ostatnie notowanie', () => {
    const stock = [
      { date: '2026-01-02', price: 100 },
      { date: '2026-01-05', price: 110 },
      { date: '2026-01-06', price: 99 },   // w USA święto — brak notowania indeksu
      { date: '2026-01-07', price: 121 },
    ];
    const bench = [
      { date: '2026-01-02', price: 50 },
      { date: '2026-01-05', price: 55 },
      { date: '2026-01-07', price: 60 },
    ];
    const r = alignBenchmark(stock, bench);
    expect(r.stockPct.map(v => +v.toFixed(6))).toEqual([0, 10, -1, 21]);
    expect(r.benchPct.map(v => +v.toFixed(6))).toEqual([0, 10, 10, 20]);
  });

  it('indeks zaczyna się później — wspólny początek od pierwszego wspólnego dnia', () => {
    const stock = [{ date: '2026-01-01', price: 10 }, { date: '2026-01-02', price: 20 }, { date: '2026-01-03', price: 30 }];
    const bench = [{ date: '2026-01-02', price: 100 }, { date: '2026-01-03', price: 150 }];
    const r = alignBenchmark(stock, bench);
    expect(r.stockPct).toEqual([null, 0, 50]);
    expect(r.benchPct).toEqual([null, 0, 50]);
  });

  it('brak wspólnych dni', () => {
    expect(alignBenchmark([{ date: '2026-01-01', price: 1 }], [{ date: '2026-02-01', price: 1 }])).toEqual({ stockPct: [], benchPct: [] });
  });
});
