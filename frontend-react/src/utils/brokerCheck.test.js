import { describe, it, expect } from 'vitest';
import { brokerCheck, brokerCheckIssues } from './brokerCheck.js';

describe('brokerCheck', () => {
  it('zgodne w granicach 0,5%', () => {
    const r = brokerCheck({ brokerValue: 10_030, positionsValue: 9_000, cashValue: 1_000 });
    expect(r.app).toBe(10_000);
    expect(r.diff).toBe(30);
    expect(r.ok).toBe(true);
  });

  it('różnica ponad próg — biuro ma więcej (np. niewpisana dywidenda)', () => {
    const r = brokerCheck({ brokerValue: 10_547, positionsValue: 9_000, cashValue: 1_000 });
    expect(r.diff).toBe(547);
    expect(r.pct).toBeCloseTo(5.186, 3);
    expect(r.ok).toBe(false);
  });

  it('bez wartości z biura nie ma wyniku', () => {
    expect(brokerCheck({ brokerValue: 0, positionsValue: 1 })).toBeNull();
  });
});

describe('brokerCheckIssues', () => {
  it('zbiera wykryte problemy', () => {
    const pos = [{ symbol: 'A', notFound: true }, { symbol: 'B', staleSince: 1 }, { symbol: 'C' }];
    expect(brokerCheckIssues(pos, { fxStale: 'stale' })).toEqual([
      { key: 'notFound', symbols: ['A'] }, { key: 'stale', symbols: ['B'] }, { key: 'fx' },
    ]);
    expect(brokerCheckIssues([{ symbol: 'C' }])).toEqual([]);
  });
});
