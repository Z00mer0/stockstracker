// Dashboard i Portfel musza liczyc zysk zrealizowany tak samo.
//
// Blad, ktory to wywolal: Dashboard liczyl realizedPLN wlasnym reduce'em,
// biorac costBasis wprost z transakcji:
//
//   (tx.price - (tx.costBasis ?? tx.avgPrice ?? tx.price)) * tx.qty
//
// SELL-e z importu brokera nie maja costBasis ani avgPrice, wiec fallback
// schodzil do tx.price i cale wyrazenie dawalo (price - price) * qty = 0.
// Kazda taka sprzedaz liczyla sie jako zero zysku. Na koncie uzytkownika
// 636 z 640 SELL-ow nie mialo costBasis — kafel "zrealizowany" na Dashboardzie
// pokazywal +114, podczas gdy karta YTD w Portfelu (przez computeRealizedTrades,
// ktore odtwarza koszt z historii BUY) pokazywala +1927.
//
// Test replikuje ten uklad: sprzedaz bez costBasis, poprzedzona zakupem.
import { describe, it, expect } from 'vitest';
import { computeRealizedTrades } from './realizedPL.js';

const fxRates = { PLN: 1, USD: 4.0 };

// stary, wadliwy sposob liczenia z Dashboardu — trzymany tu wylacznie po to,
// zeby test pokazywal roznice, a nie sam fakt ze cos sie zgadza ze soba
function legacyDashboardRealized(transactions, fx) {
  return transactions
    .filter(t => t.type === 'SELL')
    .reduce((sum, tx) => {
      const rate = fx[tx.currency] ?? 1;
      const pl = tx.overridePL != null
        ? tx.overridePL
        : (tx.price - (tx.costBasis ?? tx.avgPrice ?? tx.price)) * tx.qty;
      return sum + pl * rate;
    }, 0);
}

function sharedRealized(transactions, fx) {
  return computeRealizedTrades(transactions, fx).reduce((s, t) => s + t.plPLN, 0);
}

describe('zysk zrealizowany — Dashboard vs Portfel', () => {
  it('sprzedaz z importu brokera (bez costBasis) nie moze liczyc sie jako zero', () => {
    const txs = [
      { id: 1, type: 'BUY',  symbol: 'AAPL', date: '2026-01-10', qty: 10, price: 100, currency: 'USD' },
      // import brokera: brak costBasis i avgPrice
      { id: 2, type: 'SELL', symbol: 'AAPL', date: '2026-03-10', qty: 10, price: 150, currency: 'USD' },
    ];

    // koszt odtworzony z BUY: (150 - 100) * 10 = 500 USD * 4.0 = 2000 PLN
    expect(sharedRealized(txs, fxRates)).toBeCloseTo(2000, 6);

    // stary sposob gubil to calkowicie
    expect(legacyDashboardRealized(txs, fxRates)).toBe(0);
  });

  it('obie sciezki zgadzaja sie, gdy costBasis jest zapisane', () => {
    const txs = [
      { id: 1, type: 'BUY',  symbol: 'MSFT', date: '2026-01-05', qty: 5, price: 200, currency: 'USD' },
      { id: 2, type: 'SELL', symbol: 'MSFT', date: '2026-02-05', qty: 5, price: 250, costBasis: 200, currency: 'USD' },
    ];
    expect(sharedRealized(txs, fxRates)).toBeCloseTo(legacyDashboardRealized(txs, fxRates), 6);
  });

  it('overridePL jest respektowane tak samo przez obie sciezki', () => {
    const txs = [
      { id: 1, type: 'BUY',  symbol: 'TSLA', date: '2026-01-05', qty: 2, price: 300, currency: 'USD' },
      { id: 2, type: 'SELL', symbol: 'TSLA', date: '2026-02-05', qty: 2, price: 400, costBasis: 300, overridePL: 123, currency: 'USD' },
    ];
    // 123 USD * 4.0 = 492 PLN
    expect(sharedRealized(txs, fxRates)).toBeCloseTo(492, 6);
    expect(legacyDashboardRealized(txs, fxRates)).toBeCloseTo(492, 6);
  });

  it('sprzedaz bez zadnego pokrycia w zakupach jest pomijana, nie zerowana na sile', () => {
    const txs = [
      { id: 1, type: 'SELL', symbol: 'GHOST', date: '2026-02-05', qty: 3, price: 50, currency: 'USD' },
    ];
    // nie znamy kosztu — trade nie wchodzi do wyniku
    expect(computeRealizedTrades(txs, fxRates)).toHaveLength(0);
    expect(sharedRealized(txs, fxRates)).toBe(0);
  });

  it('mieszanka walut sumuje sie po kursach, tak samo w obu miejscach', () => {
    const txs = [
      { id: 1, type: 'BUY',  symbol: 'AAPL', date: '2026-01-10', qty: 10, price: 100, currency: 'USD' },
      { id: 2, type: 'SELL', symbol: 'AAPL', date: '2026-03-10', qty: 10, price: 150, currency: 'USD' },
      { id: 3, type: 'BUY',  symbol: 'PKN',  date: '2026-01-10', qty: 100, price: 50, currency: 'PLN' },
      { id: 4, type: 'SELL', symbol: 'PKN',  date: '2026-03-10', qty: 100, price: 60, currency: 'PLN' },
    ];
    // USD: (150-100)*10*4 = 2000 ; PLN: (60-50)*100*1 = 1000
    expect(sharedRealized(txs, fxRates)).toBeCloseTo(3000, 6);
  });
});
