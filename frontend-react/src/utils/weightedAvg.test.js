import { describe, it, expect } from 'vitest';
import { weightedAvg } from './weightedAvg.js';

describe('weightedAvg', () => {
  it('uśrednia dwie partie proporcjonalnie do ilości', () => {
    // 10 szt. po 100 + 30 szt. po 200 → 175, a nie 150 (średnia arytmetyczna)
    expect(weightedAvg(10, 100, 30, 200)).toBe(175);
  });

  it('dokupienie do pustej pozycji daje cenę zakupu', () => {
    expect(weightedAvg(0, 0, 5, 42)).toBe(42);
  });

  it('zwraca 0 zamiast NaN, gdy suma ilości wynosi zero', () => {
    // Guard istnieje po to, żeby dzielenie przez zero nie wypuściło NaN
    // do wyceny portfela — NaN przenosi się na każdą kolejną operację.
    expect(weightedAvg(0, 100, 0, 200)).toBe(0);
  });

  it('zwraca 0 przy ujemnej sumie ilości', () => {
    expect(weightedAvg(5, 100, -10, 200)).toBe(0);
  });

  it('radzi sobie z ilościami ułamkowymi (krypto)', () => {
    expect(weightedAvg(0.5, 40000, 0.5, 60000)).toBe(50000);
  });
});
