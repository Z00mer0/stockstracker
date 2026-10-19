import { describe, it, expect } from 'vitest';
import { dividendsByYear } from './dividendYears.js';

describe('dividendsByYear', () => {
  const divs = [
    { date: '2024-06-01', v: 100 },
    { date: '2025-03-01', v: 50 },
    { date: '2025-06-01', v: 80 },
    { date: '2025-11-01', v: 70 },
    { date: '2026-03-01', v: 60 },
    { date: '2026-06-01', v: 90 },
    { date: '2026-12-01', v: 999 }, // przyszła — pomijana
  ];
  const today = new Date('2026-10-19T12:00:00Z');
  const rows = dividendsByYear(divs, d => d.v, today);

  it('sumy roczne i dynamika do pełnego poprzedniego roku', () => {
    expect(rows.map(r => [r.year, r.total, r.partial])).toEqual([[2024, 100, false], [2025, 200, false], [2026, 150, true]]);
    expect(rows[0].growthPct).toBeNull();
    expect(rows[1].growthPct).toBeCloseTo(100);
  });

  it('bieżący rok porównany z tym samym okresem roku wcześniej', () => {
    // 2026 do 19.10: 150; 2025 do 19.10: 130 (listopadowe 70 jeszcze nie)
    expect(rows[2].growthPct).toBeCloseTo((150 / 130 - 1) * 100);
  });

  it('pusto bez dywidend', () => {
    expect(dividendsByYear([], () => 0, today)).toEqual([]);
  });
});
