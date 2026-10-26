import { describe, it, expect, beforeEach } from 'vitest';
import { withholdingRate, getTaxRate, US_TAX_KEY } from './dividendService.js';

const store = {};
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
});

describe('podatek u źródła wg kraju spółki', () => {
  it('USA wg odpowiedzi o W-8BEN', () => {
    expect(withholdingRate('AAPL', 'USD')).toBe(0.15);
    store[US_TAX_KEY] = '30';
    expect(withholdingRate('AAPL', 'USD')).toBe(0.30);
  });

  it('inne rynki mają własne stawki, W-8BEN ich nie dotyczy', () => {
    store[US_TAX_KEY] = '30';
    expect(withholdingRate('ULVR.L', 'GBP')).toBe(0);
    expect(withholdingRate('SAP.DE', 'EUR')).toBeCloseTo(0.26375, 10);
    expect(withholdingRate('NESN.SW', 'CHF')).toBe(0.35);
    expect(withholdingRate('XYZ.QQ', 'EUR')).toBe(0.15);
    expect(withholdingRate('NOSUFFIX', 'EUR')).toBe(0.15);
  });

  it('łącznie z dopłatą w Polsce co najmniej 19%; IKE tylko u źródła', () => {
    expect(getTaxRate('ULVR.L', 'GBP')).toBe(0.19);
    expect(getTaxRate('NESN.SW', 'CHF')).toBe(0.35);
    expect(getTaxRate('ULVR.L', 'GBP', 'IKE')).toBe(0);
    expect(getTaxRate('PKO.WA', 'PLN')).toBe(0.19);
  });
});
