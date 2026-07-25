import { describe, it, expect } from 'vitest';
import { investedByCurrencyAt, investedInDisplayAt } from './investedAtDate.js';

const buy  = (symbol, date, qty, price, currency = 'PLN', extra = {}) =>
  ({ type: 'BUY', symbol, date, qty, price, currency, ...extra });
const sell = (symbol, date, qty, price, currency = 'PLN', extra = {}) =>
  ({ type: 'SELL', symbol, date, qty, price, currency, ...extra });

describe('investedByCurrencyAt', () => {
  it('sumuje koszt otwartych pozycji na dany dzień', () => {
    const txs = [buy('PKN.WA', '2026-01-10', 10, 60)];
    expect(investedByCurrencyAt(txs, '2026-01-31')).toEqual({ PLN: 600 });
  });

  it('ignoruje transakcje późniejsze niż podana data', () => {
    const txs = [buy('PKN.WA', '2026-01-10', 10, 60), buy('PKN.WA', '2026-03-01', 10, 80)];
    expect(investedByCurrencyAt(txs, '2026-02-01')).toEqual({ PLN: 600 });
  });

  it('uśrednia dokupienia', () => {
    const txs = [buy('X', '2026-01-01', 10, 100), buy('X', '2026-01-02', 10, 200)];
    // 20 szt. po średniej 150
    expect(investedByCurrencyAt(txs, '2026-12-31')).toEqual({ PLN: 3000 });
  });

  it('sprzedaż zmniejsza ilość, ale nie rusza średniej ceny', () => {
    const txs = [buy('X', '2026-01-01', 10, 100), sell('X', '2026-02-01', 4, 150)];
    expect(investedByCurrencyAt(txs, '2026-12-31')).toEqual({ PLN: 600 });
  });

  it('pozycja zamknięta do zera znika z sumy', () => {
    const txs = [buy('X', '2026-01-01', 10, 100), sell('X', '2026-02-01', 10, 150)];
    expect(investedByCurrencyAt(txs, '2026-12-31')).toEqual({});
  });

  it('rozdziela koszt na waluty bez przeliczania', () => {
    const txs = [buy('PKN.WA', '2026-01-01', 10, 60, 'PLN'), buy('AAPL', '2026-01-01', 2, 150, 'USD')];
    expect(investedByCurrencyAt(txs, '2026-12-31')).toEqual({ PLN: 600, USD: 300 });
  });

  it('tego samego dnia BUY jest liczony przed SELL', () => {
    // Bez tego porządku sprzedaż z tego samego dnia nie miałaby pokrycia
    // i wyzerowałaby pozycję, która realnie została otwarta rano.
    const txs = [sell('X', '2026-01-01', 5, 120), buy('X', '2026-01-01', 10, 100)];
    expect(investedByCurrencyAt(txs, '2026-12-31')).toEqual({ PLN: 500 });
  });

  it('BUY ze snapshotu zastępuje stan, a nie dokłada się do niego', () => {
    // Snapshot importu brokera jest autorytatywną bazą — gdyby się uśredniał,
    // koszt podwoiłby się przy każdym imporcie.
    const txs = [
      buy('X', '2026-01-01', 10, 100),
      buy('X', '2026-02-01', 5, 200, 'PLN', { fromSnapshot: true }),
    ];
    expect(investedByCurrencyAt(txs, '2026-12-31')).toEqual({ PLN: 1000 });
  });

  it('zwykły BUY po snapshocie dokłada się weighted-avg', () => {
    const txs = [
      buy('X', '2026-01-01', 10, 200, 'PLN', { fromSnapshot: true }),
      buy('X', '2026-02-01', 10, 100),
    ];
    expect(investedByCurrencyAt(txs, '2026-12-31')).toEqual({ PLN: 3000 });
  });

  it('pomija BUY-e fabrykowane pod zamknięte pozycje', () => {
    const txs = [
      buy('X', '2026-01-01', 10, 100),
      buy('Y', '2026-01-01', 10, 100, 'PLN', { fromClosedPosition: true }),
    ];
    expect(investedByCurrencyAt(txs, '2026-12-31')).toEqual({ PLN: 1000 });
  });

  it('nie wywraca się na pustym wejściu', () => {
    expect(investedByCurrencyAt([], '2026-01-01')).toEqual({});
    expect(investedByCurrencyAt(null, '2026-01-01')).toEqual({});
  });
});

describe('investedInDisplayAt', () => {
  const txs = [buy('PKN.WA', '2026-01-01', 10, 60, 'PLN'), buy('AAPL', '2026-01-01', 2, 150, 'USD')];

  it('przelicza na walutę wyświetlania po podanych kursach', () => {
    // 600 PLN + 300 USD × 4 = 1200 → razem 1800 PLN
    expect(investedInDisplayAt(txs, '2026-12-31', 'PLN', { PLN: 1, USD: 4 })).toBe(1800);
  });

  it('portfel w jednej walucie wyświetlany w tej samej walucie nie zależy od kursu', () => {
    // To jest cel istnienia tej funkcji: invested w portfelu USD nie ma
    // "oddychać" razem z kursem NBP.
    const usdOnly = [buy('AAPL', '2026-01-01', 2, 150, 'USD')];
    const przyNiskim = investedInDisplayAt(usdOnly, '2026-12-31', 'USD', { PLN: 1, USD: 3.5 });
    const przyWysokim = investedInDisplayAt(usdOnly, '2026-12-31', 'USD', { PLN: 1, USD: 4.5 });
    expect(przyNiskim).toBe(300);
    expect(przyWysokim).toBe(300);
  });

  it('brak kursu traktuje jak 1, zamiast dawać NaN', () => {
    expect(investedInDisplayAt(txs, '2026-12-31', 'PLN', {})).toBe(900);
  });
});
