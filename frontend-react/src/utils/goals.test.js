import { describe, it, expect } from 'vitest';
import { goalProgress, monthlyNeeded, monthsUntil } from './goals.js';

const now = new Date('2026-11-09T12:00:00');

describe('monthsUntil / monthlyNeeded', () => {
  it('miesiące do terminu', () => {
    expect(monthsUntil('2027-11', now)).toBe(12);
    expect(monthsUntil('', now)).toBeNull();
  });
  it('wpłata miesięczna; bez wzrostu = różnica / miesiące', () => {
    expect(monthlyNeeded(0, 1200, 12, 0.0000001)).toBeCloseTo(100, 1);
    expect(monthlyNeeded(2000, 1000, 12)).toBe(0);
    expect(monthlyNeeded(0, 1000, 0)).toBeNull();
  });
});

describe('goalProgress', () => {
  it('cel wartości z terminem', () => {
    const p = goalProgress({ kind: 'value', target: 1_000_000, deadline: '2035-11' }, { value: 250_000, now });
    expect(p.pct).toBeCloseTo(25, 6);
    expect(p.months).toBe(108);
    expect(p.monthly).toBeGreaterThan(0);
    // sprawdzenie: 250k + wpłaty przez 108 mies. przy 6%/r dają 1 mln
    const r = 0.06 / 12;
    expect(250_000 * (1 + r) ** 108 + p.monthly * (((1 + r) ** 108 - 1) / r)).toBeCloseTo(1_000_000, 0);
  });
  it('cel dywidendowy: portfel potrzebny przy 5% i postęp z dywidend netto', () => {
    const p = goalProgress({ kind: 'dividends', target: 2000 }, { value: 100_000, monthlyDividends: 500, now });
    expect(p.pct).toBeCloseTo(25, 6);
    expect(p.capitalNeeded).toBeCloseTo(480_000, 6);
    expect(p.monthly).toBeUndefined();
  });
  it('osiągnięty i po terminie', () => {
    expect(goalProgress({ kind: 'value', target: 100 }, { value: 150, now })).toMatchObject({ done: true, pct: 100 });
    expect(goalProgress({ kind: 'value', target: 1000, deadline: '2026-10' }, { value: 150, now }).overdue).toBe(true);
  });
});
