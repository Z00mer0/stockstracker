import { describe, it, expect } from 'vitest';
import { sheetGestureResult } from './sheetGesture.js';

describe('sheetGestureResult', () => {
  it('w dół zamyka, z pełnego ekranu wraca do zwykłej wysokości', () => {
    expect(sheetGestureResult({ dy: 140, expanded: false })).toBe('close');
    expect(sheetGestureResult({ dy: 140, expanded: true })).toBe('collapse');
  });
  it('w górę rozwija na pełny ekran', () => {
    expect(sheetGestureResult({ dy: -60, expanded: false })).toBe('expand');
    expect(sheetGestureResult({ dy: -200, expanded: true })).toBe('stay');
  });
  it('szybkie machnięcie wystarczy, drobny ruch nie', () => {
    expect(sheetGestureResult({ dy: 30, velocity: 1.2, expanded: false })).toBe('close');
    expect(sheetGestureResult({ dy: -30, velocity: -1.2, expanded: false })).toBe('expand');
    expect(sheetGestureResult({ dy: 30, velocity: 0.1, expanded: false })).toBe('stay');
    expect(sheetGestureResult({ dy: 5, velocity: 2, expanded: false })).toBe('stay');
  });
  it('okno, którego nie wolno zamknąć, wraca na miejsce', () => {
    expect(sheetGestureResult({ dy: 300, expanded: false, dismissible: false })).toBe('stay');
  });
});
