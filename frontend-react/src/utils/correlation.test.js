import { describe, it, expect } from 'vitest';
import { returnsByDate, correlation, correlationMatrix, weightedAvgCorrelation, MIN_COMMON_DAYS } from './correlation.js';

// Szereg cen z zadanych stóp dziennych, daty kolejne od 2026-01-01.
const day = i => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
function series(rets, { skip = new Set() } = {}) {
  const out = [{ date: day(0), price: 100 }];
  rets.forEach((r, i) => out.push({ date: day(i + 1), price: out[out.length - 1].price * (1 + r) }));
  return out.filter((_, i) => !skip.has(i));
}
const wave = n => Array.from({ length: n }, (_, i) => Math.sin(i * 1.7) / 50);

describe('correlation', () => {
  it('ten sam ruch → 1, odwrotny → −1', () => {
    const base = returnsByDate(series(wave(100)));
    expect(correlation(base, base)).toBeCloseTo(1, 10);
    expect(correlation(base, returnsByDate(series(wave(100).map(r => -r))))).toBeCloseTo(-1, 2);
  });

  it('za krótka wspólna historia → null', () => {
    const a = returnsByDate(series(wave(MIN_COMMON_DAYS - 1)));
    expect(correlation(a, a)).toBeNull();
  });

  it('porównuje tylko wspólne dni (brak notowania nie przesuwa par)', () => {
    const rets = wave(120);
    const full = series(rets);
    // Drugi papier nie notowany w dniu 50: jego stopa z dnia 51 obejmuje dwa dni
    // i nie ma pary, ale pozostałe dni muszą się zgadzać 1:1.
    const holes = series(rets, { skip: new Set([50]) });
    const r = correlation(returnsByDate(full), returnsByDate(holes));
    expect(r).toBeGreaterThan(0.95);
  });

  it('stały kurs (zero zmienności) → null', () => {
    const flat = returnsByDate(series(Array(80).fill(0)));
    expect(correlation(flat, returnsByDate(series(wave(80))))).toBeNull();
  });
});

describe('correlationMatrix', () => {
  it('symetryczna, 1 na przekątnej, pary od najmocniejszej', () => {
    const w = wave(100);
    const { symbols, matrix, pairs } = correlationMatrix({
      A: series(w),
      B: series(w.map(r => r * 2)),
      C: series(w.map(r => -r)),
    });
    expect(symbols).toEqual(['A', 'B', 'C']);
    expect(matrix[0][0]).toBe(1);
    expect(matrix[0][1]).toBeCloseTo(matrix[1][0], 12);
    expect(pairs[0]).toMatchObject({ a: 'A', b: 'B' });
    expect(pairs[pairs.length - 1].r).toBeLessThan(0);
  });
});

describe('weightedAvgCorrelation', () => {
  it('waży parę udziałami obu pozycji', () => {
    const pairs = [{ a: 'A', b: 'B', r: 0.9 }, { a: 'A', b: 'C', r: 0.1 }];
    // A·B = 50·40 = 2000, A·C = 50·10 = 500 → (0,9·2000 + 0,1·500) / 2500 = 0,74
    expect(weightedAvgCorrelation(pairs, { A: 50, B: 40, C: 10 })).toBeCloseTo(0.74, 10);
    expect(weightedAvgCorrelation([], {})).toBeNull();
  });
});
