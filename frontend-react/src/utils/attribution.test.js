import { describe, it, expect } from 'vitest';
import { attribution } from './attribution.js';

describe('attribution', () => {
  const positions = [
    { symbol: 'CDR.WA', sector: 'Gaming', plPLN: 300 },
    { symbol: 'AAPL', sector: 'Technology', plPLN: -100 },
    { symbol: 'PKO.WA', sector: 'Finance', plPLN: null },  // brak ceny — bez zysku papierowego
  ];
  const txs = [
    { type: 'BUY', symbol: 'XTB.WA', qty: 10, price: 50, currency: 'PLN', date: '2025-01-02' },
    { type: 'SELL', symbol: 'XTB.WA', qty: 10, price: 70, currency: 'PLN', date: '2025-06-02', costBasis: 50 },
    { type: 'DIVIDEND', symbol: 'PKO.WA', qty: 100, price: 2, tax: 38, currency: 'PLN', date: '2025-07-01' },
    { type: 'DIV', symbol: 'AAPL', qty: 6, price: 0.25, currency: 'USD', date: '2025-08-01' },
  ];
  const a = attribution(positions, txs, { USD: 4 });

  it('wynik spółki = papierowy + zrealizowany + dywidendy, także sprzedanych', () => {
    expect(a.positions.map(r => [r.symbol, +r.total.toFixed(2)])).toEqual([
      ['CDR.WA', 300], ['XTB.WA', 200], ['PKO.WA', 162], ['AAPL', -94],
    ]);
    expect(a.total).toBeCloseTo(568);
  });

  it('sektory; sprzedane bez sektora w osobnej grupie', () => {
    expect(a.sectors).toEqual([
      { sector: 'Gaming', total: 300 },
      { sector: '', total: 200 },
      { sector: 'Finance', total: 162 },
      { sector: 'Technology', total: -94 },
    ]);
  });
});
