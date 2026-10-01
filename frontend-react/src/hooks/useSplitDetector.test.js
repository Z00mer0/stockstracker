import { describe, it, expect } from 'vitest';
import { detectSplits } from './useSplitDetector.js';

const NVDA = { NVDA: [{ date: '2024-06-10', numerator: 10, denominator: 1, ratio: '10:1' }] };
const pos = [{ symbol: 'NVDA', qty: 5, avgPrice: 900, currency: 'USD' }];

describe('detectSplits', () => {
  it('zgłasza split po zakupie (typ z importu małymi literami też)', () => {
    const a = detectSplits(pos, [{ type: 'buy', symbol: 'NVDA', qty: 5, date: '2024-01-02' }], NVDA);
    expect(a).toEqual([expect.objectContaining({ symbol: 'NVDA', ratio: 10, label: '10:1', qty: 5, avgPrice: 900 })]);
  });
  it('pomija: zakup po splicie, split już zastosowany, odrzucony', () => {
    expect(detectSplits(pos, [{ type: 'BUY', symbol: 'NVDA', date: '2024-07-01' }], NVDA)).toEqual([]);
    const applied = [{ type: 'BUY', symbol: 'NVDA', date: '2024-01-02' }, { type: 'SPLIT', symbol: 'NVDA', date: '2024-06-10', ratio: 10 }];
    expect(detectSplits(pos, applied, NVDA)).toEqual([]);
    expect(detectSplits(pos, applied.slice(0, 1), NVDA, new Set(['NVDA_2024-06-10']))).toEqual([]);
  });
});
