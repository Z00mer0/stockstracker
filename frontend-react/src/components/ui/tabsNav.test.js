import { describe, it, expect } from 'vitest';
import { nextTabIndex } from './tabsNav.js';

describe('nextTabIndex', () => {
  it('strzałki zawijają na końcach', () => {
    expect(nextTabIndex(2, 3, 'ArrowRight')).toBe(0);
    expect(nextTabIndex(0, 3, 'ArrowLeft')).toBe(2);
    expect(nextTabIndex(1, 3, 'ArrowRight')).toBe(2);
  });
  it('Home i End skaczą na skraje', () => {
    expect(nextTabIndex(1, 4, 'Home')).toBe(0);
    expect(nextTabIndex(1, 4, 'End')).toBe(3);
  });
  it('inne klawisze i pusta lista nic nie robią', () => {
    expect(nextTabIndex(1, 3, 'Enter')).toBeNull();
    expect(nextTabIndex(0, 0, 'ArrowRight')).toBeNull();
  });
});
