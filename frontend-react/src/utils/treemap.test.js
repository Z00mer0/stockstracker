import { describe, it, expect } from 'vitest';
import { squarify, heatTone } from './treemap.js';

const R = { x: 0, y: 0, w: 600, h: 400 };
const overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-6;

describe('squarify', () => {
  const values = [6, 6, 4, 3, 2, 2, 1];   // przykład z pracy Bruls i in.
  const rects = squarify(values, R);

  it('pole kafelka proporcjonalne do wartości, suma = cały prostokąt', () => {
    const total = values.reduce((a, b) => a + b, 0);
    rects.forEach((r, i) => expect(r.w * r.h).toBeCloseTo((values[i] / total) * 600 * 400, 6));
  });

  it('kafelki w obrębie prostokąta i bez nakładania', () => {
    rects.forEach(r => {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9); expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(600 + 1e-6); expect(r.y + r.h).toBeLessThanOrEqual(400 + 1e-6);
    });
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i], rects[j])).toBe(false);
  });

  it('kafelki zbliżone do kwadratu (proporcje ≤ 3:1 w tym przykładzie)', () => {
    rects.forEach(r => expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThanOrEqual(3));
  });

  it('kolejność wyniku = kolejność wejścia; wartości ≤ 0 i pusty zbiór', () => {
    const r = squarify([1, 0, 3], R);
    expect(r[1].w * r[1].h).toBe(0);
    expect(r[2].w * r[2].h).toBeCloseTo(3 * r[0].w * r[0].h, 6);
    expect(squarify([], R)).toEqual([]);
    expect(squarify([0, 0], R).every(x => x.w === 0)).toBe(true);
  });
});

describe('heatTone', () => {
  it('siła koloru rośnie do ±3%, znak = ton', () => {
    expect(heatTone(1.5)).toEqual({ tone: 'up', strength: 50 });
    expect(heatTone(-6)).toEqual({ tone: 'down', strength: 100 });
    expect(heatTone(0)).toEqual({ tone: 'none', strength: 0 });
    expect(heatTone(null)).toEqual({ tone: 'none', strength: 0 });
  });
});
