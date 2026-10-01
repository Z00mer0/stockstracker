import { describe, it, expect } from 'vitest';
import { forecastDividends } from './dividendForecast.js';

const today = '2026-09-28';
const positions = [
  { symbol: 'PKO.WA', qty: 100, currency: 'PLN' },
  { symbol: 'AAPL', qty: 10, currency: 'USD' },
];
const history = {
  // PKO: roczna w lipcu; starsza (sprzed roku) nie wchodzi.
  'PKO.WA': [{ date: '2025-07-01', amount: 9.99 }, { date: '2026-07-10', amount: 5.55 }],
  // AAPL: kwartalnie.
  AAPL: [
    { date: '2025-11-10', amount: 0.26 }, { date: '2026-02-09', amount: 0.26 },
    { date: '2026-05-11', amount: 0.26 }, { date: '2026-08-11', amount: 0.26 },
  ],
};
const taxRate = (sym, cur) => (cur === 'PLN' ? 0.19 : 0.19);

describe('forecastDividends', () => {
  it('przesuwa wypłaty z ostatnich 12 mies. o rok i liczy netto', () => {
    const r = forecastDividends({ positions, history, fx: { USD: 4 }, taxRate, today });
    expect(r.months).toHaveLength(12);
    expect(r.months[0].ym).toBe('2026-09');
    expect(r.months[11].ym).toBe('2027-08');
    const pko = r.months.find(m => m.ym === '2027-07');
    expect(pko.items[0]).toMatchObject({ symbol: 'PKO.WA', perShare: 5.55, announced: false });
    expect(pko.gross).toBeCloseTo(555, 9);
    // AAPL: 4 wypłaty × 10 akcji × 0,26 $ × 4 zł = 41,6 zł
    const aapl = r.symbols.find(s => s.symbol === 'AAPL');
    expect(aapl.count).toBe(4);
    expect(aapl.gross).toBeCloseTo(41.6, 9);
    expect(r.gross).toBeCloseTo(596.6, 9);
    expect(r.net).toBeCloseTo(596.6 * 0.81, 9);
    expect(r.next).toMatchObject({ symbol: 'AAPL', date: '2026-11-10' });
  });

  it('ogłoszona dywidenda zastępuje przewidywaną (kwota i data wypłaty)', () => {
    const r = forecastDividends({
      positions, history, fx: { USD: 4 }, taxRate, today,
      announced: [{ symbol: 'PKO.WA', date: '2027-06-20', payDate: '2027-07-05', amount: 6.1 }],
    });
    const items = r.months.flatMap(m => m.items).filter(i => i.symbol === 'PKO.WA');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ date: '2027-07-05', perShare: 6.1, announced: true });
  });

  it('bez kursu waluty pozycja jest pomijana, a nie liczona po 1', () => {
    const r = forecastDividends({ positions, history, fx: {}, taxRate, today });
    expect(r.symbols.map(s => s.symbol)).toEqual(['PKO.WA']);
  });
});
