import { describe, it, expect } from 'vitest';
import { calcXIRR, fmtPeriod } from './usePortfolioMetrics.js';

describe('calcXIRR', () => {
  it('podwojenie kapitału w rok to ~100% rocznie', () => {
    const r = calcXIRR([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 2000 },
    ]);
    expect(r).toBeGreaterThan(95);
    expect(r).toBeLessThan(105);
  });

  it('brak zysku to ~0%', () => {
    const r = calcXIRR([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1000 },
    ]);
    expect(Math.abs(r)).toBeLessThan(0.5);
  });

  it('strata daje wynik ujemny', () => {
    const r = calcXIRR([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 800 },
    ]);
    expect(r).toBeLessThan(0);
  });

  it('ten sam zysk osiągnięty szybciej daje wyższą stopę roczną', () => {
    const wolno = calcXIRR([{ date: '2024-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1200 }]);
    const szybko = calcXIRR([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1200 }]);
    expect(szybko).toBeGreaterThan(wolno);
  });

  it('uwzględnia dopłaty w trakcie', () => {
    const r = calcXIRR([
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-07-01', amount: -1000 },
      { date: '2026-01-01', amount: 2200 },
    ]);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(50);
  });

  it('kolejność przepływów nie ma znaczenia', () => {
    const a = calcXIRR([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 1500 }]);
    const b = calcXIRR([{ date: '2026-01-01', amount: 1500 }, { date: '2025-01-01', amount: -1000 }]);
    expect(a).toBeCloseTo(b, 6);
  });

  it('zwraca null, gdy nie ma z czego liczyć', () => {
    expect(calcXIRR([])).toBeNull();
    expect(calcXIRR(null)).toBeNull();
    expect(calcXIRR([{ date: '2025-01-01', amount: -1000 }])).toBeNull();
  });

  it('całkowita strata nie zwraca liczby udającej wynik', () => {
    // Regresja: NPV jest tu płaski, więc pochodna wynosi zero i pętla
    // przerywała się w pierwszym kroku, wypuszczając na zewnątrz wartość
    // początkową 0.1 — interfejs pokazywał "+10%" na inwestycji wartej zero.
    // Osiągalne w praktyce, gdy ceny się nie załadują.
    expect(calcXIRR([{ date: '2025-01-01', amount: -1000 }, { date: '2026-01-01', amount: 0 }])).toBeNull();
  });

  it('same zakupy, bez wyceny końcowej, nie dają wyniku', () => {
    // Wszystkie przepływy ujemne — równanie nie ma pierwiastka.
    expect(calcXIRR([
      { date: '2025-01-01', amount: -1000 },
      { date: '2025-06-01', amount: -500 },
    ])).toBeNull();
  });
});

describe('fmtPeriod', () => {
  it('dni, miesiące i lata', () => {
    expect(fmtPeriod(12)).toBe('12d');
    expect(fmtPeriod(90)).toBe('3mo');
    expect(fmtPeriod(730)).toBe('2.0yr');
  });

  it('brak danych to myślnik', () => {
    expect(fmtPeriod(null)).toBe('—');
  });
});
