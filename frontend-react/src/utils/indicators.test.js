import { describe, it, expect } from 'vitest';
import { calcMA, calcEMA, calcRSI, calcMACD, calcBollingerBands } from './indicators.js';
import ref from './indicators.fixture.json';

// ref: te same wskaźniki policzone niezależną implementacją w Pythonie
// (indicators.fixture.py) na 80 syntetycznych cenach.
const close = (a, b) => a.forEach((v, i) => (b[i] == null ? expect(v).toBeNull() : expect(v).toBeCloseTo(b[i], 9)));

describe('wskaźniki vs niezależna implementacja', () => {
  const c = ref.closes;
  it('MA20', () => close(calcMA(c, 20), ref.ma20));
  it('EMA21 (start od SMA)', () => close(calcEMA(c, 21), ref.ema21));
  it('RSI14 (Wilder)', () => close(calcRSI(c, 14), ref.rsi));
  it('MACD 12/26 i sygnał 9', () => {
    const m = calcMACD(c);
    close(m.macd, ref.macd);
    close(m.signal, ref.signal);
    m.histogram.forEach((h, i) => (h == null ? expect(ref.signal[i]).toBeNull() : expect(h).toBeCloseTo(ref.macd[i] - ref.signal[i], 9)));
  });
  it('Bollinger 20/2 — górna wstęga', () => close(calcBollingerBands(c).map(b => b.upper), ref.bbUpper));
});

describe('przypadki liczone ręcznie', () => {
  it('MA3 z 1..5', () => expect(calcMA([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]));
  it('EMA3: start 2, potem 4·½ + 2·½ = 3', () => expect(calcEMA([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]));
  it('RSI przy samych wzrostach = 100, przy samych spadkach = 0', () => {
    expect(calcRSI(Array.from({ length: 16 }, (_, i) => i), 14)[15]).toBeCloseTo(100, 6);
    expect(calcRSI(Array.from({ length: 16 }, (_, i) => 50 - i), 14)[15]).toBeCloseTo(0, 6);
  });
  it('Bollinger przy stałej cenie: wstęgi = średnia', () => {
    const b = calcBollingerBands(Array(20).fill(7))[19];
    expect(b).toEqual({ upper: 7, middle: 7, lower: 7 });
  });
});
