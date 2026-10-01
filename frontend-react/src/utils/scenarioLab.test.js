import { describe, it, expect } from 'vitest';
import { bsPrice, bsDelta, calcPayoff, calcKPIs, normCDF } from './scenarioLab.js';

describe('Black-Scholes', () => {
  // Wartości podręcznikowe: S=K=100, T=1, r=5%, σ=20%.
  it('cena call/put i delta', () => {
    expect(bsPrice(100, 100, 1, 0.05, 0.2, 'call')).toBeCloseTo(10.4506, 3);
    expect(bsPrice(100, 100, 1, 0.05, 0.2, 'put')).toBeCloseTo(5.5735, 3);
    expect(bsDelta(100, 100, 1, 0.05, 0.2, 'call')).toBeCloseTo(0.6368, 3);
  });

  it('parytet put-call', () => {
    const c = bsPrice(110, 95, 0.4, 0.05, 0.35, 'call');
    const p = bsPrice(110, 95, 0.4, 0.05, 0.35, 'put');
    expect(c - p).toBeCloseTo(110 - 95 * Math.exp(-0.05 * 0.4), 5);
  });

  it('normCDF', () => {
    expect(normCDF(0)).toBeCloseTo(0.5, 7);
    expect(normCDF(1.96)).toBeCloseTo(0.975, 3);
  });
});

describe('payoff i KPI', () => {
  const base = { entry: 100, strike: 95, premium: 2, T: 0.1, iv: 0.3 };

  it('cash-secured put skaluje się liczbą kontraktów (wcześniej zawsze 1)', () => {
    const one = calcPayoff('csp', [80, 100], { ...base, qty: 1 }).expiry;
    const five = calcPayoff('csp', [80, 100], { ...base, qty: 5 }).expiry;
    expect(one).toEqual([(80 - 95 + 2) * 100, 2 * 100]);
    expect(five).toEqual(one.map(v => v * 5));
    expect(calcKPIs('csp', { ...base, qty: 5 })).toMatchObject({ maxProfit: 1000, maxLoss: -(95 - 2) * 500, bpe: 95 * 500 });
  });

  it('long call przy wygaśnięciu: (max(0, S−K) − premia) · 100 · kontrakty', () => {
    expect(calcPayoff('long-call', [90, 110], { ...base, qty: 2 }).expiry).toEqual([-2 * 200, (15 - 2) * 200]);
  });

  it('covered call: qty to akcje, 100 akcji = 1 kontrakt', () => {
    const [atStrikeUp] = calcPayoff('covered-call', [120], { ...base, strike: 110, qty: 100 }).expiry;
    expect(atStrikeUp).toBeCloseTo((110 - 100 + 2) * 100, 8); // zysk ograniczony strike'iem
    // maks. strata = wartość wykresu przy kursie 0 (premia zostaje)
    const [atZero] = calcPayoff('covered-call', [0], { ...base, strike: 110, qty: 100 }).expiry;
    expect(calcKPIs('covered-call', { ...base, strike: 110, qty: 100 }).maxLoss).toBeCloseTo(atZero, 8);
  });

  it('iron condor skaluje się liczbą kontraktów (wcześniej zawsze 1)', () => {
    const ic = { ...base, strike: 90, strike2: 110, wing: 5, premium: 1.5 };
    // w środku: pełna premia; poza skrzydłem: strata = (skrzydło − premia)
    expect(calcPayoff('iron-condor', [100, 70], { ...ic, qty: 3 }).expiry).toEqual([1.5 * 300, -(5 - 1.5) * 300]);
    expect(calcKPIs('iron-condor', { ...ic, qty: 3 })).toMatchObject({ maxProfit: 450, maxLoss: -1050, bpe: 1050 });
  });
});
