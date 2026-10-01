import { describe, it, expect } from 'vitest';
import { rebalanceOrders } from './rebalance.js';

// 10 000 zł: PKO 7 000 zł (70%), AAPL 3 000 zł = 5 akcji po 150 $ przy 4 zł/$.
const positions = [
  { symbol: 'PKO.WA', qty: 100, valuePLN: 7000 },
  { symbol: 'AAPL', qty: 5, valuePLN: 3000 },
];

describe('rebalanceOrders', () => {
  it('liczba akcji spółki zagranicznej liczona po cenie w PLN', () => {
    const orders = rebalanceOrders(positions, { 'PKO.WA': 50, AAPL: 50 }, 10000);
    const aapl = orders.find(o => o.symbol === 'AAPL');
    expect(aapl).toMatchObject({ side: 'buy', amtPLN: 2000, pricePLN: 600 });
    expect(aapl.shares).toBe(3);   // 2000 zł / 600 zł; wcześniej 2000 / 150 $ = 13
    expect(orders.find(o => o.symbol === 'PKO.WA')).toMatchObject({ side: 'sell', amtPLN: 2000, shares: 29 });
  });

  it('odchylenie < 2 pkt proc. — bez zlecenia', () => {
    expect(rebalanceOrders(positions, { 'PKO.WA': 69, AAPL: 31 }, 10000)).toEqual([]);
  });

  it('cele nie sumują się do 100% — bez zleceń', () => {
    expect(rebalanceOrders(positions, { 'PKO.WA': 50, AAPL: 40 }, 10000)).toEqual([]);
    expect(rebalanceOrders(positions, {}, 10000)).toEqual([]);
  });

  it('największe odchylenie pierwsze', () => {
    const three = [...positions, { symbol: 'CDR.WA', qty: 1, valuePLN: 0.0001 }];
    const orders = rebalanceOrders(three, { 'PKO.WA': 40, AAPL: 30, 'CDR.WA': 30 }, 10000);
    expect(orders.map(o => o.symbol)).toEqual(['PKO.WA', 'CDR.WA']);
  });
});
