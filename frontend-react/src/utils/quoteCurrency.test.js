import { describe, it, expect } from 'vitest';
import { fromQuote, currencyMismatch } from './quoteCurrency.js';

describe('quoteCurrency', () => {
  it('pensy → funty', () => {
    expect(fromQuote(450, 'GBp')).toEqual({ price: 4.5, currency: 'GBP' });
    expect(fromQuote(450, 'GBX')).toEqual({ price: 4.5, currency: 'GBP' });
    expect(fromQuote(550.3, 'USD')).toEqual({ price: 550.3, currency: 'USD' });
    expect(fromQuote(10, undefined)).toEqual({ price: 10, currency: null });
  });

  it('niezgodna waluta pozycji', () => {
    expect(currencyMismatch('USD', 'GBP')).toBe('USD');
    expect(currencyMismatch('GBP', 'GBP')).toBeNull();
    expect(currencyMismatch(null, 'GBP')).toBeNull();
  });
});
