import { describe, it, expect } from 'vitest';
import { computePortfolioValue } from './portfolioValue.js';

const pos = (valuePLN, costPLN) => ({ valuePLN, costPLN });
const SNAPS = [
  { date: '2026-07-20', total: 5000 },
  { date: '2026-07-24', total: 9000 },   // najnowszy
  { date: '2026-07-22', total: 7000 },
];

describe('computePortfolioValue', () => {
  it('wszystkie pozycje z ceną → suma wartości rynkowych', () => {
    const r = computePortfolioValue([pos(1000, 800), pos(500, 600)], SNAPS);
    expect(r.totalValue).toBe(1500);
    expect(r.pricesLoaded).toBe(true);
    expect(r.staleTotal).toBe(false);
    expect(r.partialPrices).toBe(false);
  });

  it('pozycja bez ceny liczona po koszcie, nie zamraża całej wartości', () => {
    // Sedno logiki hybrydowej: jeden brakujący symbol nie może cofnąć
    // całego portfela do wczorajszego snapshotu.
    const r = computePortfolioValue([pos(1000, 800), pos(null, 600)], SNAPS);
    expect(r.totalValue).toBe(1600);
    expect(r.partialPrices).toBe(true);
    expect(r.staleTotal).toBe(false);
  });

  it('positionsValue liczy tylko wycenione pozycje', () => {
    // Do wykresu kołowego i udziałów — tam koszt zakupu zafałszowałby proporcje.
    const r = computePortfolioValue([pos(1000, 800), pos(null, 600)], SNAPS);
    expect(r.positionsValue).toBe(1000);
    expect(r.hybridValue).toBe(1600);
  });

  it('zero cen → wartość z najnowszego snapshotu', () => {
    const r = computePortfolioValue([pos(null, 800), pos(null, 600)], SNAPS);
    expect(r.totalValue).toBe(9000);
    expect(r.staleTotal).toBe(true);
    expect(r.partialPrices).toBe(false);
  });

  it('zero cen i brak snapshotów → null, a nie zero', () => {
    // Zero wyglądałoby jak prawdziwa wycena; null pokazuje "—" i loader.
    const r = computePortfolioValue([pos(null, 800)], []);
    expect(r.totalValue).toBeNull();
    expect(r.staleTotal).toBe(false);
  });

  it('extraValue dokłada gotówkę i inne aktywa', () => {
    const r = computePortfolioValue([pos(1000, 800)], SNAPS, 2500);
    expect(r.totalValue).toBe(3500);
  });

  it('extraValue NIE jest doliczany do wartości ze snapshotu', () => {
    // Snapshot to już wartość całości z tamtej sesji — dodanie do niego
    // dzisiejszej gotówki policzyłoby ją podwójnie.
    const r = computePortfolioValue([pos(null, 800)], SNAPS, 2500);
    expect(r.totalValue).toBe(9000);
  });

  it('pusty portfel: zero, nie snapshot', () => {
    // Tutaj kopie się rozjechały. Dashboard traktował pustą listę jako
    // "ceny załadowane" i pokazywał 0, Portfolio szło po snapshot.
    // Zero jest poprawne: brak pozycji to wartość zero, a nie wczorajsza.
    const r = computePortfolioValue([], SNAPS);
    expect(r.totalValue).toBe(0);
    expect(r.pricesLoaded).toBe(true);
    expect(r.anyPriceLoaded).toBe(true);
    expect(r.staleTotal).toBe(false);
  });

  it('pusty portfel z gotówką pokazuje samą gotówkę', () => {
    const r = computePortfolioValue([], SNAPS, 1200);
    expect(r.totalValue).toBe(1200);
  });

  it('brakujące costPLN nie robi NaN', () => {
    const r = computePortfolioValue([pos(1000, 800), { valuePLN: null }], SNAPS);
    expect(r.totalValue).toBe(1000);
    expect(Number.isNaN(r.totalValue)).toBe(false);
  });

  it('snapshoty nieposortowane — bierzemy najnowszy po dacie', () => {
    const r = computePortfolioValue([pos(null, 1)], SNAPS);
    expect(r.totalValue).toBe(9000);
  });

  it('nie modyfikuje przekazanej tablicy snapshotów', () => {
    const snaps = [...SNAPS];
    computePortfolioValue([pos(null, 1)], snaps);
    expect(snaps.map(s => s.date)).toEqual(['2026-07-20', '2026-07-24', '2026-07-22']);
  });

  it('staleTotal i partialPrices nigdy nie są prawdziwe naraz', () => {
    // To dwa różne komunikaty w interfejsie; pokazanie obu byłoby sprzeczne.
    for (const positions of [[pos(1, 1)], [pos(null, 1)], [pos(1, 1), pos(null, 1)], []]) {
      const r = computePortfolioValue(positions, SNAPS);
      expect(r.staleTotal && r.partialPrices).toBe(false);
    }
  });
});
