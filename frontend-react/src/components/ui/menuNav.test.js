import { describe, it, expect } from 'vitest';
import { placeMenu, nextMenuIndex } from './menuNav.js';

const vp = { width: 400, height: 800 };
const menu = { width: 200, height: 300 };

describe('placeMenu', () => {
  it('pod przyciskiem, gdy jest miejsce', () => {
    expect(placeMenu({ top: 100, bottom: 130, left: 50, right: 150 }, menu, vp)).toEqual({ top: 134, left: 50 });
  });
  it('nad przyciskiem, gdy pod spodem brak miejsca', () => {
    expect(placeMenu({ top: 700, bottom: 730, left: 50, right: 150 }, menu, vp).top).toBe(700 - 4 - 300);
  });
  it('gdy nie mieści się nigdzie — dosunięte do dołu ekranu', () => {
    const tall = { width: 200, height: 700 };
    expect(placeMenu({ top: 300, bottom: 330, left: 50, right: 150 }, tall, vp).top).toBe(800 - 8 - 700);
  });
  it('wyrównanie do prawej krawędzi przycisku', () => {
    expect(placeMenu({ top: 100, bottom: 130, left: 250, right: 380 }, menu, vp, 'right').left).toBe(180);
  });
  it('nie wystaje poza lewą ani prawą krawędź okna', () => {
    expect(placeMenu({ top: 100, bottom: 130, left: 350, right: 390 }, menu, vp).left).toBe(400 - 8 - 200);
    expect(placeMenu({ top: 100, bottom: 130, left: 0, right: 40 }, menu, vp, 'right').left).toBe(8);
  });
});

describe('nextMenuIndex', () => {
  const focusable = [1, 2, 4]; // 0 = nagłówek, 3 = separator
  it('strzałki pomijają nieaktywne pozycje i zawijają', () => {
    expect(nextMenuIndex(2, focusable, 'ArrowDown')).toBe(4);
    expect(nextMenuIndex(4, focusable, 'ArrowDown')).toBe(1);
    expect(nextMenuIndex(1, focusable, 'ArrowUp')).toBe(4);
  });
  it('bez fokusu na pozycji strzałka w dół daje pierwszą, w górę ostatnią', () => {
    expect(nextMenuIndex(-1, focusable, 'ArrowDown')).toBe(1);
    expect(nextMenuIndex(-1, focusable, 'ArrowUp')).toBe(4);
  });
  it('Home/End i pusta lista', () => {
    expect(nextMenuIndex(2, focusable, 'Home')).toBe(1);
    expect(nextMenuIndex(2, focusable, 'End')).toBe(4);
    expect(nextMenuIndex(0, [], 'ArrowDown')).toBeNull();
    expect(nextMenuIndex(1, focusable, 'Enter')).toBeNull();
  });
});
