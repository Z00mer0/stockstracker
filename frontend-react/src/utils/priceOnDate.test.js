import { describe, it, expect } from 'vitest';
import { currencyForSymbol, closeOnOrBefore } from './priceOnDate.js';

const chart = (days, closes, currency = 'USD') => ({
  chart: { result: [{
    meta: { currency },
    timestamp: days.map(d => Date.parse(`${d}T14:30:00Z`) / 1000),
    indicators: { quote: [{ close: closes }] },
  }] },
});

describe('currencyForSymbol', () => {
  it('po sufiksie giełdy', () => {
    expect(currencyForSymbol('cdr.wa')).toBe('PLN');
    expect(currencyForSymbol('AAPL')).toBe('USD');
    expect(currencyForSymbol('VOW3.DE')).toBe('EUR');
    expect(currencyForSymbol('ASML.AS')).toBe('EUR');
    expect(currencyForSymbol('SHEL.L')).toBe('GBP');
    expect(currencyForSymbol('BTC-USD')).toBe('USD');
    expect(currencyForSymbol('7203.T')).toBeNull();
    expect(currencyForSymbol('')).toBeNull();
  });
});

describe('closeOnOrBefore', () => {
  const c = chart(['2026-10-15', '2026-10-16', '2026-10-19'], [10, 11, 12]);

  it('zamknięcie z tego dnia', () => {
    expect(closeOnOrBefore(c, '2026-10-16')).toEqual({ date: '2026-10-16', price: 11, currency: 'USD' });
  });

  it('w weekend — ostatnia sesja przed', () => {
    expect(closeOnOrBefore(c, '2026-10-18')).toEqual({ date: '2026-10-16', price: 11, currency: 'USD' });
  });

  it('pomija puste zamknięcia, a bez danych zwraca null', () => {
    expect(closeOnOrBefore(chart(['2026-10-15', '2026-10-16'], [10, null]), '2026-10-16').price).toBe(10);
    expect(closeOnOrBefore(c, '2026-10-01')).toBeNull();
    expect(closeOnOrBefore({}, '2026-10-16')).toBeNull();
  });

  it('pensy z Londynu na funty; nieznana waluta → null', () => {
    expect(closeOnOrBefore(chart(['2026-10-16'], [2500], 'GBp'), '2026-10-16')).toMatchObject({ price: 25, currency: 'GBP' });
    expect(closeOnOrBefore(chart(['2026-10-16'], [3000], 'JPY'), '2026-10-16').currency).toBeNull();
  });
});
