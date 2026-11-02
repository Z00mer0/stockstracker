import { describe, it, expect } from 'vitest';
import { valueBond, defaultEarlyFee, BOND_TAX } from './bondService.js';

// Inflacja r/r 5% we wszystkich miesiącach 2024–2025 względem roku wcześniej.
function cpi(from = 2023, to = 2025, yoy = 0.05) {
  const m = new Map();
  for (let y = from; y <= to; y++) {
    for (let mo = 1; mo <= 12; mo++) m.set(`${y}-${String(mo).padStart(2, '0')}`, 100 * (1 + yoy) ** (y - from));
  }
  return m;
}

describe('defaultEarlyFee', () => {
  it('emisje od września 2024 mają wyższą opłatę', () => {
    expect(defaultEarlyFee('EDO', '2023-05-10')).toBe(2);
    expect(defaultEarlyFee('EDO', '2024-09-01')).toBe(3);
    expect(defaultEarlyFee('COI', '2024-08-31')).toBe(0.7);
    expect(defaultEarlyFee('COI', '2025-02-01')).toBe(2);
  });
});

describe('valueBond', () => {
  const edo = { type: 'EDO', purchaseDate: '2024-01-15', count: 10, firstYearRate: 6.9, margin: 2 };

  it('drugi rok EDO: marża + inflacja, kapitalizacja po pierwszym roku', () => {
    const v = valueBond(edo, cpi(), new Date('2025-01-15T12:00:00'));
    expect(v.periodIndex).toBe(1);
    expect(v.currentRate).toBeCloseTo(0.07, 6);
    expect(v.valuePerBond).toBeGreaterThan(106.9);
    expect(v.estimated).toBe(false);
  });

  it('wykup dziś = wartość − opłata − 19% od odsetek po opłacie', () => {
    const v = valueBond(edo, cpi(), new Date('2025-07-15T12:00:00'));
    const interest = v.valuePerBond - 100;
    const fee = 2;                              // emisja sprzed września 2024
    expect(v.feeTotal).toBeCloseTo(fee * 10, 6);
    expect(v.taxTotal).toBeCloseTo(BOND_TAX * (interest - fee) * 10, 6);
    expect(v.redeemTodayTotal).toBeCloseTo((v.valuePerBond - fee - BOND_TAX * (interest - fee)) * 10, 6);
  });

  it('IKE/IKZE — bez podatku; własna opłata z listu emisyjnego', () => {
    const v = valueBond({ ...edo, taxFree: true, earlyFee: 1.5 }, cpi(), new Date('2025-07-15T12:00:00'));
    expect(v.taxTotal).toBe(0);
    expect(v.feeTotal).toBeCloseTo(15, 6);
  });

  it('EDO: opłata nie większa niż narosłe odsetki', () => {
    const v = valueBond({ ...edo, purchaseDate: '2025-01-15' }, cpi(), new Date('2025-01-20T12:00:00'));
    expect(v.feeTotal).toBeCloseTo((v.valuePerBond - 100) * 10, 6);
    expect(v.redeemTodayTotal).toBeCloseTo(1000, 6);
  });

  it('COI po 1. okresie: opłata w całości, nawet ponad odsetki', () => {
    const coi = { type: 'COI', purchaseDate: '2024-03-01', count: 1, firstYearRate: 6.3, margin: 1.25 };
    const v = valueBond(coi, cpi(), new Date('2025-03-02T12:00:00'));
    expect(v.periodIndex).toBe(1);
    expect(v.valuePerBond - 100).toBeLessThan(0.7);
    expect(v.feeTotal).toBeCloseTo(0.7, 6);
    expect(v.taxTotal).toBe(0);
    expect(v.redeemTodayTotal).toBeLessThan(100);
  });

  it('w terminie wykupu nie ma opłaty', () => {
    const v = valueBond({ ...edo, purchaseDate: '2014-01-15' }, cpi(2003, 2025), new Date('2025-01-15T12:00:00'));
    expect(v.matured).toBe(true);
    expect(v.feeTotal).toBe(0);
  });

  it('brak inflacji z miesiąca odniesienia → ostatnia znana i znacznik szacunku', () => {
    // 3. okres od 2026-01-15 potrzebuje inflacji z 2025-11, a seria kończy się na 2024-12.
    const v = valueBond(edo, cpi(2023, 2024), new Date('2026-03-01T12:00:00'));
    expect(v.periodIndex).toBe(2);
    expect(v.currentRate).toBeCloseTo(0.07, 6);
    expect(v.estimated).toBe(true);
  });
});
