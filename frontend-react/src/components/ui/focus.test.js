import { describe, it, expect } from 'vitest';
import { trapTarget } from './focus.js';

describe('trapTarget', () => {
  it('Tab z ostatniego elementu wraca na pierwszy', () => {
    expect(trapTarget(2, 3, false)).toBe(0);
  });
  it('Shift+Tab z pierwszego elementu idzie na ostatni', () => {
    expect(trapTarget(0, 3, true)).toBe(2);
  });
  it('w środku listy zostawia ruch przeglądarce', () => {
    expect(trapTarget(1, 3, false)).toBeNull();
    expect(trapTarget(1, 3, true)).toBeNull();
  });
  it('fokus poza elementami (na panelu) trafia na pierwszy / ostatni', () => {
    expect(trapTarget(-1, 3, false)).toBe(0);
    expect(trapTarget(-1, 3, true)).toBe(2);
  });
  it('bez fokusowalnych elementów zatrzymuje fokus na panelu', () => {
    expect(trapTarget(-1, 0, false)).toBe(-1);
    expect(trapTarget(-1, 0, true)).toBe(-1);
  });
});
