import { describe, it, expect } from 'vitest';
import { rebalanceOrders, allocateNewMoney } from './rebalance.js';

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

describe('allocateNewMoney', () => {
  // PKO 7000 zł (70 zł/akcja), AAPL 3000 zł (600 zł/akcja); cel 50/50.
  it('wpłata mniejsza niż luka — wszystko w niedoważoną spółkę, całe akcje', () => {
    const r = allocateNewMoney(positions, { 'PKO.WA': 50, AAPL: 50 }, 10000, 1000);
    // Po wpłacie 11 000: luka AAPL 2500, PKO 0 → cały 1000 zł do AAPL = 1 akcja (600), 400 zł reszty.
    // Reszta 400 zł: PKO nadal ma nadwyżkę (luka < 0), więc nic nie dokupujemy.
    expect(r.orders).toEqual([expect.objectContaining({ symbol: 'AAPL', shares: 1, cost: 600 })]);
    expect(r.leftover).toBeCloseTo(400, 9);
  });

  it('wpłata większa niż luki — nadwyżka według udziałów docelowych', () => {
    const r = allocateNewMoney(positions, { 'PKO.WA': 50, AAPL: 50 }, 10000, 6000);
    // Nowa wartość 16 000 → cel 8000/8000; luki: PKO 1000, AAPL 5000 = 6000 — dokładnie wpłata.
    const pko = r.orders.find(o => o.symbol === 'PKO.WA');
    const aapl = r.orders.find(o => o.symbol === 'AAPL');
    expect(pko.amtPLN).toBeCloseTo(1000, 9);
    expect(aapl.amtPLN).toBeCloseTo(5000, 9);
    expect(aapl.shares).toBe(8);          // 4800 zł
    // 14 akcji PKO (980 zł) z luki; z reszty 220 zł jedna PKO domyka lukę (20 zł),
    // dalej już tylko przekroczenie celu — 150 zł zostaje jako gotówka.
    expect(pko.shares).toBe(15);
    expect(r.leftover).toBeCloseTo(150, 9);
  });

  it('bez celów sumujących się do 100% nic nie proponuje', () => {
    expect(allocateNewMoney(positions, { AAPL: 30 }, 10000, 1000).orders).toEqual([]);
  });
});
