import { describe, it, expect } from 'vitest';
import { logoSources } from './logoSources.js';

describe('logoSources', () => {
  it('najpierw favicon domeny, potem logo po tickerze', () => {
    expect(logoSources('MSFT', 'microsoft.com')).toEqual([
      'https://www.google.com/s2/favicons?domain=microsoft.com&sz=128',
      'https://financialmodelingprep.com/image-stock/MSFT.png',
    ]);
  });

  it('bez domeny — samo logo po tickerze, bez sufiksu .US', () => {
    expect(logoSources('ALAB', null)).toEqual(['https://financialmodelingprep.com/image-stock/ALAB.png']);
    expect(logoSources('GRAB.US', null)).toEqual(['https://financialmodelingprep.com/image-stock/GRAB.png']);
  });

  it('kryptowaluty i puste symbole bez źródeł — zostają inicjały', () => {
    expect(logoSources('BTC-USD', null)).toEqual([]);
    expect(logoSources('', null)).toEqual([]);
  });
});
