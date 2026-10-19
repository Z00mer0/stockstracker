import { describe, it, expect } from 'vitest';
import { positionStats } from './positionStats.js';

describe('positionStats', () => {
  const txs = [
    { type: 'BUY', symbol: 'NVDA', qty: 1, price: 1000, currency: 'USD', date: '2023-01-10' },
    { type: 'SELL', symbol: 'NVDA', qty: 1, price: 1200, currency: 'USD', date: '2023-06-01' },
    { type: 'BUY', symbol: 'NVDA', qty: 2, price: 900, currency: 'USD', date: '2024-03-01' },
    { type: 'SPLIT', symbol: 'NVDA', ratio: 10, date: '2024-06-10' },
    { type: 'BUY', symbol: 'NVDA', qty: 5, price: 120, currency: 'USD', date: '2024-07-01' },
    { type: 'DIVIDEND', symbol: 'NVDA', qty: 25, price: 0.01, tax: 0.05, currency: 'USD', date: '2024-09-01' },
    { type: 'BUY', symbol: 'AAPL', qty: 1, price: 100, currency: 'USD', date: '2024-01-01' },
  ];

  it('transakcje po splicie, od kiedy trzymana i dywidendy netto w PLN', () => {
    const s = positionStats(txs, 'NVDA', { USD: 4 });
    expect(s.trades.map(t => [t.date, t.type, t.qty, t.price])).toEqual([
      ['2023-01-10', 'BUY', 10, 100],
      ['2023-06-01', 'SELL', 10, 120],
      ['2024-03-01', 'BUY', 20, 90],
      ['2024-07-01', 'BUY', 5, 120],
    ]);
    // Pozycja zamknięta w 2023 — liczy się zakup z 2024.
    expect(s.since).toBe('2024-03-01');
    expect(s.dividendsPLN).toBeCloseTo((0.25 - 0.05) * 4);
  });

  it('XTB.PL i XTB.WA to ta sama pozycja; brak historii → null', () => {
    const s = positionStats([{ type: 'BUY', symbol: 'XTB.PL', qty: 3, price: 60, currency: 'PLN', date: '2025-02-01' }], 'XTB.WA');
    expect(s.since).toBe('2025-02-01');
    expect(positionStats([], 'XTB.WA')).toEqual({ trades: [], since: null, dividendsPLN: 0 });
  });
});
