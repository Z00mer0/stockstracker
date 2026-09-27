import { describe, it, expect } from 'vitest';
import { buildReviewContext } from './reviewContext.js';

const fxRates = { PLN: 1, USD: 4 };
const base = {
  fxRates,
  today: new Date('2026-09-27T12:00:00Z'),
  portfolio: [
    { symbol: 'PKN.WA', currency: 'PLN', qty: 10, avgPrice: 50, price: 60 },   // 600 zł, +20%
    { symbol: 'AAPL', currency: 'USD', qty: 1, avgPrice: 100, price: 100 },     // 400 zł
  ],
  cash: { PLN: 500, USD: 50 },                                                // 500 + 200
  bonds: [{ type: 'EDO', valuePLN: 1000 }],
  otherAssets: [{ name: 'Złoto', category: 'gold', value: 75, currency: 'USD' }], // 300 zł
};

describe('buildReviewContext', () => {
  it('wartości, alokacja i ekspozycja walutowa sumują się do 100%', () => {
    const ctx = buildReviewContext(base);
    expect(ctx.totalValuePLN).toBe(3000);
    expect(ctx.allocation).toEqual({ stocks: '33.3%', treasuryBonds: '33.3%', cash: '23.3%', otherAssets: '10%' });
    // PLN: 600 + 500 + 1000 = 2100; USD: 400 + 200 + 300 (złoto w USD) = 900
    expect(ctx.currencyExposure).toEqual({ PLN: '70%', USD: '30%' });
    expect(ctx.positions.map(p => [p.symbol, p.valuePLN, p.plPct, p.weight])).toEqual([
      ['PKN.WA', 600, 20, '20%'],
      ['AAPL', 400, 0, '13.3%'],
    ]);
  });

  it('dywidendy 12 mies.: DIV i DIVIDEND, starsze pomijane, podatek Belki', () => {
    const ctx = buildReviewContext({
      ...base,
      transactions: [
        { type: 'DIV', symbol: 'PKN.WA', currency: 'PLN', price: 2, qty: 10, date: '2026-06-01' },
        { type: 'DIVIDEND', symbol: 'PKN.WA', currency: 'PLN', price: 100, qty: 1, date: '2026-01-10' },
        { type: 'DIV', symbol: 'PKN.WA', currency: 'PLN', price: 999, qty: 1, date: '2025-09-01' },
        { type: 'BUY', symbol: 'PKN.WA', currency: 'PLN', price: 50, qty: 10, date: '2026-02-01' },
      ],
    });
    expect(ctx.dividends12m).toEqual({ grossPLN: 120, netPLN: Math.round(120 * 0.81), payments: 2 });
  });

  it('IKE: dywidendy z GPW bez podatku', () => {
    const ctx = buildReviewContext({
      ...base, accountType: 'IKE',
      transactions: [{ type: 'DIV', symbol: 'PKN.WA', currency: 'PLN', price: 50, qty: 1, date: '2026-06-01' }],
    });
    expect(ctx.dividends12m.netPLN).toBe(50);
  });

  it('pusty portfel → null', () => {
    expect(buildReviewContext({ fxRates })).toBeNull();
  });
});
