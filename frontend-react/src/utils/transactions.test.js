import { describe, it, expect } from 'vitest';
import { normalizeType, last30Totals } from './transactions.js';
import { parseTransactionsCsv } from './transactionsCsv.js';
import { toCsv, transactionHeaders, transactionRows } from './exporters.js';
import pl from '../translations/pl.js';
import en from '../translations/en.js';

describe('normalizeType', () => {
  it('DIVIDEND i małe litery sprowadza do jednej postaci', () => {
    expect(normalizeType('DIVIDEND')).toBe('DIV');
    expect(normalizeType('div')).toBe('DIV');
    expect(normalizeType('buy')).toBe('BUY');
    expect(normalizeType(undefined)).toBe('');
  });
});

describe('last30Totals', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  const fx = { PLN: 1, USD: 4, EUR: 4.3 };
  it('przelicza waluty na walutę wyświetlania', () => {
    const txs = [
      { type: 'BUY', qty: 6, price: 185, currency: 'USD', date: '2026-09-20' },
      { type: 'BUY', qty: 10, price: 50, currency: 'PLN', date: '2026-09-21' },
    ];
    expect(last30Totals(txs, fx, 'PLN', now).buy).toBeCloseTo(6 * 185 * 4 + 500);
    expect(last30Totals(txs, fx, 'USD', now).buy).toBeCloseTo(1110 + 125);
  });
  it('liczy DIVIDEND jako dywidendę, CASH bez ilości, pomija starsze niż 30 dni', () => {
    const txs = [
      { type: 'DIVIDEND', qty: 100, price: 2, currency: 'PLN', date: '2026-09-10' },
      { type: 'CASH', qty: null, price: 1000, currency: 'PLN', date: '2026-09-11' },
      { type: 'SELL', qty: 1, price: 999, currency: 'PLN', date: '2026-07-01' },
    ];
    expect(last30Totals(txs, fx, 'PLN', now)).toEqual({ buy: 0, sell: 0, div: 200, cash: 1000 });
  });
});

describe('parseTransactionsCsv', () => {
  const id = () => 'x';
  it('średnik, BOM, cudzysłowy z przecinkiem w środku', () => {
    const text = '\uFEFFData;Typ;Symbol;Ilość;Cena;Waluta;Uwaga\n2026-01-02;buy;cdr.wa;5;132,5;PLN;"a; b"';
    const { valid } = parseTransactionsCsv(text, id);
    expect(valid[0]).toMatchObject({ date: '2026-01-02', type: 'BUY', symbol: 'CDR.WA', qty: 5, currency: 'PLN', note: 'a; b' });
  });
  it('pomija wiersze bez symbolu albo ceny i je liczy', () => {
    const text = 'Symbol,Price\nAAPL,185\n,10\nMSFT,abc';
    expect(parseTransactionsCsv(text, id)).toMatchObject({ skippedCount: 2, valid: [{ symbol: 'AAPL', price: 185 }] });
  });
  it('brak waluty i typu → PLN i BUY; pusta ilość → null', () => {
    const { valid } = parseTransactionsCsv('Symbol,Qty,Price\nPKO.WA,,52.3', id);
    expect(valid[0]).toMatchObject({ type: 'BUY', currency: 'PLN', qty: null });
  });
  it('za mało wierszy → pusto', () => {
    expect(parseTransactionsCsv('Symbol,Price', id)).toEqual({ valid: [], skippedCount: 0 });
  });

  // Najważniejsze: to, co eksportujemy, wraca w całości — w obu językach.
  for (const [lang, dict] of [['pl', pl], ['en', en]]) {
    it(`eksport → import zachowuje dane (${lang})`, () => {
      const t = k => dict[k];
      const txs = [
        { date: '2026-03-30', type: 'BUY', symbol: 'ALE.WA', qty: 120, price: 33.4, currency: 'PLN', note: 'Pierwszy zakup, "okazja"' },
        { date: '2026-07-28', type: 'DIV', symbol: 'AAPL', qty: 6, price: 0.25, currency: 'USD', note: '' },
        { date: '2025-11-30', type: 'CASH', symbol: 'PLN', qty: null, price: 30000, currency: 'PLN', note: 'Wpłata' },
        { date: '2025-11-29', type: 'CASH', symbol: '', qty: null, price: 500, currency: 'PLN', note: 'Wpłata bez symbolu' },
      ];
      const csv = toCsv(transactionHeaders(t), transactionRows(txs));
      const { valid, skippedCount } = parseTransactionsCsv(csv, id);
      expect(skippedCount).toBe(0);
      expect(valid.map(({ id: _id, ...rest }) => rest)).toEqual(txs);
    });
  }
});
