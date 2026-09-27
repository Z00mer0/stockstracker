import { describe, it, expect } from 'vitest';
import { capitalNative, nextCapital, lastCapitalBefore, withCapital } from './capital.js';

const tx = (type, symbol, qty, price, date, extra = {}) => ({ type, symbol, qty, price, currency: 'PLN', date, ...extra });

describe('capitalNative', () => {
  // Wpłata 10 000 zł, zakup 100 × 50 zł z gotówki.
  const buy = tx('BUY', 'ABC', 100, 50, '2026-01-10');
  const base = { holdings: [{ symbol: 'ABC', qty: 100, avgPrice: 50, currency: 'PLN' }], cash: { PLN: 5000 }, transactions: [buy] };

  it('zakup z gotówki nie zmienia kapitału', () => {
    expect(capitalNative(base)).toEqual({ PLN: 10000 });
  });

  it('sprzedaż z zyskiem nie zmienia kapitału (zysk to nie wpłata)', () => {
    const sell = tx('SELL', 'ABC', 50, 70, '2026-02-10');
    const after = {
      holdings: [{ symbol: 'ABC', qty: 50, avgPrice: 50, currency: 'PLN' }],
      cash: { PLN: 5000 + 50 * 70 },
      transactions: [buy, sell],
    };
    expect(capitalNative(after)).toEqual({ PLN: 10000 });
  });

  it('dywidenda na konto nie zmienia kapitału — także typ DIVIDEND z importu', () => {
    const div = tx('DIVIDEND', 'ABC', 100, 2, '2026-03-01');
    expect(capitalNative({ ...base, cash: { PLN: 5200 }, transactions: [buy, div] })).toEqual({ PLN: 10000 });
  });

  it('wpłata gotówki i zakup spoza konta podnoszą kapitał', () => {
    expect(capitalNative({ ...base, cash: { PLN: 7000 } })).toEqual({ PLN: 12000 });
    const h2 = [...base.holdings, { symbol: 'XYZ', qty: 10, avgPrice: 100, currency: 'USD' }];
    expect(capitalNative({ ...base, holdings: h2 })).toEqual({ PLN: 10000, USD: 1000 });
  });
});

describe('nextCapital', () => {
  it('sam ruch kursu nie zmienia kapitału', () => {
    expect(nextCapital({ capital: 4000, native: { USD: 1000 } }, { USD: 1000 }, { USD: 4.4 })).toBe(4000);
  });

  it('wpłata wyceniona po kursie z dnia wpłaty', () => {
    expect(nextCapital({ capital: 4000, native: { USD: 1000 } }, { USD: 1500 }, { USD: 4.4 })).toBeCloseTo(6200, 10);
    // Waluta, której wcześniej nie było, i waluta, która zniknęła.
    expect(nextCapital({ capital: 4000, native: { USD: 1000 } }, { PLN: 500 }, { USD: 4.4 })).toBeCloseTo(4000 - 4400 + 500, 10);
  });

  it('bez poprzedniego snapshotu — wycena składników', () => {
    expect(nextCapital(null, { PLN: 1000, USD: 100 }, { USD: 4 })).toBe(1400);
  });
});

describe('lastCapitalBefore', () => {
  it('bierze najnowszy wcześniejszy dzień z kapitałem, pomija dzisiejszy', () => {
    const snaps = [
      { date: '2026-01-01', capital: 1, capitalNative: { PLN: 1 } },
      { date: '2026-01-03', capital: 3, capitalNative: { PLN: 3 } },
      { date: '2026-01-04', capital: null },
      { date: '2026-01-05', capital: 5, capitalNative: { PLN: 5 } },
    ];
    expect(lastCapitalBefore(snaps, '2026-01-05')).toEqual({ capital: 3, native: { PLN: 3 } });
    expect(lastCapitalBefore(snaps, '2026-01-01')).toBeNull();
  });
});

describe('withCapital', () => {
  it('dni bez kapitału szacowane od pierwszego znanego (stała gotówka)', () => {
    const rows = [
      { date: '2026-01-01', total: 10100, invested: 5000 },
      { date: '2026-02-01', total: 15300, invested: 10000 },
      { date: '2026-03-01', total: 15500, invested: 10000, capital: 15000 },
    ];
    const out = withCapital(rows);
    // K = 15000 − 10000 = 5000 (gotówka); szacunek = koszt + K.
    expect(out.map(r => r.capital)).toEqual([10000, 15000, 15000]);
    expect(out.map(r => r.capitalEstimated)).toEqual([true, true, false]);
  });

  it('szacunek odejmuje zrealizowany zysk i dywidendy do danego dnia', () => {
    const transactions = [
      tx('BUY', 'ABC', 100, 50, '2026-01-01'),
      tx('SELL', 'ABC', 50, 70, '2026-01-15'),   // +1000 zrealizowane
      tx('DIV', 'ABC', 50, 4, '2026-02-15'),     // +200
    ];
    const rows = [
      { date: '2026-01-10', total: 5000, invested: 5000 },
      { date: '2026-01-20', total: 5000, invested: 2500 },
      { date: '2026-03-01', total: 5000, invested: 2500, capital: 6000 },
    ];
    // K = 6000 − 2500 + 1200 = 4700
    const out = withCapital(rows, { transactions });
    expect(out.map(r => r.capital)).toEqual([9700, 6200, 6000]);
  });

  it('bez żadnego znanego kapitału K = bieżąca gotówka', () => {
    const out = withCapital([{ date: '2026-01-01', total: 1, invested: 100 }], { cashPLN: 50 });
    expect(out[0].capital).toBe(150);
  });
});
