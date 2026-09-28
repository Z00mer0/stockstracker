import { describe, it, expect } from 'vitest';
import { compareWithBenchmark, benchInPLN, priceAt } from './benchmarkCompare.js';

const series = [
  { date: '2024-03-01', index: 1.0 },
  { date: '2024-12-31', index: 1.2 },
  { date: '2025-06-30', index: 1.08 },
  { date: '2025-12-31', index: 1.32 },
  { date: '2026-09-25', index: 1.452 },
];
const bench = [
  { date: '2024-02-29', price: 100 },   // przed pierwszym punktem — cena „z dnia ≤"
  { date: '2024-12-30', price: 110 },
  { date: '2025-06-30', price: 121 },
  { date: '2025-12-31', price: 99 },
  { date: '2026-09-24', price: 108.9 },
];

describe('compareWithBenchmark', () => {
  it('łącznie, rok po roku i różnica w pkt proc.', () => {
    const r = compareWithBenchmark(series, bench);
    expect(r.you).toBeCloseTo(45.2, 9);
    expect(r.bench).toBeCloseTo(8.9, 9);
    expect(r.diff).toBeCloseTo(36.3, 9);
    expect(r.years.map(y => [y.year, +y.you.toFixed(4), +y.bench.toFixed(4), y.partial])).toEqual([
      [2026, 10, 10, true],
      [2025, 10, -10, false],
      [2024, 20, 10, true],
    ]);
    expect(r.years[1].diff).toBeCloseTo(20, 9);
    expect(r.youCagr).toBeGreaterThan(r.benchCagr);
    expect(r.chart[0]).toEqual({ date: '2024-03-01', you: 0, bench: 0 });
  });

  it('za mało wspólnych punktów → null', () => {
    expect(compareWithBenchmark(series, [{ date: '2026-09-24', price: 1 }])).toBeNull();
  });
});

describe('benchInPLN', () => {
  it('mnoży przez kurs z dnia ≤ daty; przed pierwszym kursem — najstarszy znany', () => {
    const out = benchInPLN([{ date: '2024-01-01', price: 10 }, { date: '2024-06-01', price: 10 }],
      [{ date: '2024-03-01', rate: 4 }, { date: '2024-05-01', rate: 3.5 }]);
    expect(out.map(p => p.price)).toEqual([40, 35]);
    expect(priceAt([], '2024-01-01')).toBeNull();
  });
});
