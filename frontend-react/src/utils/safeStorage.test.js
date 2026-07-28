import { describe, it, expect, afterEach, vi } from 'vitest';
import { lsSet } from './safeStorage.js';

const realStorage = globalThis.localStorage;

function stubStorage(setItem) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { setItem, getItem: () => null, removeItem: () => {} },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: realStorage,
    configurable: true,
    writable: true,
  });
});

describe('lsSet', () => {
  it('QuotaExceededError nie wychodzi na zewnątrz i zwraca false', () => {
    stubStorage(() => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    });
    expect(lsSet('k', 'v')).toBe(false);
  });

  it('Safari w trybie prywatnym rzuca na każdym zapisie — też false', () => {
    stubStorage(() => { throw new Error('SecurityError'); });
    expect(lsSet('k', 'v')).toBe(false);
  });

  it('udany zapis przechodzi do localStorage i zwraca true', () => {
    const setItem = vi.fn();
    stubStorage(setItem);
    expect(lsSet('myfund_x', 'wartość')).toBe(true);
    expect(setItem).toHaveBeenCalledWith('myfund_x', 'wartość');
  });
});
