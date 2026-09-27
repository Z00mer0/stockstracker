import { describe, it, expect } from 'vitest';
import { historyStats, twrSeries } from './historyStats.js';

const row = (date, total, capital) => ({ date, total, capital });

describe('historyStats', () => {
  it('wpłata nie jest zyskiem', () => {
    const s = historyStats([row('2026-01-01', 1000, 1000), row('2026-01-02', 2000, 2000)]);
    expect(s.profit).toBe(0);
    expect(s.twrPct).toBeCloseTo(0, 10);
  });

  it('zysk przed wpłatą zostaje, wpłata go nie rozwadnia', () => {
    const s = historyStats([
      row('2026-01-01', 1000, 1000),
      row('2026-01-02', 1100, 1000),   // +10%
      row('2026-01-03', 2100, 2000),   // wpłata 1000, bez zmiany cen
    ]);
    expect(s.profit).toBe(100);
    expect(s.twrPct).toBeCloseTo(10, 10);
  });

  it('wypłata nie jest obsunięciem', () => {
    const s = historyStats([row('2026-01-01', 1000, 1000), row('2026-01-02', 500, 500)]);
    expect(s.mdd).toBeNull();
    expect(s.twrPct).toBeCloseTo(0, 10);
  });

  it('prawdziwe obsunięcie liczone od szczytu', () => {
    const s = historyStats([row('2026-01-01', 1000, 1000), row('2026-01-02', 800, 1000), row('2026-01-03', 900, 1000)]);
    expect(s.mdd.pct).toBeCloseTo(20, 10);
    expect(s.mdd).toMatchObject({ from: '2026-01-01', to: '2026-01-02' });
  });

  it('CAGR z TWR w skali roku, dopiero od 90 dni', () => {
    const year = historyStats([row('2025-01-01', 1000, 1000), row('2026-01-01', 1100, 1000)]);
    expect(year.cagr).toBeCloseTo(10, 10);
    const short = historyStats([row('2026-01-01', 1000, 1000), row('2026-03-01', 1100, 1000)]);
    expect(short.cagr).toBeNull();
  });

  it('krótki okres z wpłatami: CAGR nie eksploduje jak wcześniej', () => {
    // Stary wzór: (wartość / koszt)^(365/dni) — przy kapitale dokładanym po
    // drodze dawał +74% dla okresu z wynikiem +2,3%.
    const s = historyStats([row('2026-01-01', 10000, 10000), row('2026-04-01', 30690, 30000)]);
    expect(s.twrPct).toBeCloseTo(6.9, 10);
    expect(s.cagr).toBeCloseTo((Math.pow(1.069, 365 / 90) - 1) * 100, 8);
  });

  it('pusta lista', () => {
    expect(historyStats([])).toMatchObject({ profit: null, twrPct: null, cagr: null, series: [] });
  });
});

describe('twrSeries', () => {
  it('indeks zaczyna od 1 i łańcuchuje dzienne stopy', () => {
    const s = twrSeries([row('a', 100, 100), row('b', 110, 100), row('c', 121, 100)]);
    expect(s.map(p => +p.index.toFixed(10))).toEqual([1, 1.1, 1.21]);
  });
});
