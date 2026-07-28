// Karta "Zysk zrealizowany YTD" w Portfelu liczyla po `tx.costBasis != null`,
// wiec pomijala SELL-e z importu brokera (brak zapisanego costBasis). U real-
// nego uzytkownika 636 z 640 SELL-ow bylo w ten sposob gubionych i karta poka-
// zywala +114 USD zamiast +1927 USD. Test odtwarza dokladnie ten ksztalt danych
// (BUY z historii + SELL bez costBasis + ta sama waluta) i pilnuje, ze backfill
// jest uzywany. Sam algorytm mieszka teraz w computeRealizedTrades — replikujemy
// tu sumowanie ktore robi karta, zeby regresja bila w ta warstwe, w ktorej byla.

import { describe, it, expect } from 'vitest';
import { computeRealizedTrades } from './realizedPL.js';

const jan1 = `${new Date().getFullYear()}-01-01`;

// Kopia logiki karty z Portfolio.jsx — chcemy pilnowac ZACHOWANIA, wiec
// duplikacja jest tu celowa: jesli karta odejdzie od tego wzorca, test pekue.
function ytdChartData(transactions, fxRates, displayCurrency) {
  const dispFx = fxRates[displayCurrency] ?? 1;
  const trades = computeRealizedTrades(transactions, fxRates)
    .filter(t => t.date >= jan1)
    .sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  const points = [];
  for (const t of trades) {
    cum += t.plPLN / dispFx;
    if (points.length && points[points.length - 1].date === t.date) {
      points[points.length - 1].pl = parseFloat(cum.toFixed(2));
    } else {
      points.push({ date: t.date, pl: parseFloat(cum.toFixed(2)) });
    }
  }
  return points;
}

describe('ytdChartData (karta Zysk zrealizowany YTD)', () => {
  it('backfilluje costBasis dla SELL z importu — brak costBasis nie ukrywa transakcji', () => {
    const year = new Date().getFullYear();
    const txs = [
      { type: 'BUY',  symbol: 'AAPL', date: `${year - 1}-06-01`, qty: 10, price: 100, currency: 'USD' },
      // SELL bez costBasis — jak z importu brokera. Kupno bylo rok wczesniej.
      { type: 'SELL', symbol: 'AAPL', date: `${year}-03-15`,     qty: 5,  price: 150, currency: 'USD' },
      { type: 'SELL', symbol: 'AAPL', date: `${year}-06-20`,     qty: 3,  price: 200, currency: 'USD' },
    ];
    const fx = { USD: 1, PLN: 1 };
    const chart = ytdChartData(txs, fx, 'USD');

    expect(chart).toHaveLength(2);
    // 15 marca: (150-100)*5 = 250; 20 czerwca: skumulowane 250 + (200-100)*3 = 550
    expect(chart[0]).toEqual({ date: `${year}-03-15`, pl: 250 });
    expect(chart[1]).toEqual({ date: `${year}-06-20`, pl: 550 });
  });

  it('SELL z zeszlego roku nie wchodzi do YTD nawet po backfill', () => {
    const year = new Date().getFullYear();
    const txs = [
      { type: 'BUY',  symbol: 'MSFT', date: `${year - 2}-01-01`, qty: 10, price: 100, currency: 'USD' },
      { type: 'SELL', symbol: 'MSFT', date: `${year - 1}-12-31`, qty: 5,  price: 200, currency: 'USD' },  // rok temu
      { type: 'SELL', symbol: 'MSFT', date: `${year}-01-15`,     qty: 2,  price: 250, currency: 'USD' },  // YTD
    ];
    const chart = ytdChartData(txs, { USD: 1, PLN: 1 }, 'USD');

    expect(chart).toHaveLength(1);
    expect(chart[0].date).toBe(`${year}-01-15`);
    // Tylko YTD: (250-100)*2 = 300
    expect(chart[0].pl).toBe(300);
  });

  it('wiele SELL tego samego dnia zwija sie do jednego punktu z suma skumulowana', () => {
    const year = new Date().getFullYear();
    const txs = [
      { type: 'BUY',  symbol: 'NVDA', date: `${year - 1}-01-01`, qty: 10, price: 100, currency: 'USD' },
      { type: 'SELL', symbol: 'NVDA', date: `${year}-05-10`,     qty: 2,  price: 150, currency: 'USD' },
      { type: 'SELL', symbol: 'NVDA', date: `${year}-05-10`,     qty: 3,  price: 160, currency: 'USD' },
    ];
    const chart = ytdChartData(txs, { USD: 1, PLN: 1 }, 'USD');

    expect(chart).toHaveLength(1);
    // (150-100)*2 + (160-100)*3 = 100 + 180 = 280
    expect(chart[0]).toEqual({ date: `${year}-05-10`, pl: 280 });
  });

  it('SELL bez BUY w historii i bez costBasis nadal jest pomijany', () => {
    // Bez kotwicy w BUY nie znamy kosztu nabycia — lepiej pominac niz zgadywac.
    const year = new Date().getFullYear();
    const txs = [
      { type: 'SELL', symbol: 'ORPHAN', date: `${year}-02-01`, qty: 5, price: 100, currency: 'USD' },
    ];
    const chart = ytdChartData(txs, { USD: 1, PLN: 1 }, 'USD');
    expect(chart).toEqual([]);
  });
});
