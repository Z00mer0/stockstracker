import { describe, it, expect } from 'vitest';
import { parseMix, blendSeries } from './benchmarkMix.js';

describe('parseMix', () => {
  it('rozpoznaje mieszankę i wagi', () => {
    expect(parseMix('MIX:URTH*60+SYNTH:LOK5*40')).toEqual([{ key: 'URTH', weight: 0.6 }, { key: 'SYNTH:LOK5', weight: 0.4 }]);
    expect(parseMix('PL:WIG')).toBeNull();
    expect(parseMix('MIX:URTH*0')).toBeNull();
  });
});

describe('blendSeries', () => {
  it('codzienne równoważenie wag', () => {
    const stock = [{ date: '2026-01-02', price: 100 }, { date: '2026-01-05', price: 110 }, { date: '2026-01-06', price: 99 }];
    // Lokata notowana codziennie, także w weekend.
    const dep = [{ date: '2026-01-01', price: 50 }, { date: '2026-01-02', price: 50 }, { date: '2026-01-04', price: 51 }, { date: '2026-01-06', price: 51 }];
    const out = blendSeries([{ series: stock, weight: 0.6 }, { series: dep, weight: 0.4 }]);
    expect(out.map(p => p.date)).toEqual(['2026-01-02', '2026-01-05', '2026-01-06']);
    expect(out[0].price).toBe(100);
    // +10% akcji, +2% lokaty → 0,6·1,10 + 0,4·1,02 = 1,068
    expect(out[1].price).toBeCloseTo(106.8);
    // −10% akcji, lokata bez zmian → ×0,94
    expect(out[2].price).toBeCloseTo(106.8 * 0.94);
  });

  it('pomija dni, zanim notowane są wszystkie składniki', () => {
    const a = [{ date: '2026-01-01', price: 1 }, { date: '2026-01-02', price: 2 }];
    const b = [{ date: '2026-01-02', price: 5 }];
    expect(blendSeries([{ series: a, weight: 0.5 }, { series: b, weight: 0.5 }])).toEqual([{ date: '2026-01-02', price: 100 }]);
    expect(blendSeries([])).toEqual([]);
  });
});
