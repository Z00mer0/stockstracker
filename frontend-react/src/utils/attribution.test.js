import { describe, it, expect } from 'vitest';
import { attribution, sourceBreakdown } from './attribution.js';

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

describe('sourceBreakdown', () => {
  it('ceny, waluta, dywidendy, podatek, prowizje — suma jak w attribution', () => {
    // AAPL: 10 szt. kupione po 100 USD + 4 USD prowizji przy kursie 3,5;
    // dziś 120 USD przy kursie 4.
    const pos = { symbol: 'AAPL', qty: 10, avgPrice: 100.4, price: 120, currency: 'USD', costPLN: 10 * 100.4 * 3.5, valuePLN: 10 * 120 * 4 };
    pos.plPLN = pos.valuePLN - pos.costPLN;
    const txs = [
      { type: 'BUY', symbol: 'AAPL', qty: 10, price: 100, fee: 4, currency: 'USD', date: '2025-01-02' },
      { type: 'BUY', symbol: 'PKO.WA', qty: 10, price: 50, fee: 5, currency: 'PLN', date: '2025-01-02' },
      { type: 'SELL', symbol: 'PKO.WA', qty: 10, price: 70, fee: 5, currency: 'PLN', date: '2025-06-02', costBasis: 50.5 },
      { type: 'DIV', symbol: 'PKO.WA', qty: 10, price: 2, tax: 3.8, currency: 'PLN', date: '2025-07-01' },
    ];
    const fxRates = { USD: 4 };
    const b = sourceBreakdown([pos], txs, fxRates);
    const get = k => b.parts.find(p => p.key === k).total;
    expect(get('fx')).toBeCloseTo(10 * 120 * (4 - 3.5), 6);           // 600
    expect(get('fees')).toBeCloseTo(-(4 * 4 + 5 + 5), 6);              // −26
    expect(get('dividends')).toBeCloseTo(20, 6);
    expect(get('tax')).toBeCloseTo(-3.8, 6);
    // Ceny przed prowizjami: AAPL 10×(120−100)×3,5 = 700 (po kursie zakupu)
    // + PKO 10×(70−50) = 200; prowizja AAPL liczona po kursie dzisiejszym,
    // więc różnica 0,4×10×(4−3,5)=2 przechodzi do cen.
    expect(get('price')).toBeCloseTo(700 + 200 + 2, 6);
    expect(b.total).toBeCloseTo(attribution([pos], txs, fxRates).total, 6);
  });
});
