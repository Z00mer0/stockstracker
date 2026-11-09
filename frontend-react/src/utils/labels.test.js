import { describe, it, expect } from 'vitest';
import { parseLabels, allLabels, labelView } from './labels.js';

describe('parseLabels', () => {
  it('przycina, zmniejsza litery, usuwa powtórzenia i puste', () => {
    expect(parseLabels(' Emerytura, spekulacja ,, EMERYTURA')).toEqual(['emerytura', 'spekulacja']);
    expect(parseLabels(['A', 'b'])).toEqual(['a', 'b']);
    expect(parseLabels(null)).toEqual([]);
  });
  it('najwyżej 5 etykiet', () => {
    expect(parseLabels('a,b,c,d,e,f,g')).toHaveLength(5);
  });
});

describe('allLabels', () => {
  it('zbiera unikalne etykiety alfabetycznie', () => {
    expect(allLabels([{ labels: ['b', 'a'] }, { labels: ['a'] }, {}])).toEqual(['a', 'b']);
  });
});

describe('labelView', () => {
  const data = {
    portfolio: { holdings: [
      { id: 'h1', symbol: 'PKO.WA', qty: 150, avgPrice: 46.67, currency: 'PLN', name: '' },
      { id: 'h2', symbol: '1048.N', qty: 10, avgPrice: 100, currency: 'PLN', name: 'Alior', assetType: 'fund' },
    ] },
    transactions: [
      { id: '1', type: 'BUY', symbol: 'PKO.WA', qty: 100, price: 50, currency: 'PLN', date: '2025-01-02', labels: ['emerytura'] },
      { id: '2', type: 'BUY', symbol: 'PKO.WA', qty: 50, price: 40, currency: 'PLN', date: '2025-02-02' },
      { id: '3', type: 'SELL', symbol: 'PKO.WA', qty: 40, price: 60, currency: 'PLN', date: '2025-03-02', labels: ['emerytura'] },
      { id: '4', type: 'BUY', symbol: '1048.N', qty: 10, price: 100, currency: 'PLN', date: '2025-01-05', labels: ['emerytura', 'fundusze'] },
      { id: '5', type: 'BUY', symbol: 'AAPL', qty: 1, price: 200, currency: 'USD', date: '2025-01-05', labels: ['spekulacja'] },
    ],
    cash: { PLN: 500 }, snapshots: { '2025-03-01': 9000 }, otherAssets: [{ id: 'o' }], bonds: [{ id: 'b' }],
  };

  it('pozycje tylko z oznaczonych transakcji; nazwa i typ z pozycji', () => {
    const v = labelView(data, ['emerytura']);
    expect(v.transactions.map(t => t.id)).toEqual(['1', '3', '4']);
    expect(v.portfolio.holdings).toEqual([
      { id: 'h1', symbol: 'PKO.WA', qty: 60, avgPrice: 50, currency: 'PLN', name: '' },
      { id: 'h2', symbol: '1048.N', qty: 10, avgPrice: 100, currency: 'PLN', name: 'Alior', assetType: 'fund' },
    ]);
  });

  it('bez gotówki, historii, obligacji i innych aktywów', () => {
    const v = labelView(data, ['emerytura']);
    expect(v.cash).toEqual({});
    expect(v.snapshots).toEqual({});
    expect(v.otherAssets).toEqual([]);
    expect(v.bonds).toEqual([]);
  });

  it('kilka etykiet = suma; brak etykiet = dane bez zmian', () => {
    expect(labelView(data, ['fundusze', 'spekulacja']).portfolio.holdings.map(h => h.symbol)).toEqual(['1048.N', 'AAPL']);
    expect(labelView(data, [])).toBe(data);
  });
});
