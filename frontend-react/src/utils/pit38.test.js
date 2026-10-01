import { describe, it, expect } from 'vitest';
import { computePit38, dayBefore, pit38RateDates, pit38CSV } from './pit38.js';
import { splitAdjusted } from './splits.js';

const RATES = { USD: { '2024-03-04': 4.0, '2024-06-09': 3.9, '2025-02-13': 4.2, '2025-05-04': 4.1 } };

describe('dayBefore', () => {
  it('cofa o dzień, także przez granicę roku', () => {
    expect(dayBefore('2025-01-01')).toBe('2024-12-31');
    expect(dayBefore('2024-03-01')).toBe('2024-02-29');
  });
});

describe('computePit38', () => {
  const txs = [
    { id: 'b1', type: 'BUY', symbol: 'AAPL', qty: 10, price: 100, currency: 'USD', date: '2024-03-05' },
    { id: 'b2', type: 'BUY', symbol: 'AAPL', qty: 10, price: 200, currency: 'USD', date: '2024-06-10' },
    { id: 's1', type: 'SELL', symbol: 'AAPL', qty: 15, price: 250, currency: 'USD', date: '2025-02-14' },
    { id: 'p1', type: 'BUY', symbol: 'PKO.WA', qty: 100, price: 50, currency: 'PLN', date: '2024-01-10' },
    { id: 'p2', type: 'SELL', symbol: 'PKO.WA', qty: 100, price: 45, currency: 'PLN', date: '2025-05-05' },
    { id: 'old', type: 'SELL', symbol: 'AAPL', qty: 1, price: 150, currency: 'USD', date: '2024-12-01' },
  ];

  it('FIFO z kursem NBP z dnia przed każdą transakcją', () => {
    // AAPL: sprzedaż 2024-12-01 zjada 1 szt. z pierwszego zakupu (9 zostaje).
    // Sprzedaż 15 szt. 2025-02-14: 9 × 100 × 4.0 + 6 × 200 × 3.9 = 3600 + 4680 = 8280 kosztu,
    // przychód 15 × 250 × 4.2 = 15750 → dochód 7470.
    const r = computePit38(txs, { year: 2025, rates: RATES });
    const aapl = r.rows.find(x => x.id === 's1');
    expect(aapl.rate).toBe(4.2);
    expect(aapl.lots.map(l => [l.date, l.qty, l.rate])).toEqual([['2024-03-05', 9, 4.0], ['2024-06-10', 6, 3.9]]);
    expect(aapl.costPLN).toBeCloseTo(8280, 6);
    expect(aapl.revenuePLN).toBeCloseTo(15750, 6);
    // PKO: strata 500 zł (PLN, kurs 1).
    expect(r.rows.find(x => x.id === 'p2').gainPLN).toBeCloseTo(-500, 6);
    expect(r.totals.income).toBeCloseTo(6970, 6);
    expect(r.totals.base).toBe(6970);
    expect(r.totals.tax).toBe(Math.round(6970 * 0.19)); // 1324
    expect(r.years).toEqual([2025, 2024]);
    expect(r.rows.some(x => x.id === 'old')).toBe(false);
  });

  it('strata → podstawa i podatek 0', () => {
    const r = computePit38(txs.filter(t => t.symbol === 'PKO.WA'), { year: 2025 });
    expect(r.totals.income).toBeCloseTo(-500, 6);
    expect(r.totals.base).toBe(0);
    expect(r.totals.tax).toBe(0);
  });

  it('konto IKE pominięte; FIFO osobno dla każdego portfela', () => {
    const multi = [
      { type: 'BUY', symbol: 'X', qty: 1, price: 10, currency: 'PLN', date: '2024-01-02', _portfolioId: 'a' },
      { type: 'BUY', symbol: 'X', qty: 1, price: 50, currency: 'PLN', date: '2024-01-03', _portfolioId: 'b' },
      { type: 'SELL', symbol: 'X', qty: 1, price: 60, currency: 'PLN', date: '2025-01-05', _portfolioId: 'b' },
      { type: 'SELL', symbol: 'X', qty: 1, price: 60, currency: 'PLN', date: '2025-01-05', _portfolioId: 'a' },
    ];
    // Wspólna kolejka dałaby portfelowi b koszt 10 zł; osobne kolejki: b → 50, a → 10.
    const r = computePit38(multi, { year: 2025 });
    expect(r.totals.income).toBeCloseTo(10 + 50, 6);
    const ike = computePit38(multi, { year: 2025, excluded: new Set(['a']) });
    expect(ike.totals.income).toBeCloseTo(10, 6);
  });

  it('brak kursu i brak zakupu są zgłaszane, nie zgadywane', () => {
    const r = computePit38([
      { type: 'BUY', symbol: 'M', qty: 1, price: 10, currency: 'USD', date: '2024-01-02' },
      { type: 'SELL', symbol: 'M', qty: 3, price: 20, currency: 'USD', date: '2025-01-05' },
    ], { year: 2025, rates: {} });
    expect(r.rows[0].missingRate).toBe(true);
    expect(r.rows[0].uncoveredQty).toBe(2);
    expect(r.totals.missingRates).toBe(1);
    expect(r.totals.uncovered).toBe(1);
    expect(r.totals.income).toBe(0);
  });

  it('split: koszt zakupu z przed splitu rozkłada się na nowe akcje', () => {
    const r = computePit38([
      { type: 'BUY', symbol: 'NVDA', qty: 1, price: 1000, currency: 'PLN', date: '2024-01-02' },
      { type: 'SPLIT', symbol: 'NVDA', ratio: 10, date: '2024-06-10' },
      { type: 'SELL', symbol: 'NVDA', qty: 5, price: 120, currency: 'PLN', date: '2025-01-05' },
    ], { year: 2025 });
    expect(r.rows[0].costPLN).toBeCloseTo(500, 6);
    expect(r.rows[0].gainPLN).toBeCloseTo(100, 6);
    expect(r.rows[0].uncoveredQty).toBe(0);
  });

  it('daty kursów do pobrania: dzień przed transakcją, bez PLN', () => {
    const d = pit38RateDates(txs);
    expect([...d.USD].sort()).toEqual(['2024-03-04', '2024-06-09', '2024-11-30', '2025-02-13']);
    expect(d.PLN).toBeUndefined();
  });

  it('CSV zawiera zakupy FIFO i podsumowanie', () => {
    const csv = pit38CSV(computePit38(txs, { year: 2025, rates: RATES }));
    expect(csv).toContain('2024-03-05 × 9 @ 100,00 USD, 4,0000 | 2024-06-10 × 6 @ 200,00 USD, 3,9000');
    expect(csv).toContain('Podatek 19% (zł);;;;;;;;;1324;');
  });
});

describe('splitAdjusted', () => {
  it('przelicza tylko transakcje sprzed splitu, tej samej spółki i portfela', () => {
    const out = splitAdjusted([
      { type: 'BUY', symbol: 'A', qty: 2, price: 100, date: '2024-01-01' },
      { type: 'BUY', symbol: 'A', qty: 2, price: 100, date: '2024-01-01', _portfolioId: 'other' },
      { type: 'BUY', symbol: 'A', qty: 5, price: 20, date: '2024-02-01' },
      { type: 'SELL', symbol: 'B', qty: 1, price: 7, date: '2024-01-01' },
      { type: 'SPLIT', symbol: 'A', ratio: 4, date: '2024-02-01' },
    ]);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ qty: 8, price: 25 });
    expect(out[1]).toMatchObject({ qty: 2, price: 100 });
    expect(out[2]).toMatchObject({ qty: 5, price: 20 });
    expect(out[3]).toMatchObject({ qty: 1, price: 7 });
  });
});
