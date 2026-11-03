import { describe, it, expect } from 'vitest';
import { fromQuote, currencyMismatch, withQuoteCurrency, fetchQuoteCurrencies } from './quoteCurrency.js';

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

describe('withQuoteCurrency', () => {
  const cur = { 'CSPX.L': 'USD' };
  it('kupno/sprzedaż i pozycja dostają walutę notowania', () => {
    expect(withQuoteCurrency([{ type: 'BUY', symbol: 'CSPX.L', currency: 'GBP' }], cur)[0].currency).toBe('USD');
    expect(withQuoteCurrency([{ symbol: 'CSPX.L', qty: 1, currency: 'GBP' }], cur)[0].currency).toBe('USD');
  });
  it('dywidenda i gotówka zostają w walucie rachunku; inne symbole bez zmian', () => {
    const div = { type: 'DIV', symbol: 'CSPX.L', currency: 'PLN' };
    const other = { type: 'BUY', symbol: 'BP.L', currency: 'GBP' };
    expect(withQuoteCurrency([div, other], cur)).toEqual([div, other]);
  });
});

describe('fetchQuoteCurrencies', () => {
  it('pyta tylko o symbole spoza USA i GPW; pensy jako GBP', async () => {
    const calls = [];
    const orig = globalThis.fetch;
    globalThis.fetch = async url => {
      calls.push(url);
      return { ok: true, json: async () => ({ quotes: { 'CSPX.L': { quote: { currency: 'USD' } }, 'BP.L': { quote: { currency: 'GBp' } } } }) };
    };
    const r = await fetchQuoteCurrencies(['CSPX.L', 'BP.L', 'NVDA', 'PKO.WA', 'CSPX.L']);
    globalThis.fetch = orig;
    expect(r).toEqual({ 'CSPX.L': 'USD', 'BP.L': 'GBP' });
    expect(calls).toHaveLength(1);
    expect(decodeURIComponent(calls[0])).toContain('symbols=CSPX.L,BP.L');
  });
});
