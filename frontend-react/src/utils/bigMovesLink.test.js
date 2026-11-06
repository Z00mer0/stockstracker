import { describe, it, expect } from 'vitest';
import { parseBigMoves } from './bigMovesLink.js';

describe('parseBigMoves', () => {
  it('rozdziela wzrosty i spadki, od największego ruchu', () => {
    expect(parseBigMoves('?d=2026-11-06&m=XTB.WA:5.18,TMDX:19.65,AMD:-7.20,INTC:-8.80')).toEqual({
      date: '2026-11-06',
      up: [{ symbol: 'TMDX', pct: 19.65 }, { symbol: 'XTB.WA', pct: 5.18 }],
      down: [{ symbol: 'INTC', pct: -8.8 }, { symbol: 'AMD', pct: -7.2 }],
    });
  });

  it('pomija zepsute wpisy i złą datę', () => {
    expect(parseBigMoves('?d=jutro&m=,AAPL,:5,BRK.B:x,MSFT:6')).toEqual({ date: null, up: [{ symbol: 'MSFT', pct: 6 }], down: [] });
  });
});
