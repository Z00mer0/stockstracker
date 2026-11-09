import { describe, it, expect } from 'vitest';
import { reconcileHoldings, applyBrokerQuantities } from './brokerReconcile.js';

const broker = [
  { symbol: 'ORCL', qty: 3, avgPrice: 130.23, currency: 'USD' },
  { symbol: 'CRWV', qty: 0.5, avgPrice: 49.82, currency: 'USD' },
  { symbol: 'PKO.WA', qty: 10, avgPrice: 50, currency: 'PLN' },
];

describe('reconcileHoldings', () => {
  it('brak w aplikacji, zgodne, nadmiar w aplikacji', () => {
    const app = [
      { symbol: 'CRWV', qty: 0.5, avgPrice: 49.82, currency: 'USD' },
      { symbol: 'PKO.WA', qty: 12, avgPrice: 48, currency: 'PLN' },
      { symbol: 'NVDA', qty: 2, avgPrice: 120, currency: 'USD' },
      { symbol: 'BTC-USD', qty: 0.1, avgPrice: 60000, currency: 'USD' },
    ];
    expect(reconcileHoldings(app, broker)).toEqual([
      { symbol: 'NVDA', appSymbol: 'NVDA', appQty: 2, brokerQty: 0, diff: -2, brokerAvg: null, currency: 'USD' },
      { symbol: 'ORCL', appSymbol: null, appQty: 0, brokerQty: 3, diff: 3, brokerAvg: 130.23, currency: 'USD' },
      { symbol: 'PKO.WA', appSymbol: 'PKO.WA', appQty: 12, brokerQty: 10, diff: -2, brokerAvg: 50, currency: 'PLN' },
    ]);
  });

  it('ten sam instrument pod innym zapisem (SMSN.L ↔ SMSN.IL, .US)', () => {
    expect(reconcileHoldings([{ symbol: 'SMSN.L', qty: 1 }], [{ symbol: 'SMSN.IL', qty: 1 }])).toEqual([]);
    expect(reconcileHoldings([{ symbol: 'AAPL', qty: 2 }], [{ symbol: 'AAPL.US', qty: 2 }])).toEqual([]);
  });
});

describe('applyBrokerQuantities', () => {
  it('ustawia ilości jak w XTB, dodaje brakujące, usuwa nadmiarowe', () => {
    const app = [{ symbol: 'PKO.WA', qty: 12, avgPrice: 48, currency: 'PLN' }, { symbol: 'NVDA', qty: 2, avgPrice: 120, currency: 'USD' }];
    const next = applyBrokerQuantities(app, reconcileHoldings(app, broker));
    expect(next.map(h => [h.symbol, h.qty, h.avgPrice])).toEqual([['PKO.WA', 10, 48], ['CRWV', 0.5, 49.82], ['ORCL', 3, 130.23]]);
  });
});
