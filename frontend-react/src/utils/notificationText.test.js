import { describe, it, expect } from 'vitest';
import {
  getPriceChangeBucket,
  shouldNotify,
  pickVariantKey,
  VARIANTS_PER_BUCKET,
} from './notificationText.js';

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
      expect(idx).toBeLessThanOrEqual(VARIANTS_PER_BUCKET);
    }
  });
});
