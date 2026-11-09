import { describe, it, expect } from 'vitest';
import { depositValue, withDepositValue } from './deposits';

describe('depositValue', () => {
  const term = { kind: 'term', rate: 6, startDate: '2026-01-01', endDate: '2026-07-01' };

  it('lokata: odsetki narosłe netto (po Belce) do dziś', () => {
    // 10 000 × 6% × 90/365 × 0,81 = 119,84
    expect(depositValue(10000, term, '2026-04-01')).toEqual({ value: 10119.84, interest: 119.84, matured: false });
  });

  it('lokata po terminie: odsetki stają na dacie zakończenia', () => {
    // 181 dni
    const r = depositValue(10000, term, '2026-12-01');
    expect(r.matured).toBe(true);
    expect(r.interest).toBe(241.00);
  });

  it('bez podatku Belki (np. IKE)', () => {
    expect(depositValue(10000, { ...term, belka: false }, '2026-04-01').interest).toBe(147.95);
  });

  it('konto oszczędnościowe: kapitalizacja miesięczna, tylko pełne miesiące', () => {
    const acc = { kind: 'savings', rate: 6, startDate: '2026-01-15' };
    expect(depositValue(10000, acc, '2026-02-14').value).toBe(10000);
    // 1. mies.: 40,50; 2. mies.: 10040,50 × 0,005 × 0,81 = 40,66
    expect(depositValue(10000, acc, '2026-03-15').value).toBe(10081.16);
  });

  it('przed datą otwarcia lub bez oprocentowania — sama kwota', () => {
    expect(depositValue(5000, term, '2025-12-01').value).toBe(5000);
    expect(depositValue(5000, { ...term, rate: 0 }, '2026-04-01').value).toBe(5000);
  });
});

describe('withDepositValue', () => {
  it('zwykłe aktywo bez zmian, lokata z principal i bieżącą wartością', () => {
    const plain = { id: 'a', value: 100 };
    expect(withDepositValue(plain)).toBe(plain);
    const d = withDepositValue({ id: 'b', value: 10000, deposit: { kind: 'term', rate: 6, startDate: '2026-01-01', endDate: '2026-07-01' } }, '2026-04-01');
    expect(d.principal).toBe(10000);
    expect(d.value).toBe(10119.84);
  });
});
