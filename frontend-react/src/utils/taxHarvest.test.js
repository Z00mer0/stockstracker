import { describe, it, expect } from 'vitest';
import { harvestPlan, lastSellDate } from './taxHarvest.js';

describe('harvestPlan', () => {
  it('bez strat z lat poprzednich — 19% od straty do wysokości zysku', () => {
    const p = harvestPlan({ 2026: 10_000 }, 2026, [{ symbol: 'A', lossPLN: 3_000 }, { symbol: 'B', lossPLN: 9_000 }]);
    expect(p.taxBefore).toBe(1900);
    expect(p.rows.map(r => r.savingPLN)).toEqual([570, 1330]);
    expect(p.taxAfter).toBe(0);
    expect(p.carriedToNextYears).toBe(2_000);
  });

  it('strata z 2025 już obniża podatek — sprzedaż daje mniej', () => {
    // 2025: −8000 → w 2026 można odliczyć najwyżej 4000 (50%).
    const p = harvestPlan({ 2025: -8_000, 2026: 10_000 }, 2026, [{ symbol: 'A', lossPLN: 3_000 }]);
    expect(p.carryDeduction).toBe(4_000);
    expect(p.taxBefore).toBe(1140);                 // 19% od 6000
    expect(p.rows[0].savingPLN).toBe(570);          // 6000 → 7000 dochodu mniej o 3000: 19% od 3000
  });

  it('gdy stare straty i nowa strata przekraczają zysk — oszczędność tylko do zera', () => {
    const p = harvestPlan({ 2025: -8_000, 2026: 5_000 }, 2026, [{ symbol: 'A', lossPLN: 4_000 }]);
    // przed: 5000 − 4000 (50% straty z 2025) = 1000 → 190; po: dochód 1000, odliczenie 1000 → 0
    expect(p.taxBefore).toBe(190);
    expect(p.rows[0].savingPLN).toBe(190);
  });
});

describe('lastSellDate', () => {
  it('GPW T+2 bez rozliczeń 31.12 — 2025 zgodnie z komunikatem mBanku (23.12)', () => {
    expect(lastSellDate('PKO.WA', 'PLN', 2025)).toBe('2025-12-23');
  });

  it('2026: GPW 28.12, USA (T+1) 30.12, wg daty zawarcia — ostatnia sesja', () => {
    expect(lastSellDate('PKO.WA', 'PLN', 2026)).toBe('2026-12-28');
    expect(lastSellDate('AAPL', 'USD', 2026)).toBe('2026-12-30');
    expect(lastSellDate('PKO.WA', 'PLN', 2026, 'trade')).toBe('2026-12-30');
  });
});
