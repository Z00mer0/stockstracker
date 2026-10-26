import { describe, it, expect } from 'vitest';
import { dailyReturns, volatility, sharpe, sortino, beta, periodsPerYear } from './riskMetrics.js';
import { twrSeries } from './historyStats.js';

const day = i => `2026-01-${String(i + 1).padStart(2, '0')}`;

describe('dailyReturns', () => {
  it('pomija uszkodzone dni (|r| > 50%)', () => {
    const s = [{ date: 'a', index: 1 }, { date: 'b', index: 1.1 }, { date: 'c', index: 3 }, { date: 'd', index: 3.3 }];
    const r = dailyReturns(s);
    expect(r.map(x => x.date)).toEqual(['b', 'd']);
    expect(r[0].r).toBeCloseTo(0.1, 12);
  });

  it('wpłata nie jest stopą zwrotu (liczone na indeksie TWR)', () => {
    const rows = [
      { date: day(0), total: 1000, capital: 1000 },
      { date: day(1), total: 1010, capital: 1000 },   // +1%
      { date: day(2), total: 2010, capital: 2000 },   // wpłata 1000
    ];
    const r = dailyReturns(twrSeries(rows));
    expect(r.map(x => +x.r.toFixed(10))).toEqual([0.01, 0]);
  });
});

describe('volatility / sharpe / sortino', () => {
  const alt = Array.from({ length: 10 }, (_, i) => ({ date: day(i), prevDate: day(i), r: i % 2 ? -0.01 : 0.01 }));

  it('zmienność = odch. std. próbkowe · √(stóp na rok)', () => {
    expect(volatility(alt, 252)).toBeCloseTo(Math.sqrt((10 * 0.0001 / 9) * 252) * 100, 10);
  });

  it('za mało danych → null', () => {
    expect(volatility(alt.slice(0, 9))).toBeNull();
    expect(sharpe(alt.slice(0, 9))).toBeNull();
    expect(sortino(alt.slice(0, 9))).toBeNull();
  });

  it('Sharpe i Sortino ze średniej rocznej minus stopa wolna od ryzyka', () => {
    const vol = volatility(alt, 252) / 100;
    expect(sharpe(alt, 0.045, 252)).toBeCloseTo((0 - 0.045) / vol, 10);
    expect(sortino(alt, 0.045, 252)).toBeCloseTo((0 - 0.045) / Math.sqrt(0.0001 * 252), 10);
  });

  it('snapshoty codzienne z weekendami: rok to ~365 stóp, nie 252', () => {
    // Rok sesji: 5 dni ±1%, weekend bez ruchu — 364 stopy na 364 dni.
    const rs = [];
    for (let i = 1; i <= 364; i++) {
      const d = new Date(Date.UTC(2025, 0, 1 + i)), p = new Date(Date.UTC(2025, 0, i));
      const wd = d.getUTCDay();
      rs.push({ date: d.toISOString().slice(0, 10), prevDate: p.toISOString().slice(0, 10), r: wd % 6 ? (i % 2 ? 0.01 : -0.01) : 0 });
    }
    expect(periodsPerYear(rs)).toBeCloseTo(365, 6);
    // Ta sama zmienność co z samych sesji: ~260 stóp ±1% na rok → ~16%.
    const sessions = rs.filter(x => x.r !== 0);
    expect(volatility(rs)).toBeCloseTo(volatility(sessions, sessions.length), 0);
  });
});

describe('beta', () => {
  // Benchmark: stopy +1% / −0,5% na przemian; portfel: dokładnie 2× benchmark.
  const n = 24;
  const benchR = i => (i % 2 ? -0.005 : 0.01);
  const bench = {}; let b = 100;
  const series = []; let idx = 1;
  for (let i = 0; i < n; i++) {
    if (i > 0) { b *= 1 + benchR(i); idx *= 1 + 2 * benchR(i); }
    bench[day(i)] = b;
    series.push({ date: day(i), index: idx });
  }

  it('portfel 2× benchmark → beta 2', () => {
    expect(beta(dailyReturns(series), bench)).toBeCloseTo(2, 10);
  });

  it('odfiltrowany uszkodzony dzień nie przesuwa par (wcześniej przesuwał)', () => {
    const broken = series.map((p, i) => (i === 10 ? { ...p, index: p.index * 2.2 } : p));
    const r = dailyReturns(broken);
    expect(r.length).toBe(n - 3); // dzień 10 (+120%) i 11 (−55%) odpadają
    expect(beta(r, bench)).toBeCloseTo(2, 10);
  });

  it('brak notowania benchmarku w dniu portfela → ostatnia znana cena', () => {
    const sparse = Object.fromEntries(Object.entries(bench).filter(([d]) => d !== day(5)));
    expect(beta(dailyReturns(series), sparse)).not.toBeNull();
  });
});
