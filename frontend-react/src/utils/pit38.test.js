import { describe, it, expect } from 'vitest';
import { computePit38, dayBefore, pit38RateDates, pit38CSV, lossCarryForward, settlementDate } from './pit38.js';
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
    const r = computePit38(txs, { basis: 'trade', year: 2025, rates: RATES });
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
    const r = computePit38(txs.filter(t => t.symbol === 'PKO.WA'), { basis: 'trade', year: 2025 });
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
    const r = computePit38(multi, { basis: 'trade', year: 2025 });
    expect(r.totals.income).toBeCloseTo(10 + 50, 6);
    const ike = computePit38(multi, { basis: 'trade', year: 2025, excluded: new Set(['a']) });
    expect(ike.totals.income).toBeCloseTo(10, 6);
  });

  it('brak kursu i brak zakupu są zgłaszane, nie zgadywane', () => {
    const r = computePit38([
      { type: 'BUY', symbol: 'M', qty: 1, price: 10, currency: 'USD', date: '2024-01-02' },
      { type: 'SELL', symbol: 'M', qty: 3, price: 20, currency: 'USD', date: '2025-01-05' },
    ], { basis: 'trade', year: 2025, rates: {} });
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
    ], { basis: 'trade', year: 2025 });
    expect(r.rows[0].costPLN).toBeCloseTo(500, 6);
    expect(r.rows[0].gainPLN).toBeCloseTo(100, 6);
    expect(r.rows[0].uncoveredQty).toBe(0);
  });

  it('daty kursów do pobrania: dzień przed transakcją, bez PLN', () => {
    const d = pit38RateDates(txs, undefined, 'trade');
    expect([...d.USD].sort()).toEqual(['2024-03-04', '2024-06-09', '2024-11-30', '2025-02-13']);
    expect(d.PLN).toBeUndefined();
  });

  it('CSV zawiera zakupy FIFO i podsumowanie', () => {
    const csv = pit38CSV(computePit38(txs, { basis: 'trade', year: 2025, rates: RATES }));
    expect(csv).toContain('2024-03-05 × 9 @ 100,00 USD, 4,0000 | 2024-06-10 × 6 @ 200,00 USD, 3,9000');
    expect(csv).toContain('Podatek 19% (zł);;;;;;;;;;;1324;');
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

describe('lossCarryForward', () => {
  it('najwyżej 50% straty rocznie, przez 5 lat, najstarsze najpierw', () => {
    const incomes = { 2021: -10000, 2022: 3000, 2023: 20000, 2024: 1000 };
    // 2022: odliczone 3000 (limit 5000) → zostaje 7000
    expect(lossCarryForward(incomes, 2022)).toMatchObject({ deduction: 3000, base: 0, tax: 0 });
    // 2023: limit 50% = 5000 → odliczone 5000, zostaje 2000
    const r23 = lossCarryForward(incomes, 2023);
    expect(r23).toMatchObject({ deduction: 5000, base: 15000, tax: 2850 });
    expect(r23.losses).toEqual([{ year: 2021, amount: 10000, remaining: 2000 }]);
    // 2024: reszta 2000, ale dochód tylko 1000
    expect(lossCarryForward(incomes, 2024)).toMatchObject({ deduction: 1000, base: 0 });
  });

  it('strata starsza niż 5 lat przepada; rok ze stratą nie płaci podatku', () => {
    expect(lossCarryForward({ 2018: -10000, 2024: 5000 }, 2024)).toMatchObject({ deduction: 0, base: 5000, tax: 950, losses: [] });
    expect(lossCarryForward({ 2025: -300 }, 2025)).toMatchObject({ deduction: 0, base: 0, tax: 0 });
  });
});

describe('data rozliczenia', () => {
  it('T+2 dni robocze, USA T+1 od 28.05.2024, krypto tego samego dnia', () => {
    expect(settlementDate({ symbol: 'PKO.WA', currency: 'PLN', date: '2026-10-15' })).toBe('2026-10-19'); // czw → pon
    expect(settlementDate({ symbol: 'PKO.WA', currency: 'PLN', date: '2026-10-19' })).toBe('2026-10-21');
    expect(settlementDate({ symbol: 'AAPL', currency: 'USD', date: '2026-10-16' })).toBe('2026-10-19'); // pt → pon
    expect(settlementDate({ symbol: 'AAPL', currency: 'USD', date: '2024-05-20' })).toBe('2024-05-22');
    expect(settlementDate({ symbol: 'BTC-USD', currency: 'USD', date: '2026-10-18' })).toBe('2026-10-18');
  });

  it('sprzedaż z końca grudnia rozliczona w styczniu idzie do następnego roku, kurs z dnia przed rozliczeniem', () => {
    const txs = [
      { type: 'BUY', symbol: 'AAPL', qty: 1, price: 100, currency: 'USD', date: '2025-06-02' },
      { type: 'SELL', symbol: 'AAPL', qty: 1, price: 150, currency: 'USD', date: '2025-12-31' },
    ];
    const rates = { USD: { '2025-06-02': 4.0, '2025-12-31': 3.6 } };
    // Święta nie są liczone: rozliczenie 1.01 (pierwszy dzień roboczy po środzie 31.12).
    expect(pit38RateDates(txs).USD).toEqual(new Set(['2025-06-02', '2025-12-31']));
    expect(computePit38(txs, { year: 2025, rates }).rows).toEqual([]);
    const [row] = computePit38(txs, { year: 2026, rates }).rows;
    expect(row.taxDate).toBe('2026-01-01');
    expect(row.revenuePLN).toBeCloseTo(150 * 3.6);
    expect(row.costPLN).toBeCloseTo(100 * 4.0);
    // Według daty zawarcia ta sama sprzedaż należy do 2025.
    expect(computePit38(txs, { year: 2025, rates: {}, basis: 'trade' }).rows).toHaveLength(1);
  });
});

describe('kryptowaluty — osobna część PIT-38', () => {
  const R = { USD: { '2024-03-04': 4.0, '2024-11-30': 4.0, '2025-02-13': 4.0, '2025-06-09': 4.0 } };
  const txs = [
    { type: 'BUY', symbol: 'BTC', qty: 1, price: 1000, fee: 10, currency: 'USD', date: '2024-03-05' },  // koszt 2024: 4040
    { type: 'SELL', symbol: 'BTC', qty: 0.5, price: 600, currency: 'USD', date: '2024-12-01' },         // przychód 2024: 1200
    { type: 'SELL', symbol: 'BTC', qty: 0.5, price: 3000, currency: 'USD', date: '2025-02-14' },        // przychód 2025: 6000
    { type: 'BUY', symbol: 'AAPL', qty: 10, price: 100, currency: 'USD', date: '2024-03-05' },
    { type: 'SELL', symbol: 'AAPL', qty: 10, price: 90, currency: 'USD', date: '2025-06-10' },          // akcje: −400
  ];

  it('nie trafia do akcji; nadwyżka kosztów przechodzi na następny rok', () => {
    const r24 = computePit38(txs, { year: 2024, rates: R, basis: 'trade' });
    expect(r24.rows).toHaveLength(0);
    expect(r24.crypto).toMatchObject({ revenue: 1200, cost: 4040, carriedIn: 0, tax: 0 });
    expect(r24.crypto.carryOut).toBeCloseTo(2840, 6);

    const r25 = computePit38(txs, { year: 2025, rates: R, basis: 'trade' });
    // Strata na akcjach nie obniża podatku od krypto.
    expect(r25.totals.income).toBeCloseTo(-400, 6);
    expect(r25.crypto.carriedIn).toBeCloseTo(2840, 6);
    expect(r25.crypto.income).toBeCloseTo(6000 - 2840, 6);
    expect(r25.crypto.tax).toBe(Math.round(3160 * 0.19));
    expect(r25.years).toEqual([2025, 2024]);
  });

  it('krypto rozliczane w dniu transakcji, także symbol oznaczony w pozycjach', () => {
    const d = pit38RateDates([{ type: 'SELL', symbol: 'MYTOKEN', qty: 1, price: 1, currency: 'USD', date: '2025-02-14' }], new Set(), 'settlement', new Set(['MYTOKEN']));
    expect([...d.USD]).toEqual(['2025-02-13']);
  });
});

describe('dywidendy zagraniczne w PIT-38', () => {
  const R = { USD: { '2025-03-31': 4.0, '2025-06-30': 4.0 } };
  const txs = [
    { type: 'DIV', symbol: 'AAPL', qty: 1, price: 100, tax: 15, currency: 'USD', date: '2025-04-01' },   // 15% → dopłata 4%
    { type: 'DIVIDEND', symbol: 'KO', qty: 1, price: 50, tax: 15, currency: 'USD', date: '2025-07-01' },  // 30% → nic, limit 19%
    { type: 'DIV', symbol: 'PKO.WA', qty: 1, price: 500, currency: 'PLN', date: '2025-07-01' },          // polska — poza PIT-38
  ];

  it('19% od brutto minus podatek z zagranicy (najwyżej 19%)', () => {
    const r = computePit38(txs, { year: 2025, rates: R });
    expect(r.dividends.count).toBe(2);
    expect(r.dividends.grossPLN).toBeCloseTo(600, 6);
    expect(r.dividends.tax19).toBeCloseTo(114, 6);
    expect(r.dividends.paidAbroad).toBeCloseTo(60 + 38, 6);
    expect(r.dividends.due).toBe(16);
    expect(r.years).toContain(2025);
  });

  it('bez wpisanego podatku — założona stawka, oznaczone jako szacunek', () => {
    const r = computePit38([{ type: 'DIV', symbol: 'AAPL', qty: 1, price: 100, currency: 'USD', date: '2025-04-01' }], { year: 2025, rates: R, withholding: 0.30 });
    expect(r.dividends.estimated).toBe(1);
    expect(r.dividends.due).toBe(0);
  });

  it('kursy: dzień przed wypłatą', () => {
    expect([...pit38RateDates(txs).USD].sort()).toEqual(['2025-03-31', '2025-06-30']);
  });
});
