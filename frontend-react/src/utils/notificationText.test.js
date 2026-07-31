import { describe, it, expect } from 'vitest';
import {
  getPriceChangeBucket,
  shouldNotify,
  pickVariantKey,
  variantCount,
} from './notificationText.js';
import pl from '../translations/pl.js';
import en from '../translations/en.js';

describe('getPriceChangeBucket', () => {
  it('classifies boundaries', () => {
    expect(getPriceChangeBucket(-7.87)).toBe('bigDrop');
    expect(getPriceChangeBucket(-5)).toBe('bigDrop');
    expect(getPriceChangeBucket(-4.99)).toBe('smallDrop');
    expect(getPriceChangeBucket(-0.5)).toBe('smallDrop');
    expect(getPriceChangeBucket(0)).toBe('flat');
    expect(getPriceChangeBucket(0.49)).toBe('flat');
    expect(getPriceChangeBucket(0.5)).toBe('smallGain');
    expect(getPriceChangeBucket(4.99)).toBe('smallGain');
    expect(getPriceChangeBucket(5)).toBe('bigGain');
    expect(getPriceChangeBucket(12)).toBe('bigGain');
  });
  it('handles missing values', () => {
    expect(getPriceChangeBucket(null)).toBe('flat');
    expect(getPriceChangeBucket(NaN)).toBe('flat');
  });
});

describe('shouldNotify', () => {
  it('fires only past ±5%', () => {
    expect(shouldNotify(-7.87)).toBe(true);
    expect(shouldNotify(-4.9)).toBe(false);
    expect(shouldNotify(0)).toBe(false);
    expect(shouldNotify(4.9)).toBe(false);
    expect(shouldNotify(5.01)).toBe(true);
  });
});

describe('pickVariantKey', () => {
  it('is deterministic per ticker/day/tone/bucket', () => {
    const a = pickVariantKey({ ticker: 'AMD', tone: 'funny', bucket: 'bigDrop', dateKey: '2026-07-28' });
    const b = pickVariantKey({ ticker: 'AMD', tone: 'funny', bucket: 'bigDrop', dateKey: '2026-07-28' });
    expect(a).toBe(b);
  });
  it('emits keys within variant range', () => {
    for (const ticker of ['AMD', 'NVDA', 'TSLA', 'AAPL', 'MSFT']) {
      const key = pickVariantKey({ ticker, tone: 'professional', bucket: 'bigGain', dateKey: '2026-07-28' });
      const idx = Number(key.split('_').pop());
      expect(idx).toBeGreaterThanOrEqual(1);
      expect(idx).toBeLessThanOrEqual(variantCount('bigGain'));
    }
  });
});

// Licznik wariantów i teksty leżą w osobnych plikach, więc podniesienie
// VARIANT_COUNTS bez dopisania tłumaczeń wyświetliłoby użytkownikowi goły
// klucz ("notif_fun_bigGain_7") zamiast zdania. Ten test to łapie.
describe('warianty maja pokrycie w tlumaczeniach', () => {
  const BUCKETS = ['bigDrop', 'smallDrop', 'flat', 'smallGain', 'bigGain'];

  for (const [langName, dict] of [['pl', pl], ['en', en]]) {
    it(`${langName}: kazdy klucz wariantu istnieje i nie jest pusty`, () => {
      const missing = [];
      for (const bucket of BUCKETS) {
        for (const tone of ['pro', 'fun']) {
          for (let i = 1; i <= variantCount(bucket); i++) {
            const key = `notif_${tone}_${bucket}_${i}`;
            if (!dict[key] || !String(dict[key]).trim()) missing.push(key);
          }
        }
      }
      expect(missing).toEqual([]);
    });
  }

  it('pl i en maja identyczny zestaw kluczy wariantow', () => {
    const variantKeys = d => Object.keys(d).filter(k => /^notif_(pro|fun)_/.test(k)).sort();
    expect(variantKeys(pl)).toEqual(variantKeys(en));
  });
});
