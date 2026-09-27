import { describe, it, expect } from 'vitest';
import { groupIntoRows, parseRowsToResult } from './snapshotImport.js';

// Tekst z PDF jako {text, x, y}; kolumny liczbowe wyrównane do prawej:
// najbardziej na prawo wolumen, przed nim wartość rynkowa.
const item = (text, x, y) => ({ text, x, y });
const page = [
  item('Waluta rachunku', 20, 10), item('USD', 150, 11),
  item('Stan na koniec dnia 31.03.2026', 20, 30),
  item('AAPL.US', 20, 100), item('US0378331005', 90, 100), item('1 050,00', 300, 101), item('5', 400, 100),
  item('NVDA.US', 20, 130), item('900.50', 300, 130), item('10', 400, 131),
  // prawa ułamkowe tej samej spółki — sumowane z pełnymi akcjami
  item('NVDA.US', 20, 160), item('45.03', 300, 160), item('0.5', 400, 160),
  item('Razem', 20, 190), item('2 000', 300, 190),
];

describe('snapshot XTB', () => {
  it('liczby z separatorem tysięcy', () => {
    const r = parseRowsToResult([
      [item('XY.US', 0, 0), item('1,050.00', 300, 0), item('2', 400, 0)],
      [item('VOW3.DE', 0, 20), item('1 200,5', 300, 20), item('10', 400, 20)],
    ]);
    expect(r.positions.map(p => [p.symbol, p.qty, p.value])).toEqual([['XY', 2, 1050], ['VOW3.DE', 10, 1200.5]]);
  });

  it('grupuje elementy w wiersze po Y (±6)', () => {
    const rows = groupIntoRows(page);
    expect(rows.find(r => r[0].text === 'AAPL.US').map(i => i.text).sort()).toEqual(['1 050,00', '5', 'AAPL.US', 'US0378331005']);
  });

  it('pozycje, waluta i data zestawienia', () => {
    const r = parseRowsToResult(groupIntoRows(page));
    expect(r.currency).toBe('USD');
    expect(r.statementDate).toBe('2026-03-31');
    const nvda = r.positions.find(p => p.symbol === 'NVDA');
    // 10 + 0,5 szt.; 900,50 + 45,03 = 945,53 → cena 945,53 / 10,5 = 90,050476
    expect(nvda.qty).toBe(10.5);
    expect(nvda.value).toBeCloseTo(945.53, 8);
    expect(nvda.price).toBeCloseTo(90.050476, 6);
    // „1 050,00" z separatorem tysięcy (wcześniej 1 → pozycja pominięta)
    expect(r.positions.find(p => p.symbol === 'AAPL')).toMatchObject({ qty: 5, value: 1050, price: 210 });
    // wiersz „Razem" bez symbolu nie jest pozycją
    expect(r.positions).toHaveLength(2);
  });
});
