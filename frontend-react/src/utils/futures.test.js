import { describe, it, expect } from 'vitest';
import { defaultMultiplier, futureValue, withFutureValue, futureQuoteSymbol } from './futures.js';

describe('kontrakty terminowe', () => {
  it('mnożniki domyślne', () => {
    expect(defaultMultiplier('fw20z2620')).toBe(20);
    expect(defaultMultiplier('FW40Z26')).toBe(40);
    expect(defaultMultiplier('FUSDZ26')).toBe(1000);
    expect(defaultMultiplier('FPKOZ26')).toBe(100);
  });

  it('długa: depozyt + kontrakty × mnożnik × zmiana kursu', () => {
    expect(futureValue(5000, { side: 'long', contracts: 2, multiplier: 20, entryPrice: 2900 }, 2950)).toEqual({ value: 7000, pl: 2000 });
  });

  it('krótka zarabia na spadku, traci na wzroście', () => {
    const f = { side: 'short', contracts: 1, multiplier: 20, entryPrice: 2900 };
    expect(futureValue(5000, f, 2800).pl).toBe(2000);
    expect(futureValue(5000, f, 3000)).toEqual({ value: 3000, pl: -2000 });
  });

  it('bez kursu — sam depozyt', () => {
    expect(futureValue(5000, { side: 'long', contracts: 1, multiplier: 20, entryPrice: 2900 }, null)).toEqual({ value: 5000, pl: null });
  });

  it('withFutureValue bierze kurs po symbolu STOOQ:', () => {
    const a = { id: 'x', value: 5000, future: { code: 'fw20z2620', side: 'long', contracts: 1, multiplier: 20, entryPrice: 2900 } };
    expect(futureQuoteSymbol('fw20z2620')).toBe('STOOQ:FW20Z2620');
    expect(withFutureValue(a, { 'STOOQ:FW20Z2620': 2910 })).toMatchObject({ margin: 5000, value: 5200, pl: 200, futurePrice: 2910 });
    const plain = { id: 'y', value: 1 };
    expect(withFutureValue(plain, {})).toBe(plain);
  });
});
