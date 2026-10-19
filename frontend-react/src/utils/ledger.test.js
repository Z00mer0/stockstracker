import { describe, it, expect } from 'vitest';
import { applyTransaction, revertTransaction, positionMismatches, cashAmount, baseSymbol } from './ledger.js';

const buy = (qty, price, extra = {}) => ({ id: 'b', type: 'BUY', symbol: 'CDR.WA', qty, price, currency: 'PLN', date: '2026-01-02', ...extra });
const sell = (qty, price, extra = {}) => ({ id: 's', type: 'SELL', symbol: 'CDR.WA', qty, price, currency: 'PLN', date: '2026-02-02', ...extra });

describe('applyTransaction', () => {
  it('BUY tworzy pozycję i zapisuje efekt', () => {
    const r = applyTransaction({ holdings: [], cash: {} }, buy(10, 100));
    expect(r.holdings).toMatchObject([{ symbol: 'CDR.WA', qty: 10, avgPrice: 100, currency: 'PLN' }]);
    expect(r.tx.effect).toEqual({ qty: 10 });
    expect(r.cash).toEqual({});
  });

  it('BUY dokłada do pozycji średnią ważoną i zdejmuje gotówkę, ale nie poniżej zera', () => {
    const state = { holdings: [{ symbol: 'CDR.WA', qty: 10, avgPrice: 100, currency: 'PLN' }], cash: { PLN: 1500 } };
    const r = applyTransaction(state, buy(10, 200), { cash: true });
    expect(r.holdings[0]).toMatchObject({ qty: 20, avgPrice: 150 });
    expect(r.cash.PLN).toBe(0);
    expect(r.tx.effect).toEqual({ qty: 10, cash: -1500 });
  });

  it('SELL zmniejsza pozycję, zapisuje koszt i dopisuje gotówkę', () => {
    const state = { holdings: [{ symbol: 'CDR.WA', qty: 10, avgPrice: 100, currency: 'PLN' }], cash: {} };
    const r = applyTransaction(state, sell(4, 150), { cash: true });
    expect(r.holdings[0].qty).toBe(6);
    expect(r.cash.PLN).toBe(600);
    expect(r.tx).toMatchObject({ costBasis: 100, effect: { qty: -4, cash: 600 } });
  });

  it('SELL całości usuwa pozycję; za dużo akcji to błąd', () => {
    const state = { holdings: [{ symbol: 'CDR.WA', qty: 10, avgPrice: 100, currency: 'PLN' }], cash: {} };
    expect(applyTransaction(state, sell(10, 150)).holdings).toEqual([]);
    expect(() => applyTransaction(state, sell(11, 150))).toThrow(/Za mało/);
  });

  it('waluta inna niż pozycji to błąd', () => {
    const state = { holdings: [{ symbol: 'CDR.WA', qty: 10, avgPrice: 100, currency: 'PLN' }], cash: {} };
    expect(() => applyTransaction(state, buy(1, 30, { currency: 'USD' }))).toThrow(/PLN/);
  });

  it('bez positions zmienia tylko gotówkę', () => {
    const r = applyTransaction({ holdings: [], cash: { PLN: 50 } }, buy(1, 20), { positions: false, cash: true });
    expect(r.holdings).toEqual([]);
    expect(r.cash.PLN).toBe(30);
  });

  it('DIV i CASH zmieniają gotówkę; CASH zawsze, ze znakiem', () => {
    const div = { type: 'DIV', symbol: 'PKO.WA', qty: 100, price: 2.5, currency: 'PLN' };
    expect(applyTransaction({ cash: {} }, div).cash).toEqual({});
    expect(applyTransaction({ cash: {} }, div, { cash: true }).cash).toEqual({ PLN: 250 });
    const out = { type: 'CASH', symbol: '', qty: null, price: -300, currency: 'USD' };
    const r = applyTransaction({ cash: { USD: 100 } }, out);
    expect(r.cash.USD).toBe(-200);
    expect(r.tx.effect).toEqual({ cash: -300 });
  });

  it('SPLIT mnoży ilość i dzieli średnią', () => {
    const state = { holdings: [{ symbol: 'NVDA', qty: 2, avgPrice: 1000, currency: 'USD' }] };
    const r = applyTransaction(state, { type: 'SPLIT', symbol: 'NVDA', ratio: 10, currency: 'USD' });
    expect(r.holdings[0]).toMatchObject({ qty: 20, avgPrice: 100 });
    expect(revertTransaction(r, r.tx).holdings[0]).toMatchObject({ qty: 2, avgPrice: 1000 });
  });
});

describe('revertTransaction', () => {
  it('cofnięcie BUY przywraca ilość, średnią i gotówkę', () => {
    const start = { holdings: [{ symbol: 'CDR.WA', qty: 10, avgPrice: 100, currency: 'PLN' }], cash: { PLN: 5000 } };
    const r = applyTransaction(start, buy(10, 200), { cash: true });
    const back = revertTransaction(r, r.tx);
    expect(back.holdings[0]).toMatchObject({ qty: 10, avgPrice: 100 });
    expect(back.cash.PLN).toBe(5000);
  });

  it('cofnięcie BUY, który otworzył pozycję, ją usuwa', () => {
    const r = applyTransaction({ holdings: [], cash: {} }, buy(5, 10));
    expect(revertTransaction(r, r.tx).holdings).toEqual([]);
  });

  it('cofnięcie SELL zamykającego pozycję odtwarza ją po koszcie', () => {
    const start = { holdings: [{ symbol: 'CDR.WA', qty: 10, avgPrice: 100, currency: 'PLN' }], cash: {} };
    const r = applyTransaction(start, sell(10, 150), { cash: true });
    const back = revertTransaction(r, r.tx);
    expect(back.holdings).toMatchObject([{ symbol: 'CDR.WA', qty: 10, avgPrice: 100 }]);
    expect(back.cash.PLN).toBe(0);
  });

  it('transakcja bez effect niczego nie zmienia', () => {
    const state = { holdings: [{ symbol: 'X', qty: 1, avgPrice: 1 }], cash: { PLN: 1 } };
    expect(revertTransaction(state, buy(1, 1))).toEqual(state);
  });
});

describe('positionMismatches', () => {
  it('zgodne pozycje nie są zgłaszane, także przy innym sufiksie giełdy', () => {
    const txs = [buy(10, 100, { symbol: 'XTB.PL' }), sell(4, 120, { symbol: 'XTB.PL' })];
    expect(positionMismatches(txs, [{ symbol: 'XTB.WA', qty: 6, avgPrice: 100, currency: 'PLN' }])).toEqual([]);
  });

  it('zgłasza pozycję bez historii i historię bez pozycji', () => {
    const txs = [buy(10, 100)];
    const holdings = [{ symbol: 'AAPL', qty: 3, avgPrice: 180, currency: 'USD' }];
    expect(positionMismatches(txs, holdings)).toEqual([
      { symbol: 'AAPL', history: 0, portfolio: 3, avgPrice: 180, currency: 'USD' },
      { symbol: 'CDR.WA', history: 10, portfolio: 0, avgPrice: null, currency: 'PLN' },
    ]);
  });
});

describe('pomocnicze', () => {
  it('cashAmount i baseSymbol', () => {
    expect(cashAmount(buy(2, 10))).toBe(-20);
    expect(cashAmount({ type: 'DIVIDEND', qty: 10, price: 1 })).toBe(10);
    expect(baseSymbol('xtb.pl')).toBe('XTB');
  });
});
