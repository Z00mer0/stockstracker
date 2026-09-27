import { describe, it, expect } from 'vitest';
import { runway } from './runway.js';

describe('runway', () => {
  it('zerowa realna stopa: kapitał / wypłata', () => {
    expect(runway({ capital: 120000, monthly: 1000, returnPct: 3, inflationPct: 3 }).months).toBe(120);
  });

  it('ujemna realna stopa skraca czas (wcześniej liczone jak przy zerowej)', () => {
    const r = runway({ capital: 120000, monthly: 1000, returnPct: 2, inflationPct: 5 });
    expect(r.months).toBeLessThan(120);
    // Po wyliczonej liczbie miesięcy kapitał jeszcze jest, miesiąc później już nie.
    expect(r.after(r.months / 12)).toBeGreaterThanOrEqual(-1e-6);
    expect(r.after((r.months + 1) / 12)).toBeLessThan(0);
  });

  it('dodatnia stopa: wieczny, gdy odsetki pokrywają wypłaty', () => {
    expect(runway({ capital: 1_000_000, monthly: 1000, returnPct: 5, inflationPct: 0 }).eternal).toBe(true);
    const r = runway({ capital: 500000, monthly: 5000, returnPct: 5, inflationPct: 3 });
    expect(r.eternal).toBe(false);
    expect(r.after(r.months / 12)).toBeGreaterThanOrEqual(-1e-6);
    expect(r.after((r.months + 1) / 12)).toBeLessThan(0);
  });
});
