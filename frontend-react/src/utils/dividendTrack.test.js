import { describe, it, expect } from 'vitest';
import { dividendTrack } from './dividendTrack.js';

const mk = pairs => pairs.map(([date, amount]) => ({ date, amount }));

describe('dividendTrack', () => {
  it('sumuje pełne lata, pomija bieżący i niepełny pierwszy', () => {
    const r = dividendTrack(mk([['2016-12-01', 9], ['2024-03-01', 1], ['2024-09-01', 1], ['2025-03-01', 2.2], ['2026-03-01', 5]]), '2026-11-09');
    expect(r.years).toHaveLength(9);
    expect(r.years[0].year).toBe(2017);
    expect(r.years.at(-1)).toEqual({ year: 2025, perShare: 2.2 });
    expect(r.years.at(-2).perShare).toBe(2);
  });

  it('lata z rzędu i średnioroczny wzrost z 5 lat', () => {
    // 2020..2025: 1 → 1,61051 po 5 latach = 10% rocznie
    const r = dividendTrack(mk([['2019-05-01', 1], ['2020-05-01', 1], ['2021-05-01', 1.1], ['2022-05-01', 1.21], ['2023-05-01', 1.331], ['2024-05-01', 1.4641], ['2025-05-01', 1.61051]]), '2026-11-09');
    expect(r.streak).toBe(7);
    expect(r.growth.years).toBe(5);
    expect(r.growth.pct).toBeCloseTo(10, 6);
  });

  it('przerwa w wypłatach zeruje ciąg; za krótka historia bez wzrostu', () => {
    expect(dividendTrack(mk([['2023-05-01', 1], ['2025-05-01', 1]]), '2026-11-09')).toMatchObject({ streak: 1, growth: null });
    expect(dividendTrack(mk([['2023-05-01', 1]]), '2026-11-09')).toMatchObject({ streak: 0, growth: null });
    expect(dividendTrack([], '2026-11-09').streak).toBe(0);
  });
});
