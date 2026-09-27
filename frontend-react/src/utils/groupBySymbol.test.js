import { describe, it, expect } from 'vitest';
import { groupBySymbol } from './realizedPL.js';

const trade = (qty, costBasis, sellPrice) => ({
  symbol: 'ABC', currency: 'PLN', qty, costBasis, sellPrice,
  plNative: (sellPrice - costBasis) * qty, plPLN: (sellPrice - costBasis) * qty,
  pct: (sellPrice / costBasis - 1) * 100,
});

describe('groupBySymbol', () => {
  it('% spółki ważony kosztem, nie zwykła średnia transakcji', () => {
    const [g] = groupBySymbol([trade(10, 100, 50), trade(1000, 100, 110)]);
    // koszt 101 000, wynik −500 + 10 000 = 9500 → +9,41%; zwykła średnia dawała −20%
    expect(g.pct).toBeCloseTo(9500 / 101000 * 100, 10);
    expect(g.avgCost).toBeCloseTo(100, 10);
    expect(g.avgSell).toBeCloseTo((500 + 110000) / 1010, 10);
  });
});
