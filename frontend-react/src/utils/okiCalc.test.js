import { describe, it, expect } from 'vitest';
import {
  meanValueOverYear, okiTaxForYear, simulateOki,
  OKI_LIMIT,
} from './okiCalc.js';

describe('meanValueOverYear', () => {
  it('brak wzrostu = srednia rowna wartosci startowej', () => {
    expect(meanValueOverYear(100_000, 0)).toBeCloseTo(100_000, 6);
  });

  it('srednia lezy miedzy start a koniec przy dodatnim wzroscie', () => {
    const mean = meanValueOverYear(100_000, 0.10);
    expect(mean).toBeGreaterThan(100_000);
    expect(mean).toBeLessThan(110_000);
  });

  it('wieksza liczba probek nie rozjezdza wyniku (stabilne)', () => {
    const m12 = meanValueOverYear(100_000, 0.10, 12);
    const m365 = meanValueOverYear(100_000, 0.10, 365);
    expect(Math.abs(m12 - m365)).toBeLessThan(50);
  });

  it('zero lub ujemna wartosc startowa = 0', () => {
    expect(meanValueOverYear(0, 0.10)).toBe(0);
    expect(meanValueOverYear(-1000, 0.10)).toBe(0);
  });
});

describe('okiTaxForYear', () => {
  it('ponizej limitu = brak podatku', () => {
    expect(okiTaxForYear(50_000)).toBe(0);
    expect(okiTaxForYear(OKI_LIMIT)).toBe(0);
  });

  it('powyzej limitu = 0.85% od nadwyzki', () => {
    // 200k sredniej -> 100k nadwyzki -> 850 zl
    expect(okiTaxForYear(200_000)).toBeCloseTo(850, 6);
  });
});

describe('simulateOki', () => {
  it('portfel ponizej limitu = zerowy podatek OKI, ale Belka i tak boli', () => {
    const r = simulateOki({ initialValue: 50_000, annualReturnPct: 10, years: 5 });
    expect(r.okiCumTax).toBe(0);
    expect(r.regularCumTax).toBeGreaterThan(0);
    expect(r.advantage).toBeGreaterThan(0);
  });

  it('OKI wygrywa z aktywnym zarzadzaniem na dluzszym horyzoncie', () => {
    const r = simulateOki({ initialValue: 100_000, annualReturnPct: 10, years: 20 });
    expect(r.advantage).toBeGreaterThan(0);
    expect(r.okiCumTax).toBeGreaterThan(0);
    expect(r.regularCumTax).toBeGreaterThan(r.okiCumTax);
  });

  it('gdy user trzyma do konca, Belka naliczana raz — a nie co roku', () => {
    const yearly = simulateOki({ initialValue: 100_000, annualReturnPct: 10, years: 20, activelyManaged: true });
    const held = simulateOki({ initialValue: 100_000, annualReturnPct: 10, years: 20, activelyManaged: false });
    // Trzymanie do konca zawsze konczy sie wyzszym netto od aktywnego
    // zarzadzania — kapital pracuje bez erozji podatkowej co rok.
    expect(held.regularNet).toBeGreaterThan(yearly.regularNet);
  });

  it('ujemna stopa zwrotu = strata, OKI nie zaklada ujemnego podatku', () => {
    const r = simulateOki({ initialValue: 200_000, annualReturnPct: -10, years: 3 });
    expect(r.okiNet).toBeLessThan(200_000);
    // Portfel siada ponizej limitu -> podatek OKI zjezdza do zera
    expect(r.okiCumTax).toBeGreaterThanOrEqual(0);
    // Belka od straty = 0
    expect(r.regularCumTax).toBe(0);
  });

  it('rows.length = years, ostatni wiersz konczy netto', () => {
    const r = simulateOki({ initialValue: 100_000, annualReturnPct: 10, years: 5 });
    expect(r.rows).toHaveLength(5);
    expect(r.rows[4].okiEnd).toBeCloseTo(r.okiNet, 6);
    expect(r.rows[4].regEnd).toBeCloseTo(r.regularNet, 6);
  });

  it('rzad wielkosci: 100k, 10%, 20 lat, aktywne — OKI daje kilkadziesiat tys. przewagi', () => {
    const r = simulateOki({ initialValue: 100_000, annualReturnPct: 10, years: 20, activelyManaged: true });
    // Sanity check zgodny z mockupem (~140k przewagi przy tych zalozeniach)
    expect(r.advantage).toBeGreaterThan(80_000);
    expect(r.advantage).toBeLessThan(250_000);
  });
});
