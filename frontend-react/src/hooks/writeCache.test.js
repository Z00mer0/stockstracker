import { describe, it, expect, afterEach, vi } from 'vitest';
import { writeCache } from './usePortfolioMetrics.js';

// Regresja: zapis do cache'u nie był owinięty w try/catch, choć odczyt obok był.
// Safari w trybie prywatnym rzuca na każdym setItem, a przy rosnącym portfelu
// dochodzi przekroczenie limitu. Wyjątek leciał w środku łańcucha fetcha i
// gasił cały dashboard — użytkownik dostawał pustą stronę bez komunikatu.

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

describe('writeCache', () => {
  it('QuotaExceededError nie wychodzi na zewnątrz', () => {
    stubStorage(() => {
      const err = new Error('quota');
      err.name = 'QuotaExceededError';
      throw err;
    });
    expect(() => writeCache('k', { AAPL: { price: 1 } })).not.toThrow();
  });

  it('Safari w trybie prywatnym (rzut na każdym setItem) nie wywraca zapisu', () => {
    stubStorage(() => { throw new Error('SecurityError'); });
    expect(() => writeCache('k', { AAPL: { price: 1 } })).not.toThrow();
  });

  it('normalnie zapisuje dane razem ze znacznikiem czasu', () => {
    const setItem = vi.fn();
    stubStorage(setItem);

    writeCache('portfolio_metrics_cache_AAPL', { AAPL: { price: 42 } });

    expect(setItem).toHaveBeenCalledTimes(1);
    const [key, raw] = setItem.mock.calls[0];
    expect(key).toBe('portfolio_metrics_cache_AAPL');
    const parsed = JSON.parse(raw);
    expect(parsed.data).toEqual({ AAPL: { price: 42 } });
    expect(typeof parsed.ts).toBe('number');
  });
});
