import { describe, it, expect } from 'vitest';
import { fxDecompose } from './useFxBreakdown.js';

describe('fxDecompose', () => {
  it('spółka + waluta = wartość dziś − koszt po kursie z zakupu', () => {
    // 10 akcji kupione po 100 $ przy 4,00 zł; dziś 120 $ przy 3,60 zł.
    const r = fxDecompose({ qty: 10, price: 120, avgPrice: 100, purchaseFx: 4.0, currentFx: 3.6 });
    expect(r.stockPLN).toBeCloseTo(800, 9);   // 10 × 20 $ × 4,00
    expect(r.fxPLN).toBeCloseTo(-480, 9);     // 10 × 120 $ × (−0,40)
    expect(r.totalPLN).toBeCloseTo(10 * 120 * 3.6 - 10 * 100 * 4.0, 9);
  });
});
