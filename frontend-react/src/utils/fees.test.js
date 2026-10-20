import { describe, it, expect } from 'vitest';
import { applyTransaction, revertTransaction } from './ledger.js';
import { computeRealizedTrades } from './realizedPL.js';
import { computePit38 } from './pit38.js';
import { capitalNative } from './capital.js';
import { holdingsAt } from './investedAtDate.js';
import { dividendTaxRate } from '../services/dividendService.js';

// Prowizje (tx.fee) i podatek od dywidendy (tx.tax) w całym łańcuchu:
// pozycja → gotówka → wynik sprzedaży → PIT-38 → kapitał.
const buy = { id: 'b', type: 'BUY', symbol: 'CDR.WA', qty: 10, price: 100, fee: 5, currency: 'PLN', date: '2025-01-10' };
const sell = { id: 's', type: 'SELL', symbol: 'CDR.WA', qty: 10, price: 120, fee: 6, currency: 'PLN', date: '2025-03-10' };

describe('prowizje', () => {
  it('zakup: prowizja w średniej cenie i z gotówki; cofnięcie przywraca wszystko', () => {
    const r = applyTransaction({ holdings: [], cash: { PLN: 2000 } }, buy, { cash: true });
    expect(r.holdings[0].avgPrice).toBeCloseTo(100.5);
    expect(r.cash.PLN).toBe(995);
    const r2 = applyTransaction(r, { ...buy, id: 'b2', price: 110, fee: 0 }, { cash: true });
    const back = revertTransaction(r2, r2.tx);
    expect(back.holdings[0].avgPrice).toBeCloseTo(100.5);
    expect(back.cash.PLN).toBe(995);
  });

  it('sprzedaż: prowizja pomniejsza przychód w gotówce i wynik', () => {
    const r = applyTransaction({ holdings: [], cash: {} }, buy);
    const s = applyTransaction(r, sell, { cash: true });
    expect(s.cash.PLN).toBe(1194);
    const [trade] = computeRealizedTrades([buy, s.tx]);
    // 10 × 120 − 6 − 10 × 100,5 = 189
    expect(trade.plNative).toBeCloseTo(189);
    expect(trade.fee).toBe(6);
    expect(trade.pct).toBeCloseTo(189 / 1005 * 100);
  });

  it('sprzedaż z importu (bez costBasis) odtwarza koszt z prowizją zakupu', () => {
    const [trade] = computeRealizedTrades([buy, sell]);
    expect(trade.costBasis).toBeCloseTo(100.5);
    expect(trade.plNative).toBeCloseTo(189);
  });

  it('ręczny wynik (overridePL) jest ostateczny', () => {
    const [trade] = computeRealizedTrades([buy, { ...sell, costBasis: 100.5, overridePL: 150 }]);
    expect(trade.plNative).toBeCloseTo(150);
  });

  it('odtworzona z historii pozycja ma koszt z prowizją', () => {
    expect(holdingsAt([buy]).get('CDR.WA').avg).toBeCloseTo(100.5);
  });

  it('PIT-38: prowizje kupna (proporcjonalnie) i sprzedaży są kosztem, po kursach z dnia przed', () => {
    const usdBuy = { id: 'ub', type: 'BUY', symbol: 'AAPL', qty: 10, price: 100, fee: 2, currency: 'USD', date: '2025-01-10' };
    const usdSell = { id: 'us', type: 'SELL', symbol: 'AAPL', qty: 5, price: 120, fee: 1, currency: 'USD', date: '2025-03-10' };
    const rates = { USD: { '2025-01-09': 4.0, '2025-03-09': 3.8 } };
    const r = computePit38([usdBuy, usdSell], { basis: 'trade', year: 2025, rates });
    const row = r.rows[0];
    // koszt: 5 × 100 × 4,0 + (5/10 × 2) × 4,0 + 1 × 3,8 = 2000 + 4 + 3,8
    expect(row.feesPLN).toBeCloseTo(7.8);
    expect(row.costPLN).toBeCloseTo(2007.8);
    expect(row.gainPLN).toBeCloseTo(5 * 120 * 3.8 - 2007.8);
  });

  it('PIT-38: brak kursu dla prowizji sprzedaży nie liczy kosztu', () => {
    const usdBuy = { id: 'ub', type: 'BUY', symbol: 'AAPL', qty: 1, price: 100, currency: 'USD', date: '2025-01-10' };
    const usdSell = { id: 'us', type: 'SELL', symbol: 'AAPL', qty: 1, price: 120, fee: 1, currency: 'USD', date: '2025-03-10' };
    const row = computePit38([usdBuy, usdSell], { basis: 'trade', year: 2025, rates: { USD: { '2025-01-09': 4.0 } } }).rows[0];
    expect(row.costPLN).toBeNull();
    expect(row.gainPLN).toBeNull();
  });

  it('kapitał się nie zmienia od prowizji — to koszt, nie wypłata', () => {
    const r = applyTransaction({ holdings: [], cash: { PLN: 2000 } }, buy, { cash: true });
    const s = applyTransaction(r, sell, { cash: true });
    const before = capitalNative({ holdings: [], cash: { PLN: 2000 }, transactions: [] });
    const after = capitalNative({ holdings: s.holdings, cash: s.cash, transactions: [r.tx, s.tx] });
    expect(after.PLN).toBeCloseTo(before.PLN);
  });
});

describe('podatek od dywidendy', () => {
  const div = { type: 'DIV', symbol: 'PKO.WA', qty: 100, price: 2, tax: 38, currency: 'PLN', date: '2025-06-01' };

  it('do gotówki wpływa kwota netto, a kapitał się nie zmienia', () => {
    const r = applyTransaction({ cash: {} }, div, { cash: true });
    expect(r.cash.PLN).toBe(162);
    const before = capitalNative({ cash: {}, transactions: [] });
    const after = capitalNative({ cash: r.cash, transactions: [r.tx] });
    expect(after.PLN ?? 0).toBeCloseTo(before.PLN ?? 0);
  });

  it('stawka: pobrany podatek wygrywa z szacunkiem, za granicą nie mniej niż 19%', () => {
    // Szacunek czyta ustawienie W-8BEN z localStorage (domyślnie 15%).
    globalThis.localStorage ??= { getItem: () => null };
    expect(dividendTaxRate(div, '')).toBeCloseTo(0.19);
    expect(dividendTaxRate({ ...div, tax: 0 }, 'IKE')).toBe(0);
    const us = { type: 'DIV', symbol: 'AAPL', qty: 10, price: 1, tax: 1.5, currency: 'USD' };
    expect(dividendTaxRate(us, '')).toBeCloseTo(0.19);
    expect(dividendTaxRate(us, 'IKE')).toBeCloseTo(0.15);
    expect(dividendTaxRate({ ...us, tax: undefined }, 'IKE')).toBeCloseTo(0.15);
  });
});
