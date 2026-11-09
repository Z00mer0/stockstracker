import { describe, it, expect } from 'vitest';
import { monthlyReport, monthBounds, shiftMonth, changePct } from './monthlyReport.js';

describe('monthBounds / shiftMonth', () => {
  it('granice miesiąca i przesunięcie', () => {
    expect(monthBounds('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28', prevEnd: '2026-01-31' });
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});

describe('monthlyReport', () => {
  const snapshots = [
    { date: '2026-09-28', total: 9000, capital: 9000 },
    { date: '2026-09-30', total: 10000, capital: 9000 },
    { date: '2026-10-15', total: 12500, capital: 11000 },
    { date: '2026-10-31', total: 12800, capital: 11000 },
    { date: '2026-11-03', total: 13000, capital: 11000 },
  ];
  const tx = [
    { type: 'CASH', price: 2000, currency: 'PLN', date: '2026-10-10' },
    { type: 'BUY', symbol: 'PKO.WA', qty: 10, price: 50, fee: 5, currency: 'PLN', date: '2026-10-11' },
    { type: 'SELL', symbol: 'PKO.WA', qty: 10, price: 60, fee: 5, currency: 'PLN', date: '2026-10-20', costBasis: 50.5 },
    { type: 'DIV', symbol: 'CDR.WA', qty: 10, price: 2, tax: 3.8, currency: 'PLN', date: '2026-10-25' },
    { type: 'BUY', symbol: 'AAPL', qty: 1, price: 200, currency: 'USD', date: '2026-11-02' },
  ];

  it('wynik bez wpłat, procent Dietza, aktywność miesiąca', () => {
    const r = monthlyReport({ snapshots, transactions: tx, month: '2026-10' });
    expect(r).toMatchObject({ startDate: '2026-09-30', endDate: '2026-10-31', partial: false, startValue: 10000, endValue: 12800, net: true, flows: 2000, result: 800, buys: 1, sells: 1 });
    expect(r.pct).toBeCloseTo(800 / 11000 * 100, 6);
    expect(r.dividends).toBeCloseTo(16.2, 6);
    expect(r.fees).toBeCloseTo(10, 6);
    expect(r.realized).toBeCloseTo(10 * (60 - 50.5) - 5, 6);
  });

  it('nowy portfel — start od pierwszego dnia z danymi; bez kapitału — sama zmiana wartości', () => {
    const r = monthlyReport({ snapshots: [{ date: '2026-10-05', total: 1000 }, { date: '2026-10-30', total: 1100 }], month: '2026-10' });
    expect(r).toMatchObject({ partial: true, net: false, result: 100 });
    expect(monthlyReport({ snapshots, month: '2026-08' })).toBeNull();
  });

  it('changePct', () => {
    expect(changePct(100, 110)).toBeCloseTo(10, 6);
    expect(changePct(null, 110)).toBeNull();
  });
});
