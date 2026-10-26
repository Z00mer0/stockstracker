import { describe, it, expect } from 'vitest';
import { fxDatesNeeded, rateOn, replayFx, cashflowPLN } from './fxHistory.js';
import { computeRealizedTrades, groupBySymbol } from './realizedPL.js';
import { attribution } from './attribution.js';

const hist = { USD: { '2024-01-10': 4.3, '2024-06-10': 4.0, '2025-03-10': 3.6, '2025-04-10': 3.7 } };
const txs = [
  { id: 'b1', type: 'BUY', symbol: 'AAPL', qty: 10, price: 100, currency: 'USD', date: '2024-01-10' },
  { id: 'b2', type: 'BUY', symbol: 'AAPL', qty: 10, price: 100, fee: 10, currency: 'USD', date: '2024-06-10' },
  { id: 's1', type: 'SELL', symbol: 'AAPL', qty: 5, price: 120, fee: 5, currency: 'USD', date: '2025-03-10' },
  { id: 'd1', type: 'DIVIDEND', symbol: 'AAPL', qty: 15, price: 1, tax: 2.25, currency: 'USD', date: '2025-04-10' },
  { id: 'p1', type: 'BUY', symbol: 'PKO.WA', qty: 1, price: 50, currency: 'PLN', date: '2024-01-10' },
];

describe('fxHistory', () => {
  it('daty do pobrania: transakcje i dywidendy w walucie, bez PLN', () => {
    expect([...fxDatesNeeded(txs).USD].sort()).toEqual(['2024-01-10', '2024-06-10', '2025-03-10', '2025-04-10']);
    expect(fxDatesNeeded(txs).PLN).toBeUndefined();
    expect(rateOn(hist, 'PLN', 'x')).toBe(1);
    expect(rateOn(hist, 'USD', '2099-01-01')).toBeNull();
  });

  it('średni kurs zakupu ważony kosztem; sprzedaż go nie zmienia', () => {
    // koszty: 1000 po 4,3 i 1010 po 4,0 → (4300 + 4040) / 2010
    const { bySymbol, atSell } = replayFx(txs, hist);
    const avg = (4300 + 4040) / 2010;
    expect(bySymbol.get('AAPL')).toBeCloseTo(avg, 10);
    expect(atSell.get(txs[2])).toBeCloseTo(avg, 10);
    expect(bySymbol.get('PKO.WA')).toBe(1);
  });

  it('brak kursu któregoś zakupu → null (wtedy dzisiejszy kurs)', () => {
    expect(replayFx(txs, { USD: {} }).bySymbol.get('AAPL')).toBeNull();
  });

  it('przepływy w PLN po kursie z dnia, z prowizją i dywidendą netto', () => {
    expect(cashflowPLN(txs[1], hist)).toBeCloseTo(-1010 * 4.0, 10);
    expect(cashflowPLN(txs[2], hist)).toBeCloseTo(595 * 3.6, 10);
    expect(cashflowPLN(txs[3], hist)).toBeCloseTo(12.75 * 3.7, 10);
    expect(cashflowPLN(txs[1], {}, { USD: 3.9 })).toBeCloseTo(-1010 * 3.9, 10);
  });
});

describe('zrealizowany wynik z walutą', () => {
  it('przychód po kursie sprzedaży, koszt po kursie zakupu', () => {
    const [tr] = computeRealizedTrades(txs, { USD: 3.9 }, hist);
    const avgFx = (4300 + 4040) / 2010;
    const costBasis = 2010 / 20;                       // średnia z prowizją
    expect(tr.plPLN).toBeCloseTo((5 * 120 - 5) * 3.6 - 5 * costBasis * avgFx, 8);
    // Dolar spadł z ~4,15 do 3,60: zysk w zł dużo mniejszy niż po dzisiejszym kursie.
    expect(tr.plPLN).toBeLessThan(tr.plNative * 3.9);
    expect(tr.pct).toBeCloseTo(tr.plPLN / tr.costPLN * 100, 10);
    expect(groupBySymbol([tr])[0].pct).toBeCloseTo(tr.pct, 10);
  });

  it('bez kursów historycznych — jak wcześniej, dzisiejszy kurs', () => {
    const [tr] = computeRealizedTrades(txs, { USD: 3.9 });
    expect(tr.plPLN).toBeCloseTo(tr.plNative * 3.9, 10);
  });

  it('atrybucja dostaje ten sam wynik', () => {
    const a = attribution([], txs, { USD: 3.9 }, hist);
    const [tr] = computeRealizedTrades(txs, { USD: 3.9 }, hist);
    expect(a.positions.find(r => r.symbol === 'AAPL').realized).toBeCloseTo(tr.plPLN, 10);
  });
});
